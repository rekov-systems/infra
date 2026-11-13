import json
import uuid
from decimal import Decimal

import frappe
import requests


JCFLOW_URL = "https://api.jcflow.com.co"
JCFLOW_INVOICE_ENDPOINT = f"{JCFLOW_URL}/v1/api/facturacion-es/factura"


def _money(value):
    return f"{Decimal(str(value or 0)):.2f}"


def get_company_credentials(company_config):
    api_key = company_config.get_password("api_key")
    return {"api_key": api_key} if api_key else None


def _customer_payload(customer_name):
    customer = frappe.get_doc("Customer", customer_name)
    address = {}
    if customer.get("customer_primary_address"):
        address = frappe.db.get_value(
            "Address",
            customer.customer_primary_address,
            ["address_line1", "city", "phone"],
            as_dict=True,
        ) or {}
    return {
        "nombre": customer.get("customer_name") or customer.name,
        "numero_identificacion": customer.get("tax_id") or customer.name,
        "correo": customer.get("email_id") or "",
        "telefono": customer.get("mobile_no") or customer.get("phone") or address.get("phone") or "",
        "direccion": customer.get("custom_fiscal_address") or address.get("address_line1") or "",
    }


def _item_tax_rate(item):
    raw = item.get("item_tax_rate") or "{}"
    try:
        rates = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError):
        rates = {}
    for rate in rates.values():
        try:
            return float(Decimal(str(rate)))
        except Exception:
            continue
    return 0


def build_invoice_payload(invoice):
    return {
        "cliente": _customer_payload(invoice.customer),
        "lineas": [
            {
                "descripcion": item.description or item.item_name,
                "cantidad": float(item.qty),
                "precio_unitario": float(item.rate),
                "iva_porcentaje": _item_tax_rate(item),
            }
            for item in invoice.items
        ],
        "observaciones": invoice.get("remarks") or "",
        "transmitir": True,
    }


def _company_config(company):
    name = frappe.db.get_value("JCFlow Company", {"company": company, "enabled": 1}, "name")
    return frappe.get_doc("JCFlow Company", name) if name else None


def create_transmission_log(invoice, settings):
    company_config = _company_config(invoice.company)
    if not company_config:
        frappe.throw(f"No JCFlow configuration is enabled for company {invoice.company}.")
    existing = frappe.db.exists("JCFlow Transmission Log", {"sales_invoice": invoice.name})
    if existing:
        return frappe.get_doc("JCFlow Transmission Log", existing)
    log = frappe.get_doc(
        {
            "doctype": "JCFlow Transmission Log",
            "sales_invoice": invoice.name,
            "company": invoice.company,
            "status": "Pending",
            "idempotency_key": str(uuid.uuid4()),
            "request_json": json.dumps(build_invoice_payload(invoice), default=str),
        }
    )
    log.insert(ignore_permissions=True)
    return log


def _response_data(result):
    data = result.get("data") if isinstance(result, dict) else {}
    return data if isinstance(data, dict) else result


def transmit_log(log_name):
    log = frappe.get_doc("JCFlow Transmission Log", log_name)
    settings = frappe.get_single("JCFlow Settings")
    company_config = _company_config(log.company)
    credentials = get_company_credentials(company_config) if company_config else None
    if not settings.enabled or not credentials:
        log.status = "Paused"
        log.error_message = "JCFlow is disabled or this company has no API key configured."
        log.save(ignore_permissions=True)
        return

    invoice = frappe.get_doc("Sales Invoice", log.sales_invoice)
    payload = build_invoice_payload(invoice)
    response = requests.post(
        JCFLOW_INVOICE_ENDPOINT,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Api-Key": credentials["api_key"],
            "Idempotency-Key": log.idempotency_key or str(uuid.uuid4()),
        },
        json=payload,
        timeout=60,
    )
    log.attempts = (log.attempts or 0) + 1
    log.http_status = response.status_code
    log.response_json = response.text
    if response.ok:
        result = response.json()
        data = _response_data(result)
        links = data.get("links") or data.get("archivos") or {}
        log.status = "Accepted"
        log.provider_number = data.get("number") or result.get("number")
        log.cufe = data.get("cufe") or result.get("cufe")
        log.public_url = links.get("public_url")
        log.qr_url = links.get("qr") or links.get("qr_url") or links.get("qr_data")
        log.pdf_url = links.get("pdf_url")
        log.xml_url = links.get("xml_url")
        log.error_message = None
    else:
        log.status = "Failed"
        log.error_message = response.text[:2000]
    log.save(ignore_permissions=True)


@frappe.whitelist()
def test_api_key(company_config):
    config = frappe.get_doc("JCFlow Company", company_config)
    credentials = get_company_credentials(config)
    if not credentials:
        frappe.throw("Enter the JCFlow API key first.")
    response = requests.get(
        f"{JCFLOW_URL}/v1/api/api-keys/test",
        headers={"Accept": "application/json", "X-Api-Key": credentials["api_key"]},
        timeout=30,
    )
    if not response.ok:
        frappe.throw(f"JCFlow rejected the API key ({response.status_code}): {response.text[:500]}")
    return response.json()


@frappe.whitelist()
def queue_sales_invoice(sales_invoice):
    invoice = frappe.get_doc("Sales Invoice", sales_invoice)
    if invoice.docstatus != 1:
        frappe.throw("Only submitted Sales Invoices can be sent to JCFlow.")
    settings = frappe.get_single("JCFlow Settings")
    if not settings.enabled:
        frappe.throw("Enable JCFlow Settings first.")
    company_config = _company_config(invoice.company)
    if not company_config or not get_company_credentials(company_config):
        frappe.throw("This ERPNext Company has no JCFlow API key configured.")
    log = create_transmission_log(invoice, settings)
    frappe.enqueue(
        "rekov_jcflow.services.jcflow.transmit_log",
        queue="short",
        enqueue_after_commit=True,
        job_name=f"jcflow:{invoice.name}",
        log_name=log.name,
    )
    return log.name

import json

import frappe
import requests

from rekov_jcflow.rekov_jcflow.doctype.jcflow_settings.jcflow_settings import get_api_key

JCFlowEndpoint = "https://api.jcflow.com.co/v1/api/documentos/factura"


def build_invoice_payload(invoice):
    """Build the provider-neutral first payload from a submitted Sales Invoice."""
    customer_tax_id = frappe.db.get_value("Customer", invoice.get("customer"), "tax_id")
    return {
        "cliente": {
            "numero_documento": customer_tax_id or invoice.get("customer"),
            "tipo_documento": "NIT",
            "razon_social": invoice.get("customer_name") or invoice.get("customer"),
            "email": invoice.get("contact_email"),
        },
        "lineas": [
            {
                "codigo": item.get("item_code"),
                "descripcion": item.get("description") or item.get("item_name"),
                "cantidad": item.get("qty"),
                "precio_unitario": item.get("rate"),
                "iva_porcentaje": item.get("iva_porcentaje", 0),
            }
            for item in invoice.get("items", [])
        ],
        "numero": invoice.get("name"),
        "fecha": invoice.get("posting_date"),
        "moneda": invoice.get("currency"),
        "subtotal": invoice.get("net_total"),
        "total": invoice.get("grand_total"),
    }


def create_transmission_log(invoice, settings):
    company_config = frappe.db.get_value(
        "JCFlow Company",
        {"company": invoice.company, "enabled": 1},
        ["name"],
        as_dict=True,
    )
    if not company_config:
        frappe.throw(
            f"JCFlow is not configured for ERPNext Company '{invoice.company}'."
        )

    existing = frappe.db.exists(
        "JCFlow Transmission Log",
        {"sales_invoice": invoice.name},
    )
    if existing:
        return frappe.get_doc("JCFlow Transmission Log", existing)

    payload = build_invoice_payload(invoice)
    log = frappe.get_doc(
        {
            "doctype": "JCFlow Transmission Log",
            "sales_invoice": invoice.name,
            "company": invoice.company,
            "environment": settings.environment,
            "status": "Pending",
            "request_json": json.dumps(payload, default=str),
        }
    )
    log.insert(ignore_permissions=True)
    return log


def transmit_log(log_name):
    log = frappe.get_doc("JCFlow Transmission Log", log_name)
    settings = frappe.get_single("JCFlow Settings")

    company_config = frappe.db.get_value(
        "JCFlow Company",
        {"company": log.company, "enabled": 1},
        ["name"],
        as_dict=True,
    )

    api_key = get_api_key()
    if not settings.enabled or not api_key:
        log.status = "Paused"
        log.error_message = "JCFlow is disabled or the Rekov server secret is missing."
        log.save(ignore_permissions=True)
        return

    if not company_config:
        log.status = "Paused"
        log.error_message = "This company has no JCFlow configuration."
        log.save(ignore_permissions=True)
        return

    if log.environment != settings.environment:
        log.status = "Blocked"
        log.error_message = "The log environment differs from current tenant settings."
        log.save(ignore_permissions=True)
        return

    try:
        response = requests.post(
            JCFlowEndpoint,
            headers={
                "X-Api-Key": api_key,
                "Content-Type": "application/json",
            },
            data=log.request_json,
            timeout=30,
        )
        response_data = response.json()
        log.response_json = json.dumps(response_data, default=str)
        log.http_status = response.status_code
        log.attempts = (log.attempts or 0) + 1

        if response.ok and response_data.get("success"):
            log.status = "Accepted"
            data = response_data.get("data", response_data)
            log.cufe = data.get("cufe")
            files = data.get("archivos", data)
            log.pdf_url = files.get("pdf_url")
            log.xml_url = files.get("xml_url")
        else:
            log.status = "Failed"
            log.error_message = (
                response_data.get("message")
                or response_data.get("mensaje")
                or response.text[:1000]
            )
    except Exception:
        log.status = "Failed"
        log.attempts = (log.attempts or 0) + 1
        log.error_message = frappe.get_traceback()[-2000:]

    log.save(ignore_permissions=True)


@frappe.whitelist()
def queue_sales_invoice(sales_invoice):
    invoice = frappe.get_doc("Sales Invoice", sales_invoice)
    if invoice.docstatus != 1:
        frappe.throw("Only submitted Sales Invoices can be sent to JCFlow.")

    settings = frappe.get_single("JCFlow Settings")
    if not settings.enabled or not get_api_key():
        frappe.throw("JCFlow is disabled or its Rekov server secret is missing.")

    log = create_transmission_log(invoice, settings)
    frappe.enqueue(
        "rekov_jcflow.services.jcflow.transmit_log",
        queue="short",
        enqueue_after_commit=True,
        job_name=f"jcflow:{invoice.name}",
        log_name=log.name,
    )
    return log.name

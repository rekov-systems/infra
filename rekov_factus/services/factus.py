import json
from decimal import Decimal

import frappe
import requests

SANDBOX_URL = "https://api-sandbox.factus.com.co"
PRODUCTION_URL = "https://api.factus.com.co"


def _money(value):
    return f"{Decimal(str(value or 0)):.2f}"


def get_company_credentials(company_config):
    values = {
        "client_id": company_config.client_id,
        "client_secret": company_config.get_password("client_secret"),
        "email": company_config.email,
        "password": company_config.get_password("password"),
    }
    return values if all(values.values()) else None


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
        "identification_document_code": customer.get("custom_identification_document_code") or "31",
        "identification": customer.get("tax_id") or customer.name,
        "company": customer.get("customer_name") or customer.name,
        "trade_name": customer.get("customer_name") or customer.name,
        "address": customer.get("custom_fiscal_address") or address.get("address_line1") or "",
        "email": customer.get("email_id") or "",
        "phone": customer.get("mobile_no") or customer.get("phone") or address.get("phone") or "",
        "legal_organization_code": customer.get("custom_legal_organization_code") or "1",
        "tribute_code": customer.get("custom_tribute_code") or "ZZ",
        "country_code": "CO",
        "municipality_code": customer.get("custom_municipality_code") or "",
    }


def _item_taxes(item):
    raw = item.get("item_tax_rate") or "{}"
    try:
        rates = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError):
        rates = {}
    taxes = []
    for rate in rates.values():
        try:
            rate = Decimal(str(rate))
        except Exception:
            continue
        if rate:
            taxes.append({"code": "01", "rate": f"{rate:.2f}"})
    return taxes


def build_invoice_payload(invoice, company_config):
    payment = (invoice.get("payment_schedule") or [{}])[0]
    payment_form = "2" if payment.get("due_date") else "1"
    payment_method = invoice.get("mode_of_payment") or "42"
    payment_method_code = {
        "Cash": "10",
        "Bank Draft": "42",
        "Credit Card": "48",
        "Debit Card": "49",
    }.get(payment_method, "42")

    return {
        "reference_code": invoice.name,
        "document": "01",
        "numbering_range_id": company_config.numbering_range_id,
        "operation_type": "10",
        "send_email": False,
        "payment_details": [
            {
                "payment_form": payment_form,
                "payment_method_code": payment_method_code,
                "reference_code": invoice.name,
                "amount": _money(invoice.grand_total),
                **({"due_date": payment.due_date} if payment.get("due_date") else {}),
            }
        ],
        "cash_rounding_amount": "0.00",
        "observation": invoice.get("remarks") or "",
        "customer": _customer_payload(invoice.customer),
        "items": [
            {
                "code_reference": item.item_code or item.item_name,
                "name": item.description or item.item_name,
                "quantity": _money(item.qty),
                "discount_rate": _money(item.discount_percentage),
                "price": _money(item.rate),
                "unit_measure_code": "94",
                "standard_code": "999",
                "taxes": _item_taxes(item),
            }
            for item in invoice.items
        ],
    }


def create_transmission_log(invoice, settings):
    company_config = frappe.get_doc(
        "Factus Company", {"company": invoice.company, "enabled": 1}
    )
    existing = frappe.db.exists("Factus Transmission Log", {"sales_invoice": invoice.name})
    if existing:
        return frappe.get_doc("Factus Transmission Log", existing)
    log = frappe.get_doc(
        {
            "doctype": "Factus Transmission Log",
            "sales_invoice": invoice.name,
            "company": invoice.company,
            "environment": company_config.environment,
            "status": "Pending",
            "request_json": json.dumps(
                build_invoice_payload(invoice, company_config), default=str
            ),
        }
    )
    log.insert(ignore_permissions=True)
    return log


def get_access_token(environment, credentials):
    if not credentials:
        return None
    base_url = SANDBOX_URL if environment == "Sandbox" else PRODUCTION_URL
    response = requests.post(
        f"{base_url}/oauth/token",
        headers={"Accept": "application/json"},
        data={
            "grant_type": "password",
            "client_id": credentials["client_id"],
            "client_secret": credentials["client_secret"],
            "username": credentials["email"],
            "password": credentials["password"],
        },
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def transmit_log(log_name):
    log = frappe.get_doc("Factus Transmission Log", log_name)
    settings = frappe.get_single("Factus Settings")
    company_config = frappe.get_doc(
        "Factus Company", {"company": log.company, "enabled": 1}
    )
    credentials = get_company_credentials(company_config)
    if not settings.enabled or not credentials:
        log.status = "Paused"
        log.error_message = "Factus is disabled or server credentials are missing."
        log.save(ignore_permissions=True)
        return

    invoice = frappe.get_doc("Sales Invoice", log.sales_invoice)
    token = get_access_token(log.environment, credentials)
    base_url = SANDBOX_URL if log.environment == "Sandbox" else PRODUCTION_URL
    response = requests.post(
        f"{base_url}/v2/bills/validate",
        headers={"Accept": "application/json", "Authorization": f"Bearer {token}"},
        json=build_invoice_payload(invoice, company_config),
        timeout=60,
    )
    log.attempts = (log.attempts or 0) + 1
    log.http_status = response.status_code
    log.response_json = response.text
    if response.ok:
        result = response.json()
        data = result.get("data", {})
        links = data.get("links", {})
        log.status = "Accepted"
        log.factus_number = data.get("number")
        log.cufe = data.get("cufe")
        log.public_url = links.get("public_url")
        log.qr_url = links.get("qr")
        if log.factus_number:
            log.pdf_url = f"{base_url}/v2/bills/{log.factus_number}/download-pdf"
            log.xml_url = f"{base_url}/v2/bills/{log.factus_number}/download-xml"
        log.error_message = None
    else:
        log.status = "Failed"
        log.error_message = response.text[:2000]
    log.save(ignore_permissions=True)


@frappe.whitelist()
def queue_sales_invoice(sales_invoice):
    invoice = frappe.get_doc("Sales Invoice", sales_invoice)
    if invoice.docstatus != 1:
        frappe.throw("Only submitted Sales Invoices can be sent to Factus.")
    settings = frappe.get_single("Factus Settings")
    if not settings.enabled:
        frappe.throw("Factus is disabled in Factus Settings.")
    company_config = frappe.get_doc(
        "Factus Company", {"company": invoice.company, "enabled": 1}
    )
    if not get_company_credentials(company_config):
        frappe.throw("This ERPNext Company has no Factus credentials configured.")
    log = create_transmission_log(invoice, settings)
    frappe.enqueue(
        "rekov_factus.services.factus.transmit_log",
        queue="short",
        enqueue_after_commit=True,
        job_name=f"factus:{invoice.name}",
        log_name=log.name,
    )
    return log.name

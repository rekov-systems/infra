import json
import uuid
from decimal import Decimal

import frappe
import requests


JCFLOW_URL = "https://api.jcflow.com.co"
DOCUMENT_ENDPOINTS = {
    "factura": "/v1/api/facturacion-es/factura",
    "nota_credito": "/v1/api/facturacion-es/nota-credito",
    "nota_debito": "/v1/api/facturacion-es/nota-debito",
    "documento_soporte": "/v1/api/facturacion-es/documento-soporte",
    "nota_ajuste_ds": "/v1/api/facturacion-es/nota-ajuste-ds",
    "exportacion": "/v1/api/facturacion-es/exportacion",
    "pos": "/v1/api/facturacion-es/pos",
    "nota_ajuste_pos": "/v1/api/facturacion-es/nota-ajuste-pos",
}
RADIAN_ENDPOINTS = {
    "acuse_recibo": "/v1/api/eventos/acuse-recibo",
    "reclamo": "/v1/api/eventos/reclamo",
    "recibo_bien": "/v1/api/eventos/recibo-bien",
    "aceptacion_expresa": "/v1/api/eventos/aceptacion-expresa",
    "aceptacion_tacita": "/v1/api/eventos/aceptacion-tacita",
}


def _money(value):
    return f"{Decimal(str(value or 0)):.2f}"


def get_company_credentials(company_config):
    api_key = company_config.get_password("api_key")
    return {"api_key": api_key} if api_key else None


def _company_config(company):
    name = frappe.db.get_value("JCFlow Company", {"company": company, "enabled": 1}, "name")
    return frappe.get_doc("JCFlow Company", name) if name else None


def _party_payload(doc):
    party_type = "supplier" if doc.doctype == "Purchase Invoice" else "customer"
    party_name = doc.get(party_type)
    party = frappe.get_doc("Supplier" if party_type == "supplier" else "Customer", party_name)
    email = party.get("email_id") or ""
    phone = party.get("mobile_no") or party.get("phone") or ""
    address_name = party.get("supplier_primary_address" if party_type == "supplier" else "customer_primary_address")
    address = frappe.db.get_value("Address", address_name, ["address_line1", "phone"], as_dict=True) if address_name else {}
    return {
        "nombre": party.get("supplier_name" if party_type == "supplier" else "customer_name") or party.name,
        "numero_identificacion": party.get("tax_id") or party.name,
        "correo": email,
        "telefono": phone or (address or {}).get("phone", ""),
        "direccion": party.get("custom_fiscal_address") or (address or {}).get("address_line1", ""),
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


def document_type_for(doc):
    if doc.doctype == "POS Invoice":
        if doc.get("is_return"):
            return "nota_ajuste_pos"
        return "pos"
    if doc.doctype == "Purchase Invoice":
        if doc.get("is_return"):
            return "nota_ajuste_ds"
        return "documento_soporte"
    if doc.doctype == "Sales Invoice":
        if doc.get("is_return"):
            return "nota_credito"
        if doc.get("is_debit_note"):
            return "nota_debito"
        return "factura"
    frappe.throw(f"JCFlow does not have a document mapping for {doc.doctype}.")


def build_document_payload(doc, document_type):
    payload = {
        "cliente": _party_payload(doc),
        "lineas": [
            {
                "descripcion": item.description or item.item_name,
                "cantidad": float(item.qty),
                "precio": float(item.rate),
                "iva": _item_tax_rate(item),
            }
            for item in doc.items
        ],
        "observaciones": doc.get("remarks") or "",
        "transmitir": True,
    }
    if document_type in {"nota_credito", "nota_debito", "nota_ajuste_ds", "nota_ajuste_pos"}:
        original = doc.get("return_against") or doc.get("against_sales_invoice")
        if not original:
            frappe.throw("The note must reference the original Sales Invoice.")
        original_log = frappe.db.get_value(
            "JCFlow Transmission Log",
            {"source_doctype": "Sales Invoice", "source_name": original, "status": "Accepted"},
            ["provider_id", "provider_number"],
            as_dict=True,
        )
        provider_reference = (original_log or {}).get("provider_id")
        if not provider_reference:
            frappe.throw("The original invoice has no JCFlow document ID for this note.")
        payload["documento_referencia"] = provider_reference
        payload["concepto_nota"] = "2" if document_type == "nota_credito" else "1"
    return payload


def _response_data(result):
    data = result.get("data") if isinstance(result, dict) else {}
    return data if isinstance(data, dict) else result


def create_transmission_log(doc, document_type=None):
    document_type = document_type or document_type_for(doc)
    company_config = _company_config(doc.company)
    if not company_config:
        frappe.throw(f"No JCFlow configuration is enabled for company {doc.company}.")
    existing = frappe.db.exists(
        "JCFlow Transmission Log",
        {"source_doctype": doc.doctype, "source_name": doc.name, "document_type": document_type},
    )
    if existing:
        return frappe.get_doc("JCFlow Transmission Log", existing)
    log = frappe.get_doc(
        {
            "doctype": "JCFlow Transmission Log",
            "source_doctype": doc.doctype,
            "source_name": doc.name,
            "sales_invoice": doc.name if doc.doctype == "Sales Invoice" else None,
            "company": doc.company,
            "document_type": document_type,
            "status": "Pending",
            "idempotency_key": str(uuid.uuid4()),
            "request_json": json.dumps(build_document_payload(doc, document_type), default=str),
        }
    )
    log.insert(ignore_permissions=True)
    return log


def _send_acceptance_email(doc, log, settings):
    if not settings.send_email_after_acceptance or log.email_sent:
        return
    party_field = "supplier" if doc.doctype == "Purchase Invoice" else "customer"
    party_type = "Supplier" if party_field == "supplier" else "Customer"
    party = frappe.get_doc(party_type, doc.get(party_field))
    recipient = party.get("email_id")
    if not recipient:
        return
    links = [link for link in (log.public_url, log.pdf_url, log.xml_url) if link]
    message = [
        f"El documento {doc.name} fue aceptado por JCFlow.",
        f"Tipo: {log.document_type}",
        f"CUFE/CUDE: {log.cufe or 'Pendiente de respuesta'}",
    ]
    if links:
        message.append("Documentos:\n" + "\n".join(links))
    frappe.sendmail(
        recipients=[recipient],
        subject=f"Documento electrónico {doc.name}",
        message="\n\n".join(message),
        reference_doctype=doc.doctype,
        reference_name=doc.name,
    )
    log.email_sent = 1


def transmit_log(log_name):
    log = frappe.get_doc("JCFlow Transmission Log", log_name)
    settings = frappe.get_single("JCFlow Settings")
    doc = frappe.get_doc(log.source_doctype, log.source_name)
    company_config = _company_config(log.company)
    credentials = get_company_credentials(company_config) if company_config else None
    if not settings.enabled or not credentials:
        log.status = "Paused"
        log.error_message = "JCFlow is disabled or this company has no API key configured."
        log.save(ignore_permissions=True)
        return
    payload = build_document_payload(doc, log.document_type)
    endpoint = DOCUMENT_ENDPOINTS[log.document_type]
    response = requests.post(
        f"{JCFLOW_URL}{endpoint}",
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
        log.provider_id = data.get("id") or data.get("document_id") or result.get("id")
        log.provider_number = data.get("number") or result.get("number")
        log.cufe = data.get("cufe") or data.get("cude") or result.get("cufe") or result.get("cude")
        log.public_url = links.get("public_url")
        log.qr_url = links.get("qr") or links.get("qr_url") or links.get("qr_data")
        log.pdf_url = links.get("pdf_url")
        log.xml_url = links.get("xml_url")
        log.error_message = None
        try:
            _send_acceptance_email(doc, log, settings)
        except Exception:
            frappe.log_error(frappe.get_traceback(), "JCFlow acceptance email")
            log.error_message = "JCFlow accepted the document, but the ERPNext email could not be queued."
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
def queue_document(source_doctype, source_name, document_type=None):
    doc = frappe.get_doc(source_doctype, source_name)
    if doc.docstatus != 1:
        frappe.throw("Only submitted documents can be sent to JCFlow.")
    settings = frappe.get_single("JCFlow Settings")
    if not settings.enabled:
        frappe.throw("Enable JCFlow Settings first.")
    company_config = _company_config(doc.company)
    if not company_config or not get_company_credentials(company_config):
        frappe.throw("This ERPNext Company has no JCFlow API key configured.")
    allowed_types = set(DOCUMENT_ENDPOINTS)
    if document_type and document_type not in allowed_types:
        frappe.throw(f"Unsupported JCFlow document type: {document_type}")
    log = create_transmission_log(doc, document_type or document_type_for(doc))
    frappe.enqueue(
        "rekov_jcflow.services.jcflow.transmit_log",
        queue="short",
        enqueue_after_commit=True,
        job_name=f"jcflow:{doc.doctype}:{doc.name}",
        log_name=log.name,
    )
    return log.name


@frappe.whitelist()
def queue_sales_invoice(sales_invoice):
    return queue_document("Sales Invoice", sales_invoice)


@frappe.whitelist()
def queue_radian_event(source_name, event_type, cufe, motivo=None, notes=None):
    if event_type not in RADIAN_ENDPOINTS:
        frappe.throw("Unsupported RADIAN event.")
    purchase_invoice = frappe.get_doc("Purchase Invoice", source_name)
    if purchase_invoice.docstatus != 1:
        frappe.throw("Only submitted Purchase Invoices can send RADIAN events.")
    config = _company_config(purchase_invoice.company)
    if not config or not get_company_credentials(config):
        frappe.throw("This ERPNext Company has no JCFlow API key configured.")
    log = frappe.get_doc({
        "doctype": "JCFlow Event Log",
        "source_doctype": "Purchase Invoice",
        "source_name": purchase_invoice.name,
        "company": purchase_invoice.company,
        "event_type": event_type,
        "cufe": cufe,
        "status": "Pending",
    })
    log.insert(ignore_permissions=True)
    frappe.enqueue(
        "rekov_jcflow.services.jcflow.transmit_radian_event",
        queue="short",
        enqueue_after_commit=True,
        job_name=f"jcflow:radian:{purchase_invoice.name}:{event_type}",
        log_name=log.name,
        motivo=motivo,
        notes=notes,
    )
    return log.name


def transmit_radian_event(log_name, motivo=None, notes=None):
    log = frappe.get_doc("JCFlow Event Log", log_name)
    config = _company_config(log.company)
    credentials = get_company_credentials(config) if config else None
    if not credentials:
        log.status = "Failed"
        log.error_message = "No JCFlow API key configured."
        log.save(ignore_permissions=True)
        return
    payload = {"cufe": log.cufe}
    if motivo:
        payload["motivo"] = motivo
    if notes:
        payload["notes"] = notes
    response = requests.post(
        f"{JCFLOW_URL}{RADIAN_ENDPOINTS[log.event_type]}",
        headers={"Accept": "application/json", "Content-Type": "application/json", "X-Api-Key": credentials["api_key"]},
        json=payload,
        timeout=60,
    )
    log.response_json = response.text
    log.status = "Accepted" if response.ok else "Failed"
    if not response.ok:
        log.error_message = response.text[:2000]
    log.save(ignore_permissions=True)

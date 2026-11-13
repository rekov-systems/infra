import frappe

from rekov_jcflow.services.jcflow import (
    create_transmission_log,
    document_type_for,
    get_company_credentials,
)


def on_submit(doc, method=None):
    """Capture submitted invoices without changing ERPNext's document."""
    if not frappe.db.exists("DocType", "JCFlow Settings"):
        return

    settings = frappe.get_single("JCFlow Settings")
    company_config = frappe.db.get_value(
        "JCFlow Company", {"company": doc.company, "enabled": 1}, "name"
    )
    if not settings.enabled or not company_config:
        return
    if not get_company_credentials(frappe.get_doc("JCFlow Company", company_config)):
        return

    log = create_transmission_log(doc, document_type_for(doc))

    if settings.send_automatically:
        frappe.enqueue(
            "rekov_jcflow.services.jcflow.transmit_log",
            queue="short",
            enqueue_after_commit=True,
            job_name=f"jcflow:{doc.name}",
            log_name=log.name,
        )

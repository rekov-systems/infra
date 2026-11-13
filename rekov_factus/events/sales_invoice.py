import frappe

from rekov_factus.services.factus import create_transmission_log, get_company_credentials


def on_submit(doc, method=None):
    """Capture submitted invoices without changing ERPNext's document."""
    if not frappe.db.exists("DocType", "Factus Settings"):
        return

    settings = frappe.get_single("Factus Settings")
    company_config = frappe.db.get_value(
        "Factus Company", {"company": doc.company, "enabled": 1}, "name"
    )
    if not settings.enabled or not company_config:
        return
    if not get_company_credentials(frappe.get_doc("Factus Company", company_config)):
        return

    log = create_transmission_log(doc, settings)

    if settings.send_automatically:
        frappe.enqueue(
            "rekov_factus.services.factus.transmit_log",
            queue="short",
            enqueue_after_commit=True,
            job_name=f"factus:{doc.name}",
            log_name=log.name,
        )

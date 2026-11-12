import frappe

from rekov_jcflow.services.jcflow import create_transmission_log


def on_submit(doc, method=None):
    """Capture submitted invoices without changing ERPNext's document."""
    if not frappe.db.exists("DocType", "JCFlow Settings"):
        return

    settings = frappe.get_single("JCFlow Settings")
    if not settings.enabled or not settings.api_key:
        return

    if not frappe.db.exists(
        "JCFlow Company", {"company": doc.company, "enabled": 1}
    ):
        return

    log = create_transmission_log(doc, settings)

    if settings.send_automatically:
        frappe.enqueue(
            "rekov_jcflow.services.jcflow.transmit_log",
            queue="short",
            enqueue_after_commit=True,
            job_name=f"jcflow:{doc.name}",
            log_name=log.name,
        )

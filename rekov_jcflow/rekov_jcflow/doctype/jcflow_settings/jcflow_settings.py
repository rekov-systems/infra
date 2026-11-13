import frappe
from frappe.model.document import Document


class JCFlowSettings(Document):
    pass


@frappe.whitelist()
def get_settings():
    """Return non-secret settings for the current tenant."""
    settings = frappe.get_single("JCFlow Settings")
    return {
        "enabled": bool(settings.enabled),
        "send_automatically": bool(settings.send_automatically),
        "send_email_after_acceptance": bool(settings.send_email_after_acceptance),
    }

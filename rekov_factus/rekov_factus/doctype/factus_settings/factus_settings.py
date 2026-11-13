import frappe
from frappe.model.document import Document


class FactusSettings(Document):
    pass


@frappe.whitelist()
def get_current_environment():
    """Return non-secret settings for the current tenant."""
    settings = frappe.get_single("Factus Settings")
    return {
        "enabled": bool(settings.enabled),
        "environment": settings.environment,
        "send_automatically": bool(settings.send_automatically),
    }

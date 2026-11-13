import frappe
from frappe.model.document import Document


class JCFlowSettings(Document):
    pass


def get_api_key():
    """Return the Rekov-managed key from server configuration only."""
    return frappe.conf.get("rekov_jcflow_api_key")


@frappe.whitelist()
def get_current_environment():
    """Return non-secret settings for the current tenant."""
    settings = frappe.get_single("JCFlow Settings")
    return {
        "enabled": bool(settings.enabled),
        "environment": settings.environment,
        "send_automatically": bool(settings.send_automatically),
    }

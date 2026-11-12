import frappe
from frappe.tests.utils import FrappeTestCase


class TestJCFlowSettings(FrappeTestCase):
    def test_settings_doctype_exists(self):
        self.assertTrue(frappe.db.exists("DocType", "JCFlow Settings"))

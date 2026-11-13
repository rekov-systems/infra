import frappe
from frappe.tests.utils import FrappeTestCase


class TestFactusSettings(FrappeTestCase):
    def test_settings_doctype_exists(self):
        self.assertTrue(frappe.db.exists("DocType", "Factus Settings"))

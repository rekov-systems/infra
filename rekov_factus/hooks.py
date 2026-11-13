app_name = "rekov_factus"
app_title = "Rekov Factus Multi-Company"
app_publisher = "Rekov Systems"
app_description = "Private Factus integration for Colombian electronic invoicing"
app_email = "admin@rekov.co"
app_license = "GPL-3.0-or-later"

app_version = "0.1.0"

doctype_js = {
    "Sales Invoice": "public/js/sales_invoice.js",
}

doc_events = {
    "Sales Invoice": {
        "on_submit": "rekov_factus.events.sales_invoice.on_submit",
    }
}

fixtures = [
    {"dt": "Custom Field", "filters": [["module", "=", "Rekov Factus"]]},
]

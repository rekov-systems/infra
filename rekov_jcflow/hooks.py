app_name = "rekov_jcflow"
app_title = "Rekov JCFlow Multi-Company"
app_publisher = "Rekov Systems"
app_description = "JCFlow integration for Colombian electronic invoicing"
app_email = "admin@rekov.co"
app_license = "GPL-3.0-or-later"

app_version = "0.1.0"

doctype_js = {
    "Sales Invoice": "public/js/sales_invoice.js",
    "JCFlow Company": "public/js/jcflow_company.js",
    "Purchase Invoice": "public/js/jcflow_documents.js",
    "POS Invoice": "public/js/jcflow_documents.js",
}

doc_events = {
    "Sales Invoice": {
        "on_submit": "rekov_jcflow.events.sales_invoice.on_submit",
    },
    "POS Invoice": {
        "on_submit": "rekov_jcflow.events.sales_invoice.on_submit",
    },
}

fixtures = [
    {"dt": "Custom Field", "filters": [["module", "=", "Rekov JCFlow"]]},
]

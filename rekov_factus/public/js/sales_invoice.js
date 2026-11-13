frappe.ui.form.on("Sales Invoice", {
  refresh(frm) {
    if (!frm.is_new() && frm.doc.docstatus === 1) {
      frm.add_custom_button(__("Factus"), () => {
        frappe.call({
          method: "rekov_factus.services.factus.queue_sales_invoice",
          args: { sales_invoice: frm.doc.name },
          freeze: true,
          freeze_message: __("Queueing invoice for Factus..."),
          callback(r) {
            if (r.message) {
              frappe.msgprint(__("Factus transmission queued: {0}", [r.message]));
              frm.reload_doc();
            }
          },
        });
      }, __("Electronic Invoicing"));
    }
  },
});

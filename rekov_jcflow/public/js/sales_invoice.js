frappe.ui.form.on("Sales Invoice", {
  refresh(frm) {
    if (!frm.is_new() && frm.doc.docstatus === 1) {
      frm.add_custom_button(__("JCFlow"), () => {
        frappe.call({
          method: "rekov_jcflow.services.jcflow.queue_sales_invoice",
          args: { sales_invoice: frm.doc.name },
          freeze: true,
          freeze_message: __("Queueing invoice for JCFlow..."),
          callback(r) {
            if (r.message) {
              frappe.msgprint(__("JCFlow transmission queued: {0}", [r.message]));
              frm.reload_doc();
            }
          },
        });
      }, __("Electronic Invoicing"));
    }
  },
});

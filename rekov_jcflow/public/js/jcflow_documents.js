function add_jcflow_button(frm, label) {
  if (frm.is_new() || frm.doc.docstatus !== 1) return;
  frm.add_custom_button(__(label), () => {
    frappe.call({
      method: "rekov_jcflow.services.jcflow.queue_document",
      args: { source_doctype: frm.doc.doctype, source_name: frm.doc.name },
      freeze: true,
      freeze_message: __("Queueing document for JCFlow..."),
      callback(r) {
        if (r.message) {
          frappe.msgprint(__("JCFlow transmission queued: {0}", [r.message]));
          frm.reload_doc();
        }
      },
    });
  }, __("Electronic Documents"));
}

frappe.ui.form.on("Purchase Invoice", {
  refresh(frm) {
    add_jcflow_button(frm, "Emit Documento Soporte");
    if (!frm.is_new() && frm.doc.docstatus === 1) {
      [
        ["acuse_recibo", "RADIAN: Acuse de recibo"],
        ["recibo_bien", "RADIAN: Recibo del bien"],
        ["aceptacion_expresa", "RADIAN: Aceptación expresa"],
        ["aceptacion_tacita", "RADIAN: Aceptación tácita"],
        ["reclamo", "RADIAN: Reclamo"],
      ].forEach(([eventType, label]) => {
        frm.add_custom_button(__(label), () => {
          frappe.prompt({
            fieldname: "cufe",
            label: "CUFE de la factura del proveedor",
            fieldtype: "Data",
            reqd: 1,
          }, (values) => {
            frappe.call({
              method: "rekov_jcflow.services.jcflow.queue_radian_event",
              args: { source_name: frm.doc.name, event_type: eventType, cufe: values.cufe },
              freeze: true,
              freeze_message: __("Queueing RADIAN event..."),
              callback(r) {
                if (r.message) frappe.msgprint(__("RADIAN event queued: {0}", [r.message]));
              },
            });
          }, __(label));
        }, __("RADIAN"));
      });
    }
  },
});

frappe.ui.form.on("POS Invoice", {
  refresh(frm) {
    add_jcflow_button(frm, "Emit POS Electrónico");
  },
});

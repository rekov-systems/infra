frappe.ui.form.on("JCFlow Company", {
  refresh(frm) {
    if (!frm.is_new() && frm.doc.api_key) {
      frm.add_custom_button(__("Test JCFlow API Key"), () => {
        frappe.call({
          method: "rekov_jcflow.services.jcflow.test_api_key",
          args: { company_config: frm.doc.name },
          freeze: true,
          freeze_message: __("Testing JCFlow API key..."),
          callback(r) {
            if (r.message?.success) {
              const company = r.message.data?.empresa;
              frappe.msgprint(
                __("JCFlow API key valid for {0} ({1}).", [
                  company?.razon_social || "the configured emitter",
                  company?.numero_identificacion || "NIT not returned",
                ])
              );
            }
          },
        });
      });
    }
  },
});

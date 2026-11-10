output "control_public_ip" { value = oci_core_instance.control.public_ip }
output "erp_public_ip" { value = contabo_instance.erp.ip_config[0].v4[0].ip }
output "press_url" { value = "https://${var.press_control_hostname}" }
output "erp_url" { value = "https://erp.${var.press_root_domain}" }

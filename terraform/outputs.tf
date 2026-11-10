output "control_public_ip" { value = oci_core_instance.control.public_ip }
output "erp_contabo_id" { value = contabo_instance.erp.id }
output "erp_contabo_status" { value = contabo_instance.erp.status }
output "erp_public_ip" { value = try(contabo_instance.erp.ip_config[0].v4[0].ip, "") }
output "press_url" { value = "https://${var.press_control_hostname}" }
output "tenant_wildcard" { value = "*.${var.press_root_domain}" }

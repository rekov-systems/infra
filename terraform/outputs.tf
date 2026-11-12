output "control_public_ip" { value = oci_core_instance.control.public_ip }
output "control_instance_id" { value = oci_core_instance.control.id }
output "pilot_url" { value = "https://${var.press_control_hostname}" }
output "tenant_wildcard" { value = "*.${var.press_root_domain}" }

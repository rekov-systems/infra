output "oci_pos_public_ip" { value = oci_core_instance.control.public_ip }
output "contabo_supabase_public_ip" { value = var.contabo_public_ip }
output "pos_url" { value = "https://${var.cloudflare_root_domain}" }
output "control_url" { value = "https://control.${var.cloudflare_root_domain}" }
output "supabase_url" { value = "https://api.${var.cloudflare_root_domain}" }

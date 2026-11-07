output "vcn_id" {
  value       = oci_core_vcn.this.id
  description = "OCID of the VCN."
}

output "subnet_id" {
  value       = oci_core_subnet.this.id
  description = "OCID of the subnet."
}

output "instance_id" {
  value       = oci_core_instance.this.id
  description = "OCID of the compute instance."
}

output "instance_private_ip" {
  value       = oci_core_instance.this.private_ip
  description = "Primary private IPv4 of the instance."
}

output "instance_public_ip" {
  value       = oci_core_instance.this.public_ip
  description = "Public IPv4 when assign_public_ip is true; otherwise null."
}

output "use_cloudflare_tunnel" {
  value       = var.use_cloudflare_tunnel
  description = "Whether the stack uses cloudflared (true) or public IP + nginx (false)."
}

output "app_hostname" {
  value       = var.tunnel_hostname
  description = "Public FQDN (Cloudflare DNS)."
}

output "cloudflare_tunnel_id" {
  value       = var.use_cloudflare_tunnel ? cloudflare_zero_trust_tunnel_cloudflared.this[0].id : null
  description = "Cloudflare Tunnel UUID when tunnel mode is enabled."
}

output "cloudflare_tunnel_hostname" {
  value       = var.tunnel_hostname
  description = "Deprecated alias for app_hostname."
}

output "cloudflare_dns_record_id" {
  value       = var.use_cloudflare_tunnel ? cloudflare_dns_record.tunnel[0].id : cloudflare_dns_record.app[0].id
  description = "Cloudflare DNS record id (A or tunnel CNAME)."
}

output "instance_source_image" {
  value       = data.oci_core_images.ol.images[0].display_name
  description = "Platform image used for the instance."
}

output "instance_login_user" {
  value       = var.instance_console_user
  description = "Default SSH/login user for the chosen OS image."
}

output "erpnext_container_image" {
  value       = var.erpnext_image
  description = "frappe/erpnext tag baked into cloud-init compose."
}

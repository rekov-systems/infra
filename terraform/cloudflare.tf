data "cloudflare_zone" "this" {
  zone_id = var.cloudflare_zone_id
}

locals {
  dns_record_name = trimsuffix(var.tunnel_hostname, ".${data.cloudflare_zone.this.name}")
}

# --- Public origin (A record → OCI public IP, orange-cloud) ---
resource "cloudflare_dns_record" "app" {
  count   = var.use_cloudflare_tunnel ? 0 : 1
  zone_id = var.cloudflare_zone_id
  name    = local.dns_record_name
  ttl     = 1
  type    = "A"
  proxied = true
  content = oci_core_instance.this.public_ip

  lifecycle {
    precondition {
      condition     = oci_core_instance.this.public_ip != ""
      error_message = "Instance has no public_ip; set assign_public_ip=true for public origin mode."
    }
  }
}

# --- Optional Zero Trust tunnel (legacy / private VM) ---
resource "cloudflare_zero_trust_tunnel_cloudflared" "this" {
  count      = var.use_cloudflare_tunnel ? 1 : 0
  account_id = var.cloudflare_account_id
  name       = var.tunnel_name
  config_src = "cloudflare"
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "this" {
  count      = var.use_cloudflare_tunnel ? 1 : 0
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.this[0].id

  config = {
    ingress = [
      {
        hostname = var.tunnel_hostname
        service  = var.origin_service_url
      },
      {
        service = "http_status:404"
      }
    ]
  }
}

data "cloudflare_zero_trust_tunnel_cloudflared_token" "this" {
  count      = var.use_cloudflare_tunnel ? 1 : 0
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.this[0].id
}

resource "cloudflare_dns_record" "tunnel" {
  count   = var.use_cloudflare_tunnel ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = local.dns_record_name
  ttl     = 1
  type    = "CNAME"
  proxied = true
  content = "${cloudflare_zero_trust_tunnel_cloudflared.this[0].id}.cfargotunnel.com"

  depends_on = [
    cloudflare_zero_trust_tunnel_cloudflared.this,
    cloudflare_zero_trust_tunnel_cloudflared_config.this
  ]
}

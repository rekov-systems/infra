# --- Oracle Cloud (API user key) ---
variable "tenancy_ocid" {
  type        = string
  description = "OCID of the tenancy."
}

variable "user_ocid" {
  type        = string
  description = "OCID of the API user."
}

variable "fingerprint" {
  type        = string
  description = "API key fingerprint for the user."
}

variable "private_key" {
  type        = string
  sensitive   = true
  description = "Private key PEM content for the API user (prefer TF_VAR_private_key)."
}

variable "oci_private_key_password" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Passphrase for the private key, if encrypted. Omit when not used."
}

variable "oci_region" {
  type        = string
  description = "OCI region, e.g. sa-bogota-1."
}

variable "compartment_ocid" {
  type        = string
  description = "Compartment OCID where resources are created."
}

variable "availability_domain_index" {
  type        = number
  default     = 0
  description = "Index into the tenancy's availability_domains list (0-based)."
}

variable "use_cloudflare_tunnel" {
  type        = bool
  default     = false
  description = "If true: private VM + cloudflared + CNAME tunnel. If false (default): public IP + nginx edge + proxied A record."
}

variable "assign_public_ip" {
  type        = bool
  default     = true
  description = "Public IPv4 on the VNIC. Required when use_cloudflare_tunnel is false. Set false only for private tunnel mode."
}

variable "delete_nat_gateway" {
  type        = bool
  default     = false
  description = "When assign_public_ip is true, set true only after a successful apply that already routes 0.0.0.0/0 via the internet gateway — then apply again to remove the unused NAT (avoids OCI 409 during tunnel→public migration)."
}

variable "ssh_public_key" {
  type        = string
  default     = ""
  description = "SSH public key for opc (cloud-init). Required when use_cloudflare_tunnel is false."
}

variable "ssh_ingress_cidrs" {
  type        = list(string)
  default     = []
  description = "CIDRs allowed for TCP/22. Empty in public origin mode opens SSH from 0.0.0.0/0 (opc + ssh_public_key only). Set e.g. [\"203.0.113.10/32\"] to restrict. Tunnel/private mode: empty = no SSH ingress."
}

variable "instance_console_user" {
  type        = string
  default     = "ubuntu"
  description = "Default login user for the image (ubuntu on Canonical Ubuntu, opc on Oracle Linux)."

  validation {
    condition     = can(regex("^[a-z_][a-z0-9_-]{0,31}$", var.instance_console_user))
    error_message = "instance_console_user must be a valid Linux login name (e.g. opc)."
  }
}

variable "instance_console_password" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Plaintext password for instance_console_user on first boot. Empty skips chpasswd. Pass via TF_VAR_instance_console_password (state may still record a hash of inputs depending on provider; treat as secret)."
}

# --- Shape / image ---
variable "instance_shape" {
  type        = string
  default     = "VM.Standard.A1.Flex"
  description = "Compute shape (Ampere A1.Flex is common for Always Free)."
}

variable "ocpus" {
  type        = number
  default     = 4
  description = "OCPU count for FLEX shapes."
}

variable "memory_in_gbs" {
  type        = number
  default     = 24
  description = "Memory in GB for FLEX shapes."
}

variable "os_name" {
  type        = string
  default     = "Canonical Ubuntu"
  description = "OCI platform image name. Always Free A1.Flex: Canonical Ubuntu (recommended) or Oracle Linux."
}

variable "os_version" {
  type        = string
  default     = "24.04"
  description = "OS version, e.g. 24.04 for Ubuntu or 9 for Oracle Linux."
}

# --- Cloudflare ---
variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  description = "API token with permissions for DNS + Tunnel (see README)."
}

variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID (32-char hex)."
}

variable "cloudflare_zone_id" {
  type        = string
  description = "Cloudflare zone ID for the domain already on Cloudflare."
}

variable "tunnel_name" {
  type        = string
  default     = ""
  description = "Cloudflare Tunnel name when use_cloudflare_tunnel is true."
}

variable "tunnel_hostname" {
  type        = string
  description = "FQDN under the Cloudflare zone, e.g. erp.example.com. Prefer a subdomain (apex is not handled specially)."
}

variable "frappe_site_name" {
  type        = string
  description = "ERPNext / Frappe site name; must match tunnel_hostname (same host header)."

  validation {
    condition     = var.frappe_site_name == var.tunnel_hostname
    error_message = "frappe_site_name must equal tunnel_hostname so the site host matches the public URL."
  }
}

variable "erpnext_image" {
  type        = string
  default     = "frappe/erpnext:v16.54.0"
  description = "frappe/erpnext image tag (arm64-compatible tags for Ampere)."
}

variable "erpnext_admin_password" {
  type        = string
  sensitive   = true
  description = "Initial ERPNext Administrator password (rotate after first login)."
}

variable "erpnext_mysql_root_password" {
  type        = string
  sensitive   = true
  description = "MariaDB root password for the ERPNext stack."
}

variable "origin_service_url" {
  type        = string
  default     = "http://127.0.0.1:8080"
  description = "cloudflared origin URL (HTTP(S) on localhost or Docker bridge). Example for ERPNext behind local nginx: http://127.0.0.1:8080"
}

variable "cloudflared_version" {
  type        = string
  default     = "2025.8.1"
  description = "cloudflared release tag; Linux installs the bare binary (cloudflared-linux-{arm64,amd64}) from GitHub releases."
}

check "public_origin_requirements" {
  assert {
    condition     = var.use_cloudflare_tunnel || (var.assign_public_ip && var.ssh_public_key != "")
    error_message = "Public origin mode requires assign_public_ip=true and a non-empty ssh_public_key."
  }
}

check "tunnel_mode_requirements" {
  assert {
    condition     = !var.use_cloudflare_tunnel || var.tunnel_name != ""
    error_message = "Tunnel mode requires tunnel_name."
  }
}

check "tunnel_mode_no_public_required" {
  assert {
    condition     = !var.use_cloudflare_tunnel || !var.assign_public_ip
    error_message = "Tunnel mode expects assign_public_ip=false (private instance + NAT)."
  }
}

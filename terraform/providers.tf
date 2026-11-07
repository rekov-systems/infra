provider "oci" {
  tenancy_ocid         = var.tenancy_ocid
  user_ocid            = var.user_ocid
  fingerprint          = var.fingerprint
  private_key          = var.private_key
  region               = var.oci_region
  private_key_password = var.oci_private_key_password != "" ? var.oci_private_key_password : null
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

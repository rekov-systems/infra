variable "tenancy_ocid" { type = string }
variable "user_ocid" { type = string }
variable "fingerprint" { type = string }
variable "private_key" {
  type      = string
  sensitive = true
}
variable "oci_region" { type = string }
variable "compartment_ocid" { type = string }
variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}
variable "cloudflare_zone_id" { type = string }
variable "ssh_public_key" { type = string }

variable "press_control_hostname" { type = string }
variable "press_root_domain" { type = string }

variable "availability_domain_index" {
  type    = number
  default = 0
}
variable "instance_shape" {
  type    = string
  default = "VM.Standard.A1.Flex"
}
variable "ocpus" {
  type    = number
  default = 2
}
variable "memory_in_gbs" {
  type    = number
  default = 12
}
variable "os_name" {
  type    = string
  default = "Canonical Ubuntu"
}
variable "os_version" {
  type    = string
  default = "24.04"
}

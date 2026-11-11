data "oci_identity_availability_domains" "this" {
  compartment_id = var.tenancy_ocid
}

data "oci_core_images" "ubuntu" {
  compartment_id           = var.compartment_ocid
  operating_system         = var.os_name
  operating_system_version = var.os_version
  shape                    = var.instance_shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

data "cloudflare_zone" "this" {
  zone_id = var.cloudflare_zone_id
}

locals {
  name         = "rekov"
  admin_record = trimsuffix(var.press_control_hostname, ".${var.press_root_domain}")
  erp_hostname = "erp.${var.press_root_domain}"
}

resource "terraform_data" "names" {
  input = local.erp_hostname
  lifecycle {
    precondition {
      condition     = data.cloudflare_zone.this.name == var.press_root_domain
      error_message = "PRESS_ROOT_DOMAIN must match the Cloudflare zone name."
    }
    precondition {
      condition     = var.press_control_hostname == "${local.admin_record}.${var.press_root_domain}" && local.admin_record != "" && local.admin_record != var.press_control_hostname
      error_message = "PRESS_CONTROL_HOSTNAME must be a subdomain of PRESS_ROOT_DOMAIN."
    }
  }
}

resource "oci_core_vcn" "this" {
  compartment_id = var.compartment_ocid
  cidr_blocks    = ["10.0.0.0/16"]
  display_name   = "${local.name}-vcn"
  dns_label      = "rekvcn"
}

resource "oci_core_internet_gateway" "this" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${local.name}-igw"
  enabled        = true
}

resource "oci_core_route_table" "public" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${local.name}-rt"
  route_rules {
    destination       = "0.0.0.0/0"
    network_entity_id = oci_core_internet_gateway.this.id
  }
}

resource "oci_core_security_list" "this" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${local.name}-sl"
  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }
  dynamic "ingress_security_rules" {
    for_each = ["22", "80", "443"]
    content {
      protocol = "6"
      source   = "0.0.0.0/0"
      tcp_options {
        min = tonumber(ingress_security_rules.value)
        max = tonumber(ingress_security_rules.value)
      }
    }
  }
}

resource "oci_core_subnet" "this" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.this.id
  cidr_block                 = "10.0.1.0/24"
  route_table_id             = oci_core_route_table.public.id
  security_list_ids          = [oci_core_security_list.this.id]
  display_name               = "${local.name}-subnet"
  dns_label                  = "reksub"
  prohibit_public_ip_on_vnic = false
}

resource "oci_core_instance" "control" {
  availability_domain = data.oci_identity_availability_domains.this.availability_domains[var.availability_domain_index].name
  compartment_id      = var.compartment_ocid
  display_name        = "${local.name}-control"
  shape               = var.instance_shape
  shape_config {
    ocpus         = var.ocpus
    memory_in_gbs = var.memory_in_gbs
  }
  source_details {
    source_id   = data.oci_core_images.ubuntu.images[0].id
    source_type = "image"
  }
  create_vnic_details {
    subnet_id        = oci_core_subnet.this.id
    assign_public_ip = true
  }
  metadata = { ssh_authorized_keys = var.ssh_public_key }
  agent_config {
    are_all_plugins_disabled = false
    is_management_disabled   = false
    plugins_config {
      name          = "Compute Instance Run Command"
      desired_state = "ENABLED"
    }
  }
  lifecycle {
    ignore_changes  = [metadata, source_details]
    prevent_destroy = true
  }
}

resource "contabo_instance" "erp" {
  display_name = "${local.name}-erp"
  product_id   = var.contabo_product_id
  region       = var.contabo_region
  period       = var.contabo_period
  user_data = templatefile("${path.module}/cloud-init-erp.yaml.tftpl", {
    ssh_public_key = var.ssh_public_key
  })
  lifecycle {
    ignore_changes  = [user_data]
    prevent_destroy = true
  }
}

locals {
  contabo_ipv4 = try(contabo_instance.erp.ip_config[0].v4[0].ip, "")
  contabo_ready = (
    contains(["running", "installed"], contabo_instance.erp.status)
    && length(local.contabo_ipv4) > 0
    && can(regex("^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$", local.contabo_ipv4))
  )
}

resource "cloudflare_dns_record" "admin" {
  zone_id = var.cloudflare_zone_id
  name    = local.admin_record
  type    = "A"
  content = oci_core_instance.control.public_ip
  ttl     = 1
  proxied = true
}

resource "cloudflare_dns_record" "tenants" {
  count   = local.contabo_ready ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = "*"
  type    = "A"
  content = local.contabo_ipv4
  ttl     = 1
  proxied = true
}

# The registry is an origin service, not a browser endpoint.  Keep it
# unproxied so Docker clients can speak the registry protocol directly.
resource "cloudflare_dns_record" "registry" {
  count   = local.contabo_ready ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = "registry"
  type    = "A"
  content = local.contabo_ipv4
  ttl     = 1
  proxied = false
}

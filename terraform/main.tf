locals {
  name_prefix = "rekov-infra"
  os_family   = can(regex("(?i)ubuntu", var.os_name)) ? "ubuntu" : "ol"

  erpnext_compose_b64 = filebase64("${path.module}/../erpnext/docker-compose.yml")

  erpnext_env_content = templatefile("${path.module}/erpnext.env.tftpl", {
    erpnext_image               = var.erpnext_image
    frappe_site_name            = var.frappe_site_name
    erpnext_admin_password      = var.erpnext_admin_password
    erpnext_mysql_root_password = var.erpnext_mysql_root_password
  })

  erpnext_env_b64 = base64encode(local.erpnext_env_content)

  rekov_first_boot_b64 = base64encode(templatefile("${path.module}/rekov-first-boot.sh.tftpl", {
    os_family                     = local.os_family
    use_cloudflare_tunnel         = var.use_cloudflare_tunnel
    cloudflared_version           = var.cloudflared_version
    tunnel_token                  = var.use_cloudflare_tunnel ? data.cloudflare_zero_trust_tunnel_cloudflared_token.this[0].token : ""
    app_hostname                  = var.tunnel_hostname
    erpnext_compose_b64           = local.erpnext_compose_b64
    erpnext_env_b64               = local.erpnext_env_b64
    instance_console_user         = var.instance_console_user
    instance_console_password_b64 = var.instance_console_password != "" ? base64encode(var.instance_console_password) : ""
  }))

  instance_metadata = merge(
    {
      user_data = base64encode(templatefile("${path.module}/cloud-init.yaml.tftpl", {
        os_family            = local.os_family
        rekov_first_boot_b64 = local.rekov_first_boot_b64
      }))
    },
    var.ssh_public_key != "" ? { ssh_authorized_keys = var.ssh_public_key } : {}
  )

  # Non-secret boot fingerprint. Changing it replaces terraform_data (triggers_replace),
  # which replaces oci_core_instance via lifecycle.replace_triggered_by.
  instance_bootstrap_fingerprint = sha256(join("\n", [
    file("${path.module}/cloud-init.yaml.tftpl"),
    file("${path.module}/rekov-first-boot.sh.tftpl"),
    file("${path.module}/erpnext.env.tftpl"),
    file("${path.module}/../erpnext/docker-compose.yml"),
    tostring(var.use_cloudflare_tunnel),
    var.cloudflared_version,
    var.tunnel_hostname,
    join(",", var.ssh_ingress_cidrs),
    var.os_name,
    var.os_version,
    var.erpnext_image,
    var.frappe_site_name,
    var.ssh_public_key,
    var.instance_console_user,
    sha256(var.instance_console_password),
  ]))

  # Keep NAT in OCI during private→public migration until delete_nat_gateway=true (route must use IGW first).
  nat_gateway_enabled = !var.assign_public_ip || !var.delete_nat_gateway

  # Public origin: SSH/TCP 22 from 0.0.0.0/0 when ssh_ingress_cidrs is empty (key-only). Set CIDRs to restrict.
  ssh_ingress_sources = length(var.ssh_ingress_cidrs) > 0 ? var.ssh_ingress_cidrs : (
    var.use_cloudflare_tunnel ? [] : ["0.0.0.0/0"]
  )
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

data "oci_core_images" "ol" {
  compartment_id           = var.compartment_ocid
  operating_system         = var.os_name
  operating_system_version = var.os_version
  shape                    = var.instance_shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

resource "oci_core_vcn" "this" {
  cidr_blocks    = ["10.0.0.0/16"]
  compartment_id = var.compartment_ocid
  display_name   = "${local.name_prefix}-vcn"
  dns_label      = "rekvcn"
}

resource "oci_core_internet_gateway" "this" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${local.name_prefix}-igw"
  enabled        = true
}

# Private instances need NAT egress; public instances use the internet gateway on the route table.
resource "oci_core_nat_gateway" "this" {
  count = local.nat_gateway_enabled ? 1 : 0

  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${local.name_prefix}-nat"
}

resource "oci_core_route_table" "public" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${local.name_prefix}-rt"

  dynamic "route_rules" {
    for_each = var.assign_public_ip ? [1] : []
    content {
      destination       = "0.0.0.0/0"
      network_entity_id = oci_core_internet_gateway.this.id
      description       = "egress via internet gateway"
    }
  }

  dynamic "route_rules" {
    for_each = var.assign_public_ip ? [] : [1]
    content {
      destination       = "0.0.0.0/0"
      network_entity_id = oci_core_nat_gateway.this[0].id
      description       = "egress via NAT gateway (private instance)"
    }
  }
}

resource "oci_core_security_list" "this" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${local.name_prefix}-sl"

  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
    description = "allow all egress"
  }

  # Public origin: HTTP/HTTPS from anywhere (traffic is orange-cloud via Cloudflare).
  dynamic "ingress_security_rules" {
    for_each = var.use_cloudflare_tunnel ? [] : ["80", "443"]
    content {
      protocol    = "6"
      source      = "0.0.0.0/0"
      description = "public web TCP/${ingress_security_rules.value}"
      tcp_options {
        min = tonumber(ingress_security_rules.value)
        max = tonumber(ingress_security_rules.value)
      }
    }
  }

  dynamic "ingress_security_rules" {
    for_each = local.ssh_ingress_sources
    content {
      protocol    = "6"
      source      = ingress_security_rules.value
      description = "ssh from ${ingress_security_rules.value}"
      tcp_options {
        min = 22
        max = 22
      }
    }
  }
}

resource "oci_core_subnet" "this" {
  cidr_block                 = "10.0.1.0/24"
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.this.id
  route_table_id             = oci_core_route_table.public.id
  security_list_ids          = [oci_core_security_list.this.id]
  display_name               = "${local.name_prefix}-subnet"
  dns_label                  = "reksub"
  prohibit_public_ip_on_vnic = !var.assign_public_ip

  lifecycle {
    create_before_destroy = true
  }
}

resource "terraform_data" "instance_bootstrap" {
  triggers_replace = local.instance_bootstrap_fingerprint
}

resource "oci_core_instance" "this" {
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[var.availability_domain_index].name
  compartment_id      = var.compartment_ocid
  display_name        = "${local.name_prefix}-vm"

  shape = var.instance_shape

  dynamic "shape_config" {
    for_each = can(regex("Flex", var.instance_shape)) ? [1] : []
    content {
      ocpus         = var.ocpus
      memory_in_gbs = var.memory_in_gbs
    }
  }

  source_details {
    source_id   = data.oci_core_images.ol.images[0].id
    source_type = "image"
  }

  create_vnic_details {
    subnet_id              = oci_core_subnet.this.id
    assign_public_ip       = var.assign_public_ip ? "true" : "false"
    nsg_ids                = []
    skip_source_dest_check = false
  }

  metadata = local.instance_metadata

  lifecycle {
    ignore_changes = [metadata]

    replace_triggered_by = [
      terraform_data.instance_bootstrap,
    ]
  }

  # Static depends_on only (no ternary). Do not list cloudflare_dns_record.app — it uses public_ip and would cycle.
  depends_on = [
    cloudflare_zero_trust_tunnel_cloudflared.this,
    cloudflare_zero_trust_tunnel_cloudflared_config.this,
    data.cloudflare_zero_trust_tunnel_cloudflared_token.this,
    cloudflare_dns_record.tunnel,
  ]
}

terraform {
  required_version = ">= 1.6.0"
  backend "s3" {}
  required_providers {
    oci        = { source = "oracle/oci", version = ">= 7.0.0" }
    cloudflare = { source = "cloudflare/cloudflare", version = ">= 5.0.0, < 6.0.0" }
    contabo    = { source = "contabo/contabo", version = ">= 0.1.32" }
    time       = { source = "hashicorp/time", version = ">= 0.13.0" }
  }
}

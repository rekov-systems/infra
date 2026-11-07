terraform {
  required_version = ">= 1.5.0"

  # Remote state: Cloudflare R2 via S3-compatible API (see docs/github-actions-apply.md).
  backend "s3" {}

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = ">= 5.0.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = ">= 5.0.0"
    }
  }
}

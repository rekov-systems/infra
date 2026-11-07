# ERPNext (Docker) on the OCI VM

The compose file mirrors [frappe_docker `pwd.yml`](https://github.com/frappe/frappe_docker/blob/main/pwd.yml) with these changes:

- `frontend` publishes **only** `127.0.0.1:8080` so nothing listens on the public interface (Cloudflare Tunnel targets this port).
- Site name and image are driven by `/opt/rekov/erpnext/.env` (written by Terraform cloud-init).

## After the first `terraform apply`

1. ERPNext: `https://<tunnel_hostname>` (admin password from `erpnext_admin_password` in tfvars).
2. **Cloudflare R2**: create a bucket and S3 API token. Add to site config ([Frappe file storage](https://frappeframework.com/docs/user/en/guides/deployment/file-storage)) — keys like `aws_s3_bucket`, `s3_key`, `secret`, `endpoint_url` / region `auto` for R2. Large marketing videos: prefer storing in R2 and linking URLs in ERPNext.
3. **Bavimail SMTP**: In ERPNext, **Email Account** with your SMTP host, TLS, and app password — plus SPF/DKIM/DMARC on the Cloudflare zone.
4. **Dataico**: Use a Frappe custom app or Server Script calling Dataico’s API on Sales Invoice submit; tokens belong in ERPNext credentials, not in this repo.

# Rekov infra (OCI + Cloudflare)

**Default:** public IPv4, **nginx** on 80/443 → ERPNext `127.0.0.1:8080`, Cloudflare **proxied A record**. Details: [`docs/public-origin.md`](docs/public-origin.md).

**Optional:** private VM + **cloudflared** tunnel (`use_cloudflare_tunnel = true`).

Terraform creates VCN, subnet, security list, **VM.Standard.A1.Flex** with cloud-init (**Docker** + ERPNext compose; tunnel or edge nginx per mode).

## GitHub Actions

- [`.github/workflows/infra.yml`](.github/workflows/infra.yml): on **`push` / **pull_request** to `main` — Terraform `fmt` + `validate`. On **`push` to `main` or `workflow_dispatch`** — **`terraform plan` + `apply -auto-approve`**. Remote state in **Cloudflare R2** (`R2_STORAGE_*`). **`wrangler deploy`** for [`workers/orchestrator`](workers/orchestrator). See [`docs/github-actions-apply.md`](docs/github-actions-apply.md).

Secrets via [**Infisical** OIDC](docs/infisical-github-actions.md) when `INFISICAL_IDENTITY_ID` is set; `id-token: write` is required.

Without Infisical, jobs need the same **`TF_VAR_*`** as GitHub Actions **Secrets** or the steps will fail.

## ERPNext, R2, email, Dataico, Workers

| Piece | Where |
|--------|--------|
| ERPNext Docker | [`erpnext/docker-compose.yml`](erpnext/docker-compose.yml); env template [`terraform/erpnext.env.tftpl`](terraform/erpnext.env.tftpl); bootstrap in [`terraform/cloud-init.yaml.tftpl`](terraform/cloud-init.yaml.tftpl) |
| **Site name** | `frappe_site_name` must **equal** `tunnel_hostname` (validation in [`terraform/variables.tf`](terraform/variables.tf)) |
| **R2** for files / large video | Configure Frappe [S3/R2 file storage](https://frappeframework.com/docs/user/en/guides/deployment/file-storage) after boot (credentials via ERPNext, not Terraform) |
| **Bavimail SMTP** | Set **Email Account** in ERPNext + SPF/DKIM/DMARC on the Cloudflare zone |
| **Dataico** | Custom Frappe app or Server Script calling Dataico API (credentials in ERPNext) |
| **Workers + Telnyx / IA** | Skeleton: [`workers/orchestrator`](workers/orchestrator) (`wrangler deploy`); point webhooks at the Worker, call ERPNext API with secrets |

See [`erpnext/README.md`](erpnext/README.md) for post-install steps.

- **Backups a R2:** [`docs/r2-backups.md`](docs/r2-backups.md)

## GitHub + Infisical (checklist)

Variables en el repo: `INFISICAL_IDENTITY_ID`, `INFISICAL_PROJECT_SLUG`, `INFISICAL_ENV_SLUG`. Claves en Infisical: [`docs/infisical-github-actions.md`](docs/infisical-github-actions.md). Para backups en la VM, añade credenciales R2 en Infisical o en la máquina (ver `docs/r2-backups.md`).

## Requirements

- Terraform >= 1.5
- Commit [`terraform/.terraform.lock.hcl`](terraform/.terraform.lock.hcl) with the code so everyone uses the same provider versions
- OCI API user key: `tenancy_ocid`, `user_ocid`, `fingerprint`, `private_key` PEM, `compartment_ocid`, `oci_region`
- Cloudflare: domain **already on Cloudflare**, `cloudflare_zone_id`, `cloudflare_account_id`, API token with at least:
  - Zone — **DNS — Edit**
  - Account — **Cloudflare Tunnel — Edit** (or *Cloudflare One Connector: cloudflared — Write*)
- `cloudflared` release used by cloud-init must be **>= 2025.4.0** (for `--token-file`); default is set in `terraform/variables.tf` as `cloudflared_version`

## Quick start

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars (never commit secrets)

export TF_VAR_private_key="$(cat ~/.oci/oci_api_key.pem)"
export TF_VAR_cloudflare_api_token="..."
export TF_VAR_erpnext_admin_password="..."
export TF_VAR_erpnext_mysql_root_password="..."
# Or: source ../.env.example after copying to ../.env

terraform init -backend=false
terraform plan
terraform apply
```

### Remote state

- **CI (recommended):** [`docs/github-actions-apply.md`](docs/github-actions-apply.md) — Terraform state in **R2** via backend `s3` + `R2_STORAGE_*` secrets.
- **Alternative (local / OCI):** `backend.tf.example` — native `backend "oci"`; copy to `terraform/backend.tf` (gitignored) and bootstrap the OCI bucket once.

### SSH and public IP

With `assign_public_ip = false` (default), the instance has **no public IPv4**; the tunnel still works (outbound-only). Use **OCI serial console** with `TF_VAR_instance_console_password` (sets `opc` password on first boot) or set `assign_public_ip = true` *and* `ssh_public_key` if you want classic SSH—note you still have **no** ingress rules on the security list, so SSH from the internet will not work until you add NSG/list rules you accept.

### After apply

1. Cloud-init pulls and starts the ERPNext stack under `/opt/rekov/erpnext` (`docker compose up -d`). First boot can take several minutes while `create-site` runs.
2. `systemctl status cloudflared` should be active; tunnel **healthy** in Cloudflare Zero Trust.
3. Open `https://<tunnel_hostname>` (Administrator password: `erpnext_admin_password` from Terraform).

### Troubleshooting: Cloudflare **1033** (tunnel not reachable)

- **CI green on apply ≠ stack up.** The same **`terraform-apply`** job runs **boot watch** after apply (OCI serial + tunnel + HTTPS; [boot-images-and-verify.md](docs/boot-images-and-verify.md)). Apply alone only creates API objects.
- **cloud-init runs once at first boot.** `metadata` stays ignored so password or tunnel-token rotation does not update the instance. A change to the cloud-init template, the ERPNext compose/env templates, `cloudflared_version`, `erpnext_image`, `frappe_site_name`, `ssh_public_key`, `instance_console_user`, or `instance_console_password` changes `terraform_data.instance_bootstrap` (`triggers_replace`) and the next apply **replaces** the VM. Use **Run workflow → Replace OCI instance** for a manual `-replace` if you need it without editing those files.
- **First boot delay:** if `cloud-init` still runs a full `package_upgrade`, `runcmd` (Docker, `cloudflared`, ERPNext) starts only after that. The template now sets `package_upgrade: false` so the tunnel comes up sooner; right after a VM replace, wait a few minutes before assuming 1033 is permanent.
- **Private subnets need NAT** for outbound Internet (cloudflared + `docker pull`). If the VM was created before NAT existed, replace it after apply.
- On the instance (serial console): `systemctl status cloudflared`, `journalctl -u cloudflared -b`, and `docker ps`.
- If **`docker compose` fails** on first boot, older cloud-init order could **skip starting cloudflared** entirely (1033/530). The template now installs and **starts `cloudflared` before** `docker compose`, so the tunnel stays connected even while ERPNext is broken.

### Troubleshooting: Cloudflare **502** after the tunnel is up

- Usually means **cloudflared reached the VM** but **nothing healthy** was listening on `http://127.0.0.1:8080` (ERPNext `frontend`/nginx still starting, or `create-site` had not finished). Wait a few minutes after first boot while `create-site` runs, then retry. Use `docker compose ps` / `docker logs` on the instance if it persists.

## Files

| Path | Purpose |
|------|---------|
| `terraform/main.tf` | OCI network + instance + cloud-init |
| `terraform/cloudflare.tf` | Tunnel, tunnel config, DNS, token data |
| `terraform/cloud-init.yaml.tftpl` | Docker + cloudflared + ERPNext compose |
| `erpnext/docker-compose.yml` | ERPNext stack (localhost-only 8080) |
| `.github/workflows/infra.yml` | CI: Terraform validate/apply + Worker deploy |
| `workers/orchestrator` | Cloudflare Worker stub for Telnyx / IA |
| `terraform/backend-r2.tf.example` | R2 remote state (S3 backend) |
| `terraform/backend.tf.example` | Optional OCI remote state |
| `terraform/terraform.tfvars.example` | Non-secret variable template |

## Security notes

- Tunnel token is **sensitive**; it is written on the instance under `/etc/cloudflared/token` (mode 600) by cloud-init.
- Do not commit `terraform.tfvars`, `*.pem`, or `.env`.

`oci_core_instance` uses `lifecycle.ignore_changes` on **metadata** so rotating passwords or the tunnel token does not update user-data in place. Boot changes go through `terraform_data.instance_bootstrap` (`replace_triggered_by`): the next apply replaces the VM and cloud-init runs again.

### Manual: replace OCI VM from GitHub Actions

Actions → **Infra** → **Run workflow** → enable **Replace OCI instance** → Run. That runs `terraform plan` with `-replace=oci_core_instance.this` (same credentials as push-to-main apply). Use this once after changing the boot trigger resource (e.g. `null_resource` → `terraform_data`) if the plan does not already show `oci_core_instance.this` replaced.

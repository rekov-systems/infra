# Recovery point and rollback

Recovery is intentionally R2-only. The repository does not create OCI or
Contabo snapshots and does not rely on provider-specific rollback APIs.

## Recovery contents

The `Create recovery point` workflow collects from both VMs:

- encrypted MariaDB dumps;
- encrypted Press sites, Bench, Agent and system configuration;
- package, Python, systemd and Press revision inventories;
- Press status, Terraform outputs and a checksum manifest.

The files are uploaded under:

```text
s3://<bucket>/recovery/<github-run-id>/
```

`RECOVERY_PASSPHRASE` must exist in Infisical `production`. It is never stored
in Git or printed in CI. Keep it in a password manager; without it the R2
artifacts cannot be decrypted.

## Recovery procedure

1. Stop the deployment workflow and preserve its logs.
2. Run `Restore recovery point` with the selected workflow run ID. It downloads
   and verifies the R2 artifacts and prints the clean-rebuild plan.
3. Recreate or provision clean infrastructure with Terraform.
4. Bootstrap the native Press control plane.
5. Configure the Self Hosted Server, Proxy Server, database server and Agent
   through native Press actions.
6. Decrypt and restore the MariaDB dumps and Press/site state on the rebuilt
   hosts, then verify SSH, MariaDB, Press, Agent, DNS and application health.

This restores the application and control-plane state, but it is not a
byte-for-byte operating-system disk rollback. A provider snapshot would be
required for that, and this project deliberately does not use one.

## No-go conditions

Do not deploy unless the selected R2 recovery point has a valid manifest,
checksums and all four encrypted database/state artifacts. A green CI run is
not a recovery point; use the successful `Create recovery point` run ID.

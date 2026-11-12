# Recovery point and rollback

This branch treats rollback as an operational product, not as a Git operation.
Terraform state can recreate the declared resources, but it cannot restore the
exact operating-system packages, Python environments, Press records, Redis
queues, MariaDB data, or files on a VM. A release is therefore allowed to
change production only after a recovery point exists.

## Recovery point contents

Create all of these before an experimental deployment:

1. A Git tag for the exact infrastructure source, for example
   `baseline-main-61f5a50`.
2. A point-in-time provider snapshot of the OCI control VM boot volume.
3. A Contabo instance snapshot of the tenant node.
4. Encrypted logical MariaDB dumps from the control VM and tenant VM.
5. An encrypted file archive containing Press sites/configuration, the tenant
   Agent configuration, Nginx/systemd configuration, and a machine/package
   inventory.
6. A manifest containing snapshot IDs, Git SHA, Terraform outputs, Press
   record statuses, and SHA-256 checksums of every backup object.

The provider snapshots are the primary exact rollback mechanism. The logical
dumps are defense in depth and make it possible to recover data even when a
whole-VM restore is not convenient.

## Creating a recovery point

Run `scripts/collect-recovery-manifest.sh` from a trusted machine with SSH
access to both VMs. Set `RECOVERY_PASSPHRASE` in the environment; the script
never writes it to the repository or CI log. The script creates encrypted
artifacts locally. Upload those artifacts to the encrypted R2 recovery bucket
using the organisation's backup job, then record the object URLs and provider
snapshot IDs in the manifest.

Before an experimental deployment, run
`scripts/verify-recovery-point.sh` with `RECOVERY_POINT`,
`OCI_BOOT_VOLUME_BACKUP_ID`, and `CONTABO_SNAPSHOT_ID`. It refuses to pass if
an encrypted database/state artifact is missing or its checksum is invalid.

The manual `Create recovery point` workflow creates both provider snapshots
through the OCI and Contabo APIs, then records their IDs in the manifest. The
snapshots are deliberately outside the normal Terraform resource lifecycle.
Do not add a one-time snapshot to the main state: a later `terraform destroy`
or replacement could delete the only rollback point.
OCI boot-volume backups are point-in-time backups that can be restored to a
new boot volume or instance. Contabo instance snapshots serve the equivalent
purpose for the tenant VM. Keep at least three recovery points and apply a
retention policy that does not delete the last known-good point.

## Full rollback procedure

1. Stop the deployment workflow and preserve its logs.
2. Select the recovery manifest and verify its checksums before restoring.
3. Restore the OCI control boot volume and Contabo instance snapshot to new
   resources first. Do not overwrite the only live copy until SSH and the
   applications have been checked.
4. Reattach or promote the restored volumes/instances and update DNS only
   after the restored services pass health checks.
5. If a snapshot restore is not possible, install the exact pinned OS/runtime
   versions from the manifest, restore the encrypted MariaDB dumps, restore
   the Press sites and Agent configuration, and restart the recorded systemd
   units. This is the fallback, not the preferred path.
6. Reset Terraform state only after the restored resource IDs and addresses
   are known. Import restored resources rather than allowing an apply to
   create a second untracked infrastructure.
7. Move `main` back to the recorded tag only if the source rollback is also
   required. The infrastructure tag alone does not restore VM state.

## No-go conditions

An experimental deploy must stop if any of the following is missing:

- provider snapshot ID for each VM;
- successful, checksumed control and tenant database dumps;
- a readable encrypted archive and manifest;
- a tested restore path for the selected recovery point.

The current baseline for this branch is `baseline-main-61f5a50`.

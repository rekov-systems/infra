# Clean native rebuild

This is the replacement plan for the current custom bootstrap. The operator
does not need to manage a tenant branch: the final workflow runs from `main`
and Infisical's production environment. The experimental branch is only an
engineering safety boundary until this document's gates pass.

## Desired ownership

| Concern | Owner |
| --- | --- |
| VCN, instances, public IPs, DNS records | Terraform |
| Press installation and systemd services | control VM bootstrap |
| Self Hosted Server verification and setup | native Press API/UI |
| Proxy setup and agent jobs | native Press API/UI |
| Release Group, builds, benches, sites | native Press API/UI |
| Database and VM recovery | encrypted R2 backups + clean rebuild |

The repository must not create `Agent Job`, `Bench`, `Deploy Candidate`,
`Deploy`, `Proxy Server`, or `Self Hosted Server` rows by writing lifecycle
fields. Those rows are created by Press's native actions.

## One-time rebuild sequence

1. Freeze the current deployment workflow.
2. Run `collect-recovery-manifest.sh` against both existing VMs.
3. Collect and verify the encrypted R2 recovery artifacts.
4. Export the existing Terraform state and record all resource IDs.
5. Remove the old Press records and destroy/recreate only the explicitly
   approved infrastructure resources. Keep the R2 recovery prefix immutable.
6. Apply Terraform from `main` to create the clean control and capacity VMs.
7. Bootstrap only the control VM's Press installation and native systemd
   services. Do not install an Agent or ERPNext manually on the tenant node.
8. In Press, create the native Self Hosted Server using the tenant IP, SSH
   key, plan, cluster, root domain, and proxy configuration. Let Press run
   verification and setup.
9. Create the release group/build/bench/site through Press and verify the
    Agent job chain end to end.
10. Re-enable the production workflow only after a second tenant smoke test.

## Destruction guard

The destroy step is intentionally not part of ordinary `deploy.sh`. It must
be a separate, manually dispatched operation that requires an explicit
`REBUILD_CONFIRMATION` value and a verified recovery manifest. This prevents
an ordinary push to `main` from deleting production.

## Acceptance criteria

- A fresh run from `main` succeeds without any repository Press lifecycle
  module being copied into the Press app.
- No deploy step edits the tenant Agent credential, Fail2Ban state, or package
  repositories directly.
- Press UI/API creates the Self Hosted Server, Proxy Server, Bench and tenant.
- A second tenant can be added without an infrastructure-code change.
- The recovery point can recreate both VMs and restore database/site contents
  from R2; it is not a byte-for-byte VM disk clone.
- A failed native job is observable and retriable through Press without a
  repository patch or manual database status edit.

The deploy is permanently native-only. It provisions the Terraform resources
and the Press control plane, then stops before tenant-side lifecycle actions.
The native Self Hosted Server flow is started from Press itself.

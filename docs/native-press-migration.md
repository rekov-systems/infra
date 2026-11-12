# Native Press migration

## Current state

The previous implementation installed and patched Press on the control VM,
then copied `rekov_press_platform.py` into the Press app and called it
directly. That module has been removed. It was a second control plane layered
on top of Press and is not part of the native deployment anymore.

That layering caused the recent failures: records were created before native
setup was invoked, the scheduler was not initially enabled, agent credentials
could drift, and retrying a native Agent Job creates a new row by design.

## Target flow

The target flow is:

1. Terraform provisions only durable infrastructure, networking, DNS, and
   instance identity.
2. The control VM installs pinned Frappe/Press versions and native systemd
   services.
3. Press creates/verifies/configures the Self Hosted Server through its native
   `press.api.selfhosted` API.
4. Press invokes native `Server.setup_server()` and native `Proxy Server`
   setup. The repository does not set lifecycle statuses by hand.
5. Native scheduler, Agent Job, Release Group, Deploy Candidate, Bench, and
   tenant APIs own the asynchronous workflow.
6. Repository code remains limited to unavoidable environment integration:
   Cloudflare/R2 credentials, DNS records, pinned revisions, backup gates, and
   health checks.

The existing single-node hybrid topology is preserved during this migration.
A dedicated proxy VM is a later capacity/security change, not something to
mix into the rollback work.

## Migration gates

- The recovery-point gate passes before any experimental deploy.
- A clean Press install can create and verify a Self Hosted Server without the
  custom platform module.
- A native proxy setup reaches `Active` and `is_server_setup=1`.
- A native bench reaches `Active` through the scheduler and Agent, with no
  direct database status edits.
- An undelivered job is retried through the native supported operation and the
  resulting job is observable; duplicate user/proxy operations are not
  automatically replayed.
- A second tenant can be created from Press without changing this repository.
- A recovery test restores a non-production clone from the selected point.

The production workflow is manual and recovery-gated. No ordinary push can
destroy or replace the provider resources.

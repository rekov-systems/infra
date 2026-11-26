# Desk product overlay

`apps/pos` remains the clean subtree from `mateopiza/ai-point-of-sale`. Desk
branding, RMS workflow changes, official Meta Cloud API, and JCFlow integration
are applied to a temporary build copy from `desk-rms.patch`.

Upstream synchronization updates the original subtree independently. CI applies
the Desk overlay after each merge and blocks the change for review if upstream
changes overlap or the patch no longer applies. Required third-party license and
author notices remain intact.

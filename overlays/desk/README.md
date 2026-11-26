# Desk source overlay

The public Desk repository remains unchanged. CI checks out the pinned upstream
revision and applies `desk-rms.patch` only to the temporary build copy. The
overlay keeps Desk's landing and login presentation, changes login to Supabase
Auth, and builds the Dashboard as a self-hosted Node application.

The RMS is built from the pinned S360T upstream plus `overlays/pos/desk-rms.patch`
and served under `/rms` on the same origin. Its Supabase session is established
by the small SSO callback route in that overlay.

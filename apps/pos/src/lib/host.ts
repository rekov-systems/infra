const RESERVED = new Set([
  "desk.rekov.co",
  "www.desk.rekov.co",
  "control.desk.rekov.co",
  "api.desk.rekov.co",
  "studio.desk.rekov.co",
]);

export function isTenantHost(hostname = window.location.hostname) {
  return hostname.endsWith(".desk.rekov.co") && !RESERVED.has(hostname);
}

/** Only an already-open business host may receive a session. */
export function tenantReturnOrigin(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (url.pathname !== "/" || url.search || url.hash) return null;
    if (!isTenantHost(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function deskLoginUrl(returnOrigin?: string) {
  const url = new URL("https://desk.rekov.co/login");
  url.searchParams.set("next", "/rms/onboarding");
  if (returnOrigin) url.searchParams.set("return", returnOrigin);
  return url.toString();
}

export function loginHref() {
  if (isTenantHost()) return deskLoginUrl(window.location.origin);
  if (window.location.hostname === "desk.rekov.co") return "/login";
  return "/auth";
}

export function goToTenantSession(origin: string, accessToken: string, refreshToken: string, next = "/rms/dashboard") {
  const fragment = new URLSearchParams({
    access_token: accessToken,
    refresh_token: refreshToken,
    next,
  });
  window.location.replace(`${origin}/sso#${fragment.toString()}`);
}

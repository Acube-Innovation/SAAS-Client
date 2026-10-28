import type { AuthState } from "@saas/api-client";

export const PUBLIC_PATHS = ["/login", "/two-factor", "/invite"];
export const HOME = "/home";

export type Route = "/login" | "/two-factor" | "/select-agency" | "denied" | null;

/**
 * Where a user must go before using the portal: sign in, finish 2FA, pick an agency, or nowhere.
 * Client users need an active membership; platform staff get in only through a support session
 * (opened from the admin console), which sets their active tenant.
 */
export function nextRoute(state: AuthState | null | undefined): Route {
  if (!state) return "/login";
  if (state.otp_setup_required || state.otp_required) return "/two-factor";
  if (state.platform_role) return state.active_tenant_id ? null : "denied";
  const active = state.memberships.filter((m) => m.status === "active");
  if (active.length === 0) return "denied";
  if (!state.active_tenant_id) return "/select-agency";
  return null;
}

/** Only same-site paths are followed after sign-in (no open redirects). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return HOME;
  if (PUBLIC_PATHS.some((path) => next.startsWith(path)) || next.startsWith("/select-agency")) return HOME;
  return next;
}

/** Base32 secret from an otpauth:// URL, grouped in fours for manual entry. */
export function setupKey(otpauthUrl: string): string {
  const secret = new URL(otpauthUrl).searchParams.get("secret") ?? "";
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

import type { AuthState } from "@saas/api-client";
import { describe, expect, it } from "vitest";

import { nextRoute, safeNext } from "./auth";

function state(overrides: Partial<AuthState> = {}): AuthState {
  return {
    id: "u1",
    email: "manager@agency.test",
    full_name: "Manager",
    platform_role: "",
    requires_2fa: false,
    otp_device_confirmed: false,
    otp_verified: false,
    otp_required: false,
    otp_setup_required: false,
    active_tenant_id: "t1",
    memberships: [
      { id: "m1", tenant_id: "t1", tenant_name: "Kochi Gas", tenant_status: "active", role: "manager", status: "active" },
    ],
    ...overrides,
  };
}

describe("nextRoute", () => {
  it("signed out -> login", () => expect(nextRoute(null)).toBe("/login"));
  it("owner without 2FA -> two-factor", () =>
    expect(nextRoute(state({ otp_setup_required: true }))).toBe("/two-factor"));
  it("member with an active agency -> in", () => expect(nextRoute(state())).toBeNull());
  it("several agencies and none chosen -> pick one", () =>
    expect(nextRoute(state({ active_tenant_id: null }))).toBe("/select-agency"));
  it("no active membership -> denied", () =>
    expect(
      nextRoute(state({ memberships: [{ ...state().memberships[0]!, status: "invited" }], active_tenant_id: null })),
    ).toBe("denied"));
  it("platform staff only through a support session", () => {
    expect(nextRoute(state({ platform_role: "support", memberships: [], active_tenant_id: null }))).toBe("denied");
    expect(nextRoute(state({ platform_role: "support", memberships: [], active_tenant_id: "t1" }))).toBeNull();
  });
});

describe("safeNext", () => {
  it.each([
    [null, "/home"],
    ["https://evil.test", "/home"],
    ["//evil.test", "/home"],
    ["/login", "/home"],
    ["/select-agency", "/home"],
    ["/bookings?date=2026-10-29", "/bookings?date=2026-10-29"],
  ])("%s -> %s", (input, expected) => expect(safeNext(input)).toBe(expected));
});

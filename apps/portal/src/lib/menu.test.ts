import { describe, expect, it } from "vitest";

import { canOpen, menuFor } from "./menu";

/** Portal spec 1.1, column by column: the menu each role sees, in menu order. */
const EXPECTED = {
  owner: [
    "home", "subscribers", "bookings", "deliveries", "follow_up", "reports", "messages", "areas",
    "communication_log", "wallet", "users", "reminder_settings", "integrations", "audit_log",
  ],
  manager: [
    "home", "subscribers", "bookings", "deliveries", "follow_up", "reports", "messages", "areas",
    "communication_log", "wallet", "reminder_settings",
  ],
  office_staff: ["home", "subscribers", "bookings", "deliveries", "follow_up", "messages", "communication_log"],
  support: [
    "home", "subscribers", "bookings", "deliveries", "follow_up", "reports", "messages", "areas",
    "communication_log", "wallet", "users", "reminder_settings", "audit_log",
  ],
} as const;

describe("menu by role (spec 1.1)", () => {
  it.each(Object.entries(EXPECTED))("%s sees exactly its screens", (role, keys) => {
    expect(menuFor(role as keyof typeof EXPECTED).map((s) => s.key)).toEqual(keys);
  });

  it("has no menu without a role", () => {
    expect(menuFor("")).toEqual([]);
  });

  it("guards pages the role can't use, including sub-paths", () => {
    expect(canOpen("office_staff", "/reports")).toBe(false);
    expect(canOpen("office_staff", "/areas/new")).toBe(false);
    expect(canOpen("manager", "/users")).toBe(false);
    expect(canOpen("support", "/integrations")).toBe(false);
    expect(canOpen("owner", "/integrations")).toBe(true);
    expect(canOpen("manager", "/bookings/123")).toBe(true);
    expect(canOpen("owner", "/not-a-screen")).toBe(false);
  });
});

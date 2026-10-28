import { describe, expect, it } from "vitest";

import { inQuietHours, inviteSchema, reminderSchema, subscriberSchema } from "./schemas";

const subscriber = {
  customer_name: "Asha Menon", mobile_number: "98470 12345", alternate_number: "", external_ref: "KL1",
  preferred_language: "ml", address: "", area: "", whatsapp_consent: false, consent_date: "", consent_source: "",
  status: "active", custom_fields: {},
};

function issues(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries((result.error?.issues ?? []).map((i) => [i.path.join("."), i.message]));
}

describe("subscriber schema (spec 2.2)", () => {
  it("accepts a valid subscriber", () => expect(subscriberSchema.safeParse(subscriber).success).toBe(true));

  it("checks names, references, phones and lengths", () => {
    const result = subscriberSchema.safeParse({
      ...subscriber, customer_name: " ", external_ref: "x".repeat(51), mobile_number: "12345",
      alternate_number: "999", address: "x".repeat(501),
    });
    expect(issues(result)).toMatchObject({
      customer_name: "validation.required", external_ref: "validation.max_50", mobile_number: "validation.mobile",
      alternate_number: "validation.mobile", address: "validation.max_500",
    });
  });

  it("needs consent date and source with consent, and no future date", () => {
    expect(issues(subscriberSchema.safeParse({ ...subscriber, whatsapp_consent: true }))).toMatchObject({
      consent_date: "validation.consent_needed", consent_source: "validation.consent_needed",
    });
    const future = subscriberSchema.safeParse({
      ...subscriber, whatsapp_consent: true, consent_date: "2999-01-01", consent_source: "verbal",
    });
    expect(issues(future)).toEqual({ consent_date: "validation.not_future" });
  });
});

describe("reminder settings schema (spec 2.10)", () => {
  const settings = {
    send_time: "10:00", days_before: 1, wait_minutes: 240, quiet_start: "21:00", quiet_end: "08:00",
    default_language: "ml", delivery_weekdays: [0, 1, 2, 3, 4, 5], holiday_dates: [],
  };

  it("accepts the defaults", () => expect(reminderSchema.safeParse(settings).success).toBe(true));

  it.each([
    [{ send_time: "9:5" }, "send_time"],
    [{ send_time: "22:30" }, "send_time"],
    [{ days_before: 8 }, "days_before"],
    [{ wait_minutes: 20 }, "wait_minutes"],
    [{ delivery_weekdays: [] }, "delivery_weekdays"],
    [{ holiday_dates: ["2000-01-01"] }, "holiday_dates"],
  ])("rejects %j", (change, field) => {
    expect(issues(reminderSchema.safeParse({ ...settings, ...change }))).toHaveProperty(field);
  });

  it("quiet hours wrap midnight", () => {
    expect(inQuietHours("23:00", "21:00", "08:00")).toBe(true);
    expect(inQuietHours("07:59", "21:00", "08:00")).toBe(true);
    expect(inQuietHours("08:00", "21:00", "08:00")).toBe(false);
    expect(inQuietHours("14:00", "13:00", "15:00")).toBe(true);
    expect(inQuietHours("10:00", "10:00", "10:00")).toBe(false);
  });
});

it("invite schema", () => {
  expect(inviteSchema.safeParse({ email: "a@b.test", full_name: "Ab", role: "manager" }).success).toBe(true);
  expect(issues(inviteSchema.safeParse({ email: "nope", full_name: "A", role: "super_admin" }))).toHaveProperty("email");
});

/**
 * Form validation matching the portal API (portal spec 2.2, 2.7, 2.10). The API checks again;
 * these give immediate feedback. Messages are translation keys.
 */

import { mobileSchema, normalizeIndianMobile } from "@saas/api-client/schemas";
import { z } from "zod";

const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const optionalMobile = z
  .string()
  .trim()
  .refine((value) => {
    if (!value) return true;
    try {
      normalizeIndianMobile(value);
      return true;
    } catch {
      return false;
    }
  }, "validation.mobile");

export const LANGUAGES = ["ml", "en", "hi", "ta"] as const;
export const CONSENT_SOURCES = ["paper_form", "verbal", "whatsapp_opt_in", "import", "other"] as const;

export const subscriberSchema = z
  .object({
    customer_name: z.string().trim().min(1, "validation.required").max(100, "validation.max_100"),
    mobile_number: mobileSchema,
    alternate_number: optionalMobile,
    external_ref: z.string().trim().min(1, "validation.required").max(50, "validation.max_50"),
    preferred_language: z.enum(LANGUAGES),
    address: z.string().max(500, "validation.max_500"),
    area: z.string(),
    whatsapp_consent: z.boolean(),
    consent_date: z.string(),
    consent_source: z.string(),
    status: z.enum(["active", "inactive"]),
    custom_fields: z.record(z.string(), z.unknown()),
  })
  .superRefine((value, ctx) => {
    if (!value.whatsapp_consent) return;
    if (!value.consent_date) ctx.addIssue({ code: "custom", path: ["consent_date"], message: "validation.consent_needed" });
    else if (value.consent_date > todayIso())
      ctx.addIssue({ code: "custom", path: ["consent_date"], message: "validation.not_future" });
    if (!value.consent_source)
      ctx.addIssue({ code: "custom", path: ["consent_source"], message: "validation.consent_needed" });
  });

export const areaSchema = z.object({
  name: z.string().trim().min(2, "validation.min_2").max(100, "validation.max_100"),
  code: z.string().trim().max(20, "validation.max_20"),
  default_staff: z.string(),
  is_active: z.boolean(),
});

export const staffSchema = z.object({
  name: z.string().trim().min(2, "validation.min_2").max(100, "validation.max_100"),
  phone: optionalMobile,
  is_active: z.boolean(),
});

export const inviteSchema = z.object({
  email: z.string().trim().email("validation.email"),
  full_name: z.string().trim().min(2, "validation.min_2").max(100, "validation.max_100"),
  role: z.enum(["owner", "manager", "office_staff"]),
});

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "validation.hhmm");

function minutes(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h! * 60 + m!;
}

/** Quiet hours may wrap midnight (21:00-08:00). */
export function inQuietHours(time: string, start: string, end: string) {
  const t = minutes(time);
  const s = minutes(start);
  const e = minutes(end);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

export const reminderSchema = z
  .object({
    send_time: HHMM,
    days_before: z.number({ message: "validation.number" }).int().min(0, "validation.days_before").max(7, "validation.days_before"),
    wait_minutes: z.number({ message: "validation.number" }).int().min(30, "validation.wait").max(1440, "validation.wait"),
    quiet_start: HHMM,
    quiet_end: HHMM,
    default_language: z.enum(LANGUAGES),
    delivery_weekdays: z.array(z.number().int().min(0).max(6)).min(1, "validation.weekdays"),
    holiday_dates: z.array(z.string()),
  })
  .superRefine((value, ctx) => {
    if (HHMM.safeParse(value.send_time).success && HHMM.safeParse(value.quiet_start).success &&
        HHMM.safeParse(value.quiet_end).success && inQuietHours(value.send_time, value.quiet_start, value.quiet_end)) {
      ctx.addIssue({ code: "custom", path: ["send_time"], message: "validation.send_in_quiet" });
    }
    if (value.holiday_dates.some((d) => d < todayIso())) {
      ctx.addIssue({ code: "custom", path: ["holiday_dates"], message: "validation.holiday_past" });
    }
  });

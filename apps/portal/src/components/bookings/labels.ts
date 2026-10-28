import { STATUS_TONES, type StatusTone } from "@saas/ui";

/** Colour for a booking outcome (blank = no answer yet). */
export const OUTCOME_TONES: Record<string, StatusTone> = {
  confirmed: "ok",
  reschedule: "warn",
  not_available: "warn",
  needs_review: "error",
  no_response: "error",
  failed: "error",
  opted_out: "neutral",
  skipped: "neutral",
};

export const bookingTone = (status: string): StatusTone => STATUS_TONES[status] ?? (status === "closed" ? "neutral" : "info");

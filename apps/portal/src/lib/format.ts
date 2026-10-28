import { t } from "@/i18n";

const TIME_ZONE = "Asia/Kolkata";

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIME_ZONE,
  }).format(new Date(value));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: TIME_ZONE }).format(
    new Date(value),
  );
}

/** A waiting time in minutes as "45 min", "5 h" or "2 d". */
export function formatAge(minutes: number): string {
  if (minutes < 60) return t("age.minutes", { count: minutes });
  if (minutes < 60 * 24) return t("age.hours", { count: Math.floor(minutes / 60) });
  return t("age.days", { count: Math.floor(minutes / (60 * 24)) });
}

/** Paise as rupees, e.g. 85 -> "₹0.85". */
export function formatRupees(paise: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(paise / 100);
}

/** Today in India as YYYY-MM-DD, `offset` days away. */
export function istDate(offset = 0): string {
  return new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

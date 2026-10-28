"use client";

import { Alert, Button, cn, Spinner, StatusPill } from "@saas/ui";
import Link from "next/link";

import { errorMessage, t } from "@/i18n";
import { formatAge, formatDate, formatDateTime } from "@/lib/format";
import { useChecklistAction, useHome, usePortalConfig } from "@/lib/queries";
import type { ChecklistItem, Home, PortalConfig } from "@/lib/types";

const COUNTS = [
  { key: "confirmed", tone: "text-emerald-700" },
  { key: "reschedule", tone: "text-amber-700" },
  { key: "not_available", tone: "text-amber-700" },
  { key: "no_response", tone: "text-red-700" },
  { key: "awaiting_reply", tone: "text-sky-700" },
  { key: "needs_review", tone: "text-red-700" },
] as const;

const CHECKLIST_LINKS: Record<string, string> = {
  agency_details: "/users",
  areas: "/areas",
  reminder_settings: "/reminder-settings",
  import_subscribers: "/subscribers",
  import_bookings: "/bookings",
  invite_team: "/users",
  auto_top_up: "/wallet",
};

/** Labels from the industry template, e.g. "Cylinder delivery" and "Planned delivery date". */
function industryLabels(config: PortalConfig) {
  const type = config.schedule_types[0] as { name?: string; fields?: { key: string; label: string }[] } | undefined;
  const dateLabel = type?.fields?.find((f) => f.key === "scheduled_date")?.label ?? "delivery date";
  return { schedule: (type?.name ?? "").toLowerCase(), dateField: dateLabel.toLowerCase() };
}

function Tile({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  href: string;
  tone?: string;
}) {
  return (
    <Link
      href={href}
      data-testid="home-tile"
      data-label={label}
      className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow"
    >
      <p className="text-sm text-muted">{label}</p>
      <p className={cn("mt-2 text-3xl font-semibold tabular-nums", tone ?? "text-ink")}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Link>
  );
}

function Checklist({ checklist }: { checklist: NonNullable<Home["checklist"]> }) {
  const action = useChecklistAction();
  if (checklist.complete) return null;
  const done = checklist.items.filter((i) => i.done || i.skipped).length;
  return (
    <section aria-label={t("checklist.title")} className="rounded-xl border border-brand-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-ink">{t("checklist.title")}</h2>
          <p className="text-sm text-muted">{t("checklist.intro")}</p>
        </div>
        <span className="text-sm font-medium text-brand-700">
          {t("checklist.progress", { done, total: checklist.items.length })}
        </span>
      </div>
      {action.isError && (
        <div className="mt-3">
          <Alert>{errorMessage(action.error)}</Alert>
        </div>
      )}
      <ol className="mt-4 divide-y divide-slate-100">
        {checklist.items.map((item: ChecklistItem) => (
          <li key={item.key} data-item={item.key} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <span className="flex items-center gap-3">
              <span
                aria-hidden
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold",
                  item.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-slate-400",
                )}
              >
                {item.done ? "✓" : ""}
              </span>
              <span className={cn("text-sm", item.done || item.skipped ? "text-muted line-through" : "text-ink")}>
                {t(`checklist.item.${item.key}`)}
              </span>
            </span>
            <span className="flex items-center gap-2">
              {item.done && <StatusPill tone="ok">{t("checklist.done")}</StatusPill>}
              {item.skipped && <StatusPill tone="neutral">{t("checklist.skipped")}</StatusPill>}
              {!item.done && !item.skipped && (
                <Link href={CHECKLIST_LINKS[item.key] ?? "/home"} className="text-sm font-medium text-brand-700 hover:underline">
                  {t("checklist.open")}
                </Link>
              )}
              {!item.done && item.manual && !item.skipped && item.key !== "auto_top_up" && (
                <Button
                  variant="secondary"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ item: item.key as "agency_details" | "reminder_settings", action: "done" })}
                >
                  {t("checklist.mark_done")}
                </Button>
              )}
              {item.can_skip && !item.done && (
                <Button
                  variant="ghost"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ item: "auto_top_up", action: item.skipped ? "unskip" : "skip" })}
                >
                  {item.skipped ? t("checklist.undo_skip") : t("checklist.skip")}
                </Button>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Home (spec 2.1): tomorrow at a glance, the follow-up queue and alerts; refreshes every 30 s. */
export function HomeScreen() {
  const home = useHome();
  const config = usePortalConfig();
  if (home.isPending || config.isPending) return <Spinner label={t("app.loading")} />;
  if (home.isError) return <Alert>{errorMessage(home.error)}</Alert>;
  if (config.isError) return <Alert>{errorMessage(config.error)}</Alert>;
  const data = home.data;
  const labels = industryLabels(config.data);
  const tomorrowQuery = `/bookings?date=${data.tomorrow}`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{t("home.title")}</h1>
        <p className="mt-1 text-sm text-muted">
          {t("home.subtitle", { agency: config.data.tenant_name, time: formatDateTime(data.generated_at) })}
        </p>
      </div>

      {data.alerts.length > 0 && (
        <div className="space-y-2" aria-label={t("home.alerts")}>
          {data.alerts.map((alert) => (
            <Alert key={alert.code} tone={alert.severity === "error" ? "error" : "warn"}>
              {t(`home.alert.${alert.code}`)}
            </Alert>
          ))}
        </div>
      )}

      {data.checklist && <Checklist checklist={data.checklist} />}

      <section aria-label={t("home.tomorrow", { date: formatDate(data.tomorrow) })} className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t("home.tomorrow", { date: formatDate(data.tomorrow) })}
          </h2>
          <span className="text-sm text-muted">
            {t("home.tomorrow_hint", { count: data.tomorrow_counts.total, schedule: labels.schedule })}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {COUNTS.map(({ key, tone }) => (
            <Tile
              key={key}
              label={t(`home.count.${key}`)}
              value={data.tomorrow_counts[key].toLocaleString("en-IN")}
              href={key === "awaiting_reply" ? `${tomorrowQuery}&status=awaiting_reply` : `${tomorrowQuery}&outcome=${key}`}
              tone={tone}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Tile
          label={t("home.follow_up")}
          value={t("home.follow_up_open", { count: data.follow_up.open.toLocaleString("en-IN") })}
          hint={
            data.follow_up.oldest_minutes === null
              ? t("home.follow_up_none")
              : t("home.follow_up_oldest", { age: formatAge(data.follow_up.oldest_minutes) })
          }
          href="/follow-up"
          tone={(data.follow_up.by_ageing.red ?? 0) > 0 ? "text-red-700" : undefined}
        />
        <Tile
          label={t("home.no_date", { field: labels.dateField })}
          value={data.no_date.toLocaleString("en-IN")}
          hint={t("home.no_date_hint")}
          href="/bookings?no_date=true"
        />
        <Tile
          label={t("home.sending")}
          value={t("home.sending_value", {
            sent: data.sent_today.toLocaleString("en-IN"),
            cap: data.daily_send_cap.toLocaleString("en-IN"),
          })}
          hint={config.data.role === "owner" ? t("home.wallet_soon") : undefined}
          href="/communication-log"
        />
      </section>
    </div>
  );
}

"use client";

import { Alert, Button, cn, SelectField, Spinner, StatusPill, TextField } from "@saas/ui";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { OUTCOME_TONES } from "@/components/bookings/labels";
import { LogRow } from "@/components/log/communication-log";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { errorMessage, t } from "@/i18n";
import { formatDateTime, formatRupees, istDate } from "@/lib/format";
import {
  useAreas,
  useCommunicationLog,
  useFollowUpAgeing,
  usePortalConfig,
  useReminderResults,
  useSubscriberHealth,
} from "@/lib/queries";

const REPORTS = ["reminder-results", "follow-up-ageing", "subscriber-health", "message-log"] as const;
type Report = (typeof REPORTS)[number];
const BUCKETS = ["under_4h", "4_to_24h", "1_to_3_days", "over_3_days"] as const;
const QUEUE_OUTCOMES = ["reschedule", "not_available", "needs_review", "no_response", "failed", "opted_out"];

/** Read the report's filters from the address bar; dates default to the last 7 days. */
function useFilters(keys: readonly string[]) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const values = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? ""])) as Record<string, string>;
  if ("date_from" in values && !values.date_from) values.date_from = istDate(-6);
  if ("date_to" in values && !values.date_to) values.date_to = istDate();
  const query = Object.fromEntries(Object.entries(values).filter(([k, v]) => v && k !== "page"));
  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries({ page: "", ...changes })) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`${pathname}?${next}`);
  }
  return { values, query, update };
}

function CsvButton({ report, query }: { report: Report; query: Record<string, string> }) {
  return (
    <a href={`/api/portal/reports/${report}/export?${new URLSearchParams(query)}`} download className="self-end">
      <Button variant="secondary">{t("reports.download_csv")}</Button>
    </a>
  );
}

function AreaFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const areas = useAreas();
  return (
    <SelectField
      label={t("subscribers.col.area")}
      value={value}
      placeholder={t("common.all")}
      options={[{ value: "none", label: t("subscribers.no_area") }, ...(areas.data ?? []).map((a) => ({ value: a.id, label: a.name }))]}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" data-testid="report-tile" data-label={label}>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const count = (n: number) => n.toLocaleString("en-IN");
const percent = (part: number, whole: number) => (whole ? `${Math.round((part * 1000) / whole) / 10}%` : "—");

/** Reports (spec 2.5) with a CSV export for each; exports are audited. */
export function ReportsScreen() {
  const params = useSearchParams();
  const pathname = usePathname();
  const requested = params.get("report") as Report | null;
  const report: Report = requested && REPORTS.includes(requested) ? requested : "reminder-results";
  return (
    <>
      <PageHeader title={t("nav.reports")} description={t("reports.description")} />
      <nav aria-label={t("reports.sections")} className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
        {REPORTS.map((key) => (
          <Link
            key={key}
            href={`${pathname}?report=${key}`}
            aria-current={report === key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              report === key ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t(`reports.tab.${key}`)}
          </Link>
        ))}
      </nav>
      {report === "reminder-results" && <ReminderResultsReport />}
      {report === "follow-up-ageing" && <FollowUpAgeingReport />}
      {report === "subscriber-health" && <SubscriberHealthReport />}
      {report === "message-log" && <MessageLogReport />}
    </>
  );
}

function ReminderResultsReport() {
  const { values, query, update } = useFilters(["date_from", "date_to", "area", "cylinder_type"]);
  const results = useReminderResults(query);
  const config = usePortalConfig();
  const fields = (config.data?.schedule_types[0] as { fields?: { key: string; label: string; options?: string[] }[] } | undefined)?.fields ?? [];
  const cylinder = fields.find((f) => f.key === "cylinder_type");
  const data = results.data;
  return (
    <section aria-label={t("reports.tab.reminder-results")} className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40"><TextField label={t("reports.from")} type="date" value={values.date_from} onChange={(e) => update({ date_from: e.target.value })} /></div>
        <div className="w-40"><TextField label={t("reports.to")} type="date" value={values.date_to} onChange={(e) => update({ date_to: e.target.value })} /></div>
        <div className="w-48"><AreaFilter value={values.area ?? ""} onChange={(area) => update({ area })} /></div>
        {cylinder && (
          <div className="w-48">
            <SelectField
              label={cylinder.label}
              value={values.cylinder_type ?? ""}
              placeholder={t("common.all")}
              options={(cylinder.options ?? []).map((o) => ({ value: o, label: o }))}
              onChange={(e) => update({ cylinder_type: e.target.value })}
            />
          </div>
        )}
        <CsvButton report="reminder-results" query={query} />
      </div>
      {results.isError && <Alert>{errorMessage(results.error)}</Alert>}
      {!data ? (
        <Spinner label={t("app.loading")} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label={t("reports.sent")} value={count(data.sent)} />
            <Tile label={t("reports.delivered")} value={count(data.delivered)} hint={percent(data.delivered, data.sent)} />
            <Tile label={t("reports.failed")} value={count(data.failed)} hint={percent(data.failed, data.sent)} />
            <Tile label={t("reports.replied")} value={count(data.replied)} hint={percent(data.replied, data.sent)} />
            <Tile label={t("reports.calls")} value={count(data.calls)} hint={t("reports.calls_answered", { count: data.calls_answered })} />
            <Tile label={t("reports.cost")} value={formatRupees(data.cost_paise)} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-ink">{t("reports.outcomes_title", { count: count(data.reminded) })}</h2>
            <table className="mt-3 w-full text-sm">
              <caption className="sr-only">{t("reports.outcomes_title", { count: count(data.reminded) })}</caption>
              <thead className="text-left text-xs uppercase text-muted">
                <tr>
                  <th scope="col" className="py-2 pr-4">{t("bookings.outcome")}</th>
                  <th scope="col" className="py-2 pr-4 text-right">{t("reports.count")}</th>
                  <th scope="col" className="w-1/2 py-2">{t("reports.share")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.outcomes.map((row) => (
                  <tr key={row.outcome} data-outcome={row.outcome}>
                    <td className="py-2 pr-4">
                      <StatusPill tone={OUTCOME_TONES[row.outcome] ?? "neutral"}>
                        {row.outcome === "awaiting" ? t("reports.awaiting") : t(`outcome.${row.outcome}`)}
                      </StatusPill>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-ink">{count(row.count)}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-3" title={`${row.share}%`}>
                        <div className="h-2 flex-1 rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.min(100, row.share)}%` }} />
                        </div>
                        <span className="w-14 text-right tabular-nums text-ink">{row.share}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function FollowUpAgeingReport() {
  const { values, query, update } = useFilters(["area", "outcome"]);
  const ageing = useFollowUpAgeing(query);
  const data = ageing.data;
  return (
    <section aria-label={t("reports.tab.follow-up-ageing")} className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48"><AreaFilter value={values.area ?? ""} onChange={(area) => update({ area })} /></div>
        <div className="w-48">
          <SelectField
            label={t("bookings.outcome")}
            value={values.outcome ?? ""}
            placeholder={t("common.all")}
            options={QUEUE_OUTCOMES.map((o) => ({ value: o, label: t(`outcome.${o}`) }))}
            onChange={(e) => update({ outcome: e.target.value })}
          />
        </div>
        <CsvButton report="follow-up-ageing" query={query} />
      </div>
      {ageing.isError && <Alert>{errorMessage(ageing.error)}</Alert>}
      {!data ? (
        <Spinner label={t("app.loading")} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-5">
            <Tile label={t("reports.open_items")} value={count(data.total)} hint={t("reports.as_of", { time: formatDateTime(data.generated_at) })} />
            {data.buckets.map((b) => (
              <Tile key={b.bucket} label={t(`reports.bucket.${b.bucket}`)} value={count(b.count)} />
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <caption className="sr-only">{t("reports.tab.follow-up-ageing")}</caption>
              <thead className="bg-slate-50 text-left text-xs uppercase text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2">{t("bookings.outcome")}</th>
                  {BUCKETS.map((b) => <th key={b} scope="col" className="px-4 py-2 text-right">{t(`reports.bucket.${b}`)}</th>)}
                  <th scope="col" className="px-4 py-2 text-right">{t("reports.total")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.by_outcome.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">{t("followup.empty")}</td></tr>
                )}
                {data.by_outcome.map((row) => (
                  <tr key={String(row.outcome)} data-outcome={String(row.outcome)}>
                    <td className="px-4 py-2"><StatusPill tone={OUTCOME_TONES[String(row.outcome)] ?? "neutral"}>{t(`outcome.${row.outcome}`)}</StatusPill></td>
                    {BUCKETS.map((b) => (
                      <td key={b} className={cn("px-4 py-2 text-right tabular-nums", b === "over_3_days" && Number(row[b]) > 0 ? "font-semibold text-red-700" : "text-ink")}>
                        {count(Number(row[b]))}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right font-medium tabular-nums text-ink">{count(Number(row.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function SubscriberHealthReport() {
  const { values, query, update } = useFilters(["area"]);
  const health = useSubscriberHealth(query);
  const data = health.data;
  return (
    <section aria-label={t("reports.tab.subscriber-health")} className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48"><AreaFilter value={values.area ?? ""} onChange={(area) => update({ area })} /></div>
        <CsvButton report="subscriber-health" query={query} />
      </div>
      {health.isError && <Alert>{errorMessage(health.error)}</Alert>}
      {!data ? (
        <Spinner label={t("app.loading")} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Tile label={t("reports.active_subscribers")} value={count(data.total)} />
            <Tile label={t("reports.no_consent")} value={count(data.no_consent)} hint={percent(data.no_consent, data.total)} />
            <Tile label={t("reports.opted_out")} value={count(data.opted_out)} hint={percent(data.opted_out, data.total)} />
            <Tile label={t("reports.failed_numbers")} value={count(data.failed_numbers)} hint={t("reports.failed_hint")} />
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <caption className="sr-only">{t("reports.by_area")}</caption>
              <thead className="bg-slate-50 text-left text-xs uppercase text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2">{t("subscribers.col.area")}</th>
                  <th scope="col" className="px-4 py-2 text-right">{t("reports.active_subscribers")}</th>
                  <th scope="col" className="px-4 py-2 text-right">{t("reports.no_consent")}</th>
                  <th scope="col" className="px-4 py-2 text-right">{t("reports.opted_out")}</th>
                  <th scope="col" className="px-4 py-2 text-right">{t("reports.failed_numbers")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.by_area.map((row) => (
                  <tr key={row.area ?? "none"}>
                    <td className="px-4 py-2 text-ink">{row.area ?? t("subscribers.no_area")}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{count(row.total)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{count(row.no_consent)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{count(row.opted_out)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{count(row.failed_numbers)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function MessageLogReport() {
  const { values, query, update } = useFilters(["date_from", "date_to", "search", "page"]);
  const log = useCommunicationLog({ ...query, ...(values.page ? { page: values.page } : {}) });
  return (
    <section aria-label={t("reports.tab.message-log")} className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40"><TextField label={t("reports.from")} type="date" value={values.date_from} onChange={(e) => update({ date_from: e.target.value })} /></div>
        <div className="w-40"><TextField label={t("reports.to")} type="date" value={values.date_to} onChange={(e) => update({ date_to: e.target.value })} /></div>
        <form role="search" className="w-64" onSubmit={(e) => { e.preventDefault(); update({ search: String(new FormData(e.currentTarget).get("search") ?? "").trim() }); }}>
          <TextField label={t("log.search")} name="search" type="search" placeholder={t("log.search_placeholder")} defaultValue={values.search} />
        </form>
        <CsvButton report="message-log" query={query} />
      </div>
      {log.isError && <Alert>{errorMessage(log.error)}</Alert>}
      {!log.data ? (
        <Spinner label={t("app.loading")} />
      ) : (
        <>
          <p className="text-sm text-muted">{t("common.results", { count: count(log.data.count) })}</p>
          <ul className="space-y-3" aria-label={t("reports.tab.message-log")}>
            {log.data.results.map((entry) => <LogRow key={entry.id} entry={entry} />)}
          </ul>
          {log.data.count > 0 && (
            <Pagination page={Number(values.page || "1")} count={log.data.count} pageSize={50} onChange={(page) => update({ page: String(page) })} />
          )}
        </>
      )}
    </section>
  );
}

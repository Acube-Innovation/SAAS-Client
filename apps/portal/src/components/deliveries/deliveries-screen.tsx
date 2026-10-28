"use client";

import { unwrap } from "@saas/api-client";
import { Alert, Button, Spinner, StatusPill, TextField } from "@saas/ui";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { errorMessage, t } from "@/i18n";
import { api, ensureCsrf } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { keys, useDeliveries, usePortalConfig, useRefresh, useStaff } from "@/lib/queries";

/** Deliveries (spec 2.3): confirmed bookings for a date by area, reassign, print, CSV. */
export function DeliveriesScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const config = usePortalConfig();
  const date = params.get("date") ?? "";
  const deliveries = useDeliveries(date);
  const canReassign = (config.data?.role === "owner" || config.data?.role === "manager") && config.data?.tenant_status !== "suspended";
  const staff = useStaff(canReassign);
  const refresh = useRefresh();
  const [error, setError] = useState<string>();
  const data = deliveries.data;
  const day = data?.date ?? date;

  async function reassign(jobId: string, staffId: string) {
    setError(undefined);
    try {
      await ensureCsrf();
      await unwrap(api.POST("/api/portal/jobs/{id}/reassign", { params: { path: { id: jobId } }, body: { assigned_staff: staffId || null } }));
      await refresh(keys.deliveries, keys.bookings);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function print() {
    setError(undefined);
    try {
      await ensureCsrf();
      await unwrap(api.POST("/api/portal/deliveries/printed", { body: { date: day } }));
      await refresh(keys.deliveries);
      window.print();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  const activeStaff = (staff.data?.results ?? []).filter((s) => s.is_active);
  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={t("nav.deliveries")}
          description={t("deliveries.description")}
          actions={
            data && (
              <>
                <a href={`/api/portal/deliveries/export?date=${day}`} download>
                  <Button variant="secondary">{t("deliveries.csv")}</Button>
                </a>
                <Button onClick={print} disabled={data.confirmed === 0}>{t("deliveries.print")}</Button>
              </>
            )
          }
        />
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <TextField label={t("deliveries.date")} type="date" value={day} onChange={(e) => router.replace(e.target.value ? `${pathname}?date=${e.target.value}` : pathname)} />
          {data?.printed_at && <p className="pb-2 text-sm text-muted">{t("deliveries.printed_at", { time: formatDateTime(data.printed_at) })}</p>}
        </div>
      </div>

      {deliveries.isError && <Alert>{errorMessage(deliveries.error)}</Alert>}
      {error && <Alert>{error}</Alert>}
      {!data ? (
        <Spinner label={t("app.loading")} />
      ) : (
        <div className="space-y-6">
          <nav aria-label={t("deliveries.tabs")} className="flex flex-wrap gap-2 print:hidden">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">
              {t("deliveries.confirmed", { count: data.confirmed })}
            </span>
            {Object.entries(data.not_confirmed).map(([outcome, count]) => (
              <Link
                key={outcome}
                href={outcome === "awaiting" ? `/bookings?date=${day}&outcome=none` : `/bookings?date=${day}&outcome=${outcome}`}
                className="rounded-full bg-white px-3 py-1 text-sm text-ink ring-1 ring-slate-200 hover:bg-slate-50"
              >
                {t(outcome === "awaiting" ? "deliveries.awaiting" : `outcome.${outcome}`)}: {count}
              </Link>
            ))}
          </nav>

          {data.changed_after_print.length > 0 && (
            <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200 print:hidden">
              <p className="font-semibold">{t("deliveries.changed_title")}</p>
              <ul className="mt-1 list-disc pl-5">
                {data.changed_after_print.map((job) => (
                  <li key={job.id}>
                    {t("deliveries.changed_item", { ref: job.booking_reference, name: job.customer_name, staff: job.assigned_staff_name ?? t("common.none") })}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <h2 className="hidden text-lg font-semibold print:block">
            {config.data?.tenant_name} · {t("deliveries.print_title", { date: formatDate(day) })}
          </h2>
          {data.areas.length === 0 && <p className="text-sm text-muted">{t("deliveries.empty", { date: formatDate(day) })}</p>}
          {data.areas.map((area) => (
            <section key={area.area_id ?? "none"} aria-label={area.area_name ?? t("subscribers.no_area")} className="break-inside-avoid rounded-xl border border-slate-200 bg-white print:border-slate-400">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <h3 className="font-semibold text-ink">{area.area_name ?? t("subscribers.no_area")}</h3>
                <span className="text-sm text-muted">
                  {t(area.jobs.length === 1 ? "deliveries.area_summary_one" : "deliveries.area_summary", { count: area.jobs.length, staff: area.default_staff_name ?? t("common.none") })}
                </span>
              </header>
              <table className="min-w-full text-sm">
                <caption className="sr-only">{area.area_name ?? t("subscribers.no_area")}</caption>
                <thead className="bg-slate-50 text-left text-xs uppercase text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2">{t("bookings.reference")}</th>
                    <th scope="col" className="px-4 py-2">{t("bookings.customer")}</th>
                    <th scope="col" className="px-4 py-2">{t("subscribers.address")}</th>
                    <th scope="col" className="px-4 py-2">{t("bookings.item")}</th>
                    <th scope="col" className="px-4 py-2">{t("deliveries.staff")}</th>
                    <th scope="col" className="hidden px-4 py-2 print:table-cell">{t("deliveries.done_check")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {area.jobs.map((job) => (
                    <tr key={job.id} data-job={job.id}>
                      <td className="px-4 py-2 font-mono text-xs">{job.booking_reference}</td>
                      <td className="px-4 py-2">
                        <span className="font-medium">{job.customer_name}</span>
                        <span className="block text-xs text-muted">{job.mobile_number}</span>
                      </td>
                      <td className="px-4 py-2 text-muted">{job.address || t("common.none")}</td>
                      <td className="px-4 py-2">{job.cylinder_type}{job.quantity > 1 ? ` × ${job.quantity}` : ""}</td>
                      <td className="px-4 py-2">
                        {canReassign && job.status === "pending" ? (
                          <select
                            aria-label={t("deliveries.reassign_for", { ref: job.booking_reference })}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm print:hidden"
                            value={job.assigned_staff ?? ""}
                            onChange={(e) => reassign(job.id, e.target.value)}
                          >
                            <option value="">{t("deliveries.unassigned")}</option>
                            {activeStaff.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        ) : null}
                        <span className={canReassign && job.status === "pending" ? "hidden print:inline" : ""}>
                          {job.assigned_staff_name ?? t("deliveries.unassigned")}
                        </span>
                        {job.status === "done" && <StatusPill tone="ok">{t("deliveries.delivered")}</StatusPill>}
                      </td>
                      <td className="hidden px-4 py-2 print:table-cell">☐</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

"use client";

import { unwrap } from "@saas/api-client";
import { Alert, Button, cn, Dialog, ReasonDialog, SelectField, Spinner, StatusPill, TextAreaField } from "@saas/ui";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { SetDateDialog } from "@/components/bookings/booking-detail";
import { OUTCOME_TONES } from "@/components/bookings/labels";
import { Pagination } from "@/components/pagination";
import { PageHeader } from "@/components/page-header";
import { errorMessage, t } from "@/i18n";
import { api, ensureCsrf } from "@/lib/api";
import { formatAge, formatDate, formatDateTime } from "@/lib/format";
import { keys, useAreas, useFollowUps, usePortalConfig, useRefresh } from "@/lib/queries";
import type { FollowUp } from "@/lib/types";

const FILTERS = ["outcome", "area", "age", "status", "page"] as const;
const QUEUE_OUTCOMES = ["reschedule", "not_available", "needs_review", "no_response", "failed", "opted_out"];
const AGEING = {
  normal: "border-l-slate-300",
  amber: "border-l-amber-400 bg-amber-50/40",
  red: "border-l-red-500 bg-red-50/40",
} as Record<string, string>;

type Action = { kind: "date" | "contacted" | "note" | "cancel" | "resolve"; item: FollowUp };

/** Follow-up queue (spec 2.4, Workflow 3.2): every booking whose answer isn't Confirmed. */
export function FollowUpQueue() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const config = usePortalConfig();
  const areas = useAreas();
  const refresh = useRefresh();
  const filters = Object.fromEntries(FILTERS.map((k) => [k, params.get(k) ?? ""])) as Record<(typeof FILTERS)[number], string>;
  const query = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  const queue = useFollowUps(query);
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const writable = config.data?.role !== "support" && config.data?.tenant_status !== "suspended";

  function update(changes: Partial<typeof filters>) {
    const next = new URLSearchParams({ ...filters, page: "", ...changes });
    for (const [key, value] of [...next.entries()]) if (!value || (key === "page" && value === "1")) next.delete(key);
    router.replace(next.size ? `${pathname}?${next}` : pathname);
  }

  async function run(path: string, body: Record<string, unknown>, message: string) {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await ensureCsrf();
      await unwrap(api.POST(path as "/api/portal/follow-ups/{id}/resolve", { params: { path: { id: action!.item.id } }, body: body as never }));
      await refresh(keys.followUps, keys.bookings, keys.deliveries);
      setNotice(message);
      setAction(null);
      setNote("");
    } catch (caught) {
      setError(errorMessage(caught));
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  const rows = queue.data?.results ?? [];
  return (
    <>
      <PageHeader title={t("nav.follow_up")} description={t("followup.description")} />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <SelectField label={t("bookings.outcome")} value={filters.outcome} placeholder={t("common.all")} options={QUEUE_OUTCOMES.map((o) => ({ value: o, label: t(`outcome.${o}`) }))} onChange={(e) => update({ outcome: e.target.value })} />
        <SelectField label={t("subscribers.col.area")} value={filters.area} placeholder={t("common.all")} options={[{ value: "none", label: t("subscribers.no_area") }, ...(areas.data ?? []).map((a) => ({ value: a.id, label: a.name }))]} onChange={(e) => update({ area: e.target.value })} />
        <SelectField label={t("followup.age")} value={filters.age} placeholder={t("common.all")} options={["normal", "amber", "red"].map((a) => ({ value: a, label: t(`followup.age_${a}`) }))} onChange={(e) => update({ age: e.target.value })} />
        <SelectField label={t("bookings.status")} value={filters.status} placeholder={t("followup.status_open")} options={["open", "contacted", "resolved"].map((s) => ({ value: s, label: t(`followup.status.${s}`) }))} onChange={(e) => update({ status: e.target.value })} />
      </div>
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && !action && <Alert>{error}</Alert>}
      {queue.isError && <Alert>{errorMessage(queue.error)}</Alert>}
      {queue.isPending ? (
        <Spinner label={t("app.loading")} />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">{t("followup.empty")}</p>
      ) : (
        <ul className="space-y-3" aria-label={t("nav.follow_up")}>
          {rows.map((item) => (
            <li key={item.id} data-item={item.id} data-ageing={item.ageing} className={cn("rounded-xl border border-l-4 border-slate-200 bg-white p-4", AGEING[item.ageing])}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={OUTCOME_TONES[item.outcome] ?? "neutral"}>{t(`outcome.${item.outcome}`)}</StatusPill>
                    {item.status !== "open" && <StatusPill tone={item.status === "resolved" ? "ok" : "info"}>{t(`followup.status.${item.status}`)}</StatusPill>}
                    <span className={cn("text-xs font-medium", item.ageing === "red" ? "text-red-700" : item.ageing === "amber" ? "text-amber-800" : "text-muted")}>
                      {t("followup.waiting", { age: formatAge(item.age_minutes) })}
                    </span>
                  </div>
                  <p className="font-medium text-ink">
                    {item.customer_name} · <span className="font-normal text-muted">{item.mobile_number}</span>
                  </p>
                  <p className="text-sm text-muted">
                    <Link href={`/bookings/${item.booking_id}`} className="font-mono text-xs text-brand-700 hover:underline">{item.booking_reference}</Link>
                    {item.area_name ? ` · ${item.area_name}` : ""}
                    {item.scheduled_date ? ` · ${t("bookings.delivery_on", { date: formatDate(item.scheduled_date) })}` : ""}
                  </p>
                  {item.last_reply && <q className="block text-sm text-ink">{item.last_reply}</q>}
                  {item.failure_reason && <p className="text-sm text-red-700">{item.failure_reason}</p>}
                  {item.notes.length > 0 && (
                    <ul className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3 text-sm" aria-label={t("followup.notes")}>
                      {(item.notes as { at: string; by: string; text: string }[]).map((n, i) => (
                        <li key={i}>
                          <span className="text-xs text-muted">{formatDateTime(n.at)} · {n.by}</span>
                          <span className="block text-ink">{n.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {writable && item.status !== "resolved" && (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setAction({ kind: "date", item })}>{t("followup.set_date")}</Button>
                    <Button variant="secondary" onClick={() => setAction({ kind: "contacted", item })}>{t("followup.contacted")}</Button>
                    <Button variant="secondary" onClick={() => setAction({ kind: "note", item })}>{t("followup.add_note")}</Button>
                    <Button variant="ghost" onClick={() => setAction({ kind: "resolve", item })}>{t("followup.resolve")}</Button>
                    <Button variant="ghost" onClick={() => setAction({ kind: "cancel", item })}>{t("followup.cancel_booking")}</Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {queue.data && queue.data.count > 0 && (
        <Pagination page={Number(filters.page || "1")} count={queue.data.count} pageSize={50} onChange={(page) => update({ page: String(page) })} />
      )}

      <SetDateDialog
        open={action?.kind === "date"}
        title={action ? t("followup.set_date_title", { name: action.item.customer_name }) : ""}
        onClose={() => setAction(null)}
        onSubmit={(date) => run("/api/portal/follow-ups/{id}/set-date", { scheduled_date: date }, t("followup.date_done", { date: formatDate(date) }))}
      />
      <Dialog
        open={action?.kind === "contacted" || action?.kind === "note" || action?.kind === "resolve"}
        title={action ? t(`followup.${action.kind}_title`, { name: action.item.customer_name }) : ""}
        onClose={() => { setAction(null); setNote(""); setError(undefined); }}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAction(null)}>{t("common.cancel")}</Button>
            <Button
              loading={busy}
              disabled={action?.kind === "note" && !note.trim()}
              onClick={() => {
                if (!action) return;
                const path = { contacted: "contacted", note: "note", resolve: "resolve" }[action.kind as "contacted" | "note" | "resolve"];
                const body = action.kind === "note" ? { text: note.trim() } : { note: note.trim() };
                void run(`/api/portal/follow-ups/{id}/${path}`, body, t(`followup.${action.kind}_done`)).catch(() => undefined);
              }}
            >
              {action ? t(`followup.${action.kind}_confirm`) : ""}
            </Button>
          </>
        }
      >
        {error && <Alert>{error}</Alert>}
        <TextAreaField
          label={action?.kind === "note" ? t("followup.note") : t("followup.note_optional")}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {action?.kind === "contacted" && <p className="mt-2 text-sm text-muted">{t("followup.contacted_hint")}</p>}
      </Dialog>
      <ReasonDialog
        open={action?.kind === "cancel"}
        title={action ? t("followup.cancel_title", { name: action.item.customer_name }) : ""}
        description={t("bookings.cancel_body")}
        label={t("bookings.cancel_reason")}
        confirmLabel={t("bookings.cancel")}
        cancelLabel={t("bookings.keep")}
        messages={{ tooShort: t("validation.reason_min"), tooLong: t("validation.reason_max") }}
        danger
        busy={busy}
        error={error}
        onSubmit={(reason) => void run("/api/portal/follow-ups/{id}/cancel-booking", { reason }, t("followup.cancel_done")).catch(() => undefined)}
        onClose={() => setAction(null)}
      />
    </>
  );
}

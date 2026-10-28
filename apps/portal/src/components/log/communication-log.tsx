"use client";

import { ApiError, unwrap } from "@saas/api-client";
import { Alert, Button, SelectField, Spinner, StatusPill, type StatusTone, TextField } from "@saas/ui";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { OUTCOME_TONES } from "@/components/bookings/labels";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { errorMessage, t } from "@/i18n";
import { api } from "@/lib/api";
import { formatDateTime, formatRupees } from "@/lib/format";
import { useCommunicationLog, usePortalConfig } from "@/lib/queries";
import type { LogEntry, LogResponse, RecordingLink } from "@/lib/types";

const FILTERS = ["date_from", "date_to", "channel", "delivery_status", "search", "has_recording", "page"] as const;
const STATUSES = ["sent", "delivered", "read", "answered", "failed"] as const;
export const DELIVERY_TONES: Record<string, StatusTone> = {
  queued: "neutral",
  sent: "info",
  delivered: "info",
  read: "ok",
  answered: "ok",
  failed: "error",
};

/** Whether the role may play call recordings (spec 1.1: not office staff). */
export function useCanPlay() {
  const role = usePortalConfig().data?.role;
  return role === "owner" || role === "manager" || role === "support";
}

/** Communication log (spec 2.8): every message and call, replies, transcripts and recordings. */
export function CommunicationLog() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = Object.fromEntries(FILTERS.map((k) => [k, params.get(k) ?? ""])) as Record<(typeof FILTERS)[number], string>;
  const query = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  const log = useCommunicationLog(query);
  const role = usePortalConfig().data?.role;
  const [search, setSearch] = useState(filters.search);

  function update(changes: Partial<typeof filters>) {
    const next = new URLSearchParams({ ...filters, page: "", ...changes });
    for (const [key, value] of [...next.entries()]) if (!value || (key === "page" && value === "1")) next.delete(key);
    router.replace(next.size ? `${pathname}?${next}` : pathname);
  }

  const exportQuery = new URLSearchParams(Object.entries(query).filter(([k]) => k !== "page"));
  const canExport = role === "owner" || role === "manager" || role === "support";
  return (
    <>
      <PageHeader
        title={t("nav.communication_log")}
        description={t("log.description")}
        actions={
          canExport && (
            <a href={`/api/portal/reports/message-log/export?${exportQuery}`} download>
              <Button variant="secondary">{t("reports.download_csv")}</Button>
            </a>
          )
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-[9.5rem_9.5rem_10rem_10rem_1fr_auto]">
        <TextField label={t("reports.from")} type="date" value={filters.date_from} onChange={(e) => update({ date_from: e.target.value })} />
        <TextField label={t("reports.to")} type="date" value={filters.date_to} onChange={(e) => update({ date_to: e.target.value })} />
        <SelectField
          label={t("log.channel")}
          value={filters.channel}
          placeholder={t("common.all")}
          options={["whatsapp", "voice"].map((c) => ({ value: c, label: t(`log.channel.${c}`) }))}
          onChange={(e) => update({ channel: e.target.value })}
        />
        <SelectField
          label={t("log.status")}
          value={filters.delivery_status}
          placeholder={t("common.all")}
          options={STATUSES.map((s) => ({ value: s, label: t(`delivery_status.${s}`) }))}
          onChange={(e) => update({ delivery_status: e.target.value })}
        />
        <form role="search" onSubmit={(e) => { e.preventDefault(); update({ search: search.trim() }); }}>
          <TextField
            label={t("log.search")}
            type="search"
            placeholder={t("log.search_placeholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => search.trim() !== filters.search && update({ search: search.trim() })}
          />
        </form>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={filters.has_recording === "true"}
            onChange={(e) => update({ has_recording: e.target.checked ? "true" : "" })}
          />
          {t("log.with_recording")}
        </label>
      </div>
      {log.isError && <Alert>{errorMessage(log.error)}</Alert>}
      {log.isPending ? (
        <Spinner label={t("app.loading")} />
      ) : log.data && log.data.results.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">{t("log.empty")}</p>
      ) : (
        <ul className="space-y-3" aria-label={t("nav.communication_log")}>
          {(log.data?.results ?? []).map((entry) => (
            <LogRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
      {log.data && log.data.count > 0 && (
        <Pagination page={Number(filters.page || "1")} count={log.data.count} pageSize={50} onChange={(page) => update({ page: String(page) })} />
      )}
    </>
  );
}

export function LogRow({ entry }: { entry: LogEntry }) {
  return (
    <li data-entry={entry.id} data-channel={entry.channel} className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="neutral">{t(`log.channel.${entry.channel}`)}</StatusPill>
            <StatusPill tone={DELIVERY_TONES[entry.delivery_status] ?? "neutral"}>{t(`delivery_status.${entry.delivery_status}`)}</StatusPill>
            <span className="text-xs text-muted">{formatDateTime(entry.sent_at)}</span>
          </div>
          <p className="font-medium text-ink">
            {entry.customer_name} · <span className="font-normal text-muted">{entry.mobile_number}</span>
          </p>
          <p className="text-sm text-muted">
            <Link href={`/bookings/${entry.booking_id}`} className="font-mono text-xs text-brand-700 hover:underline">{entry.booking_reference}</Link>
            {entry.area_name ? ` · ${entry.area_name}` : ""}
          </p>
          {entry.failure_reason && <p className="text-sm text-red-700">{entry.failure_reason}</p>}
        </div>
        <p className="text-sm tabular-nums text-muted" title={t("log.cost")}>{formatRupees(entry.cost_paise)}</p>
      </div>
      {entry.responses.length > 0 && (
        <ul className="mt-3 space-y-2 border-l-2 border-slate-200 pl-3" aria-label={t("log.replies")}>
          {entry.responses.map((reply) => (
            <Reply key={reply.id} entry={entry} reply={reply} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Reply({ entry, reply }: { entry: LogEntry; reply: LogResponse }) {
  return (
    <li className="space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">{formatDateTime(reply.received_at)}</span>
        {reply.outcome && <StatusPill tone={OUTCOME_TONES[reply.outcome] ?? "neutral"}>{t(`outcome.${reply.outcome}`)}</StatusPill>}
      </div>
      {reply.raw_text && <q className="block text-ink">{reply.raw_text}</q>}
      {reply.transcript && (
        <details>
          <summary className="cursor-pointer font-medium text-brand-700">{t("log.transcript")}</summary>
          <p className="mt-1 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-ink">{reply.transcript}</p>
        </details>
      )}
      {reply.has_recording && <RecordingPlayer attemptId={entry.id} expired={reply.recording_expired} />}
    </li>
  );
}

/**
 * Plays a call recording through a 5-minute link fetched on demand (each fetch is audited). When
 * the link runs out the player is removed; Play again asks for a new one.
 */
export function RecordingPlayer({ attemptId, expired }: { attemptId: string; expired: boolean }) {
  const canPlay = useCanPlay();
  const [link, setLink] = useState<RecordingLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [now, setNow] = useState(() => Date.now());
  const linkExpired = link ? new Date(link.expires_at).getTime() <= now : false;

  useEffect(() => {
    if (!link) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [link]);

  if (expired) return <p className="text-xs text-muted">{t("log.recording_deleted")}</p>;
  if (!canPlay) return <p className="text-xs text-muted">{t("log.recording_roles")}</p>;

  async function play() {
    setBusy(true);
    setError(undefined);
    try {
      const data = await unwrap(api.GET("/api/portal/communication-log/{id}/recording", { params: { path: { id: attemptId } } }));
      setNow(Date.now());
      setLink(data);
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 410 ? t("log.recording_deleted") : errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1" data-recording={attemptId}>
      {link && !linkExpired ? (
        <>
          <audio controls autoPlay src={link.url} aria-label={t("log.recording")} className="h-9 w-full max-w-md" />
          <p className="text-xs text-muted">
            {t("log.link_valid", { seconds: Math.max(0, Math.ceil((new Date(link.expires_at).getTime() - now) / 1000)) })}
          </p>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" loading={busy} onClick={play}>
            {link ? t("log.play_again") : t("log.play")}
          </Button>
          {link && <span className="text-xs text-muted">{t("log.link_expired")}</span>}
        </div>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

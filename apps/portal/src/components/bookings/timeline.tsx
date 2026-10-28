"use client";

import { Alert, Dialog, Spinner, StatusPill } from "@saas/ui";

import { errorMessage, t } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { useTimeline } from "@/lib/queries";
import type { TimelineEntry } from "@/lib/types";

import { OUTCOME_TONES } from "./labels";

function describe(entry: TimelineEntry): React.ReactNode {
  const d = entry.data as Record<string, string | number | boolean | null>;
  switch (entry.kind) {
    case "attempt":
      return (
        <>
          {t(`timeline.attempt.${d.channel}`)} · {t(`delivery_status.${d.delivery_status}`)}
          {d.failure_reason ? ` · ${d.failure_reason}` : ""}
        </>
      );
    case "response":
      return (
        <span className="space-y-1">
          <span className="block">
            {t("timeline.reply")}
            {d.outcome && (
              <span className="ml-2">
                <StatusPill tone={OUTCOME_TONES[String(d.outcome)] ?? "neutral"}>{t(`outcome.${d.outcome}`)}</StatusPill>
              </span>
            )}
          </span>
          {(d.text || d.transcript) && <q className="block text-muted">{String(d.text || d.transcript)}</q>}
        </span>
      );
    case "outcome_set":
      return t("timeline.outcome_set", { outcome: t(`outcome.${d.outcome}`) });
    case "date_set":
    case "date_changed":
      return t(`timeline.${entry.kind}`, { date: String(d.scheduled_date ?? "") });
    case "job_created":
      return t("timeline.job_created", { staff: String(d.staff ?? t("common.none")) });
    case "job_reassigned":
      return t("timeline.job_reassigned", { staff: String(d.staff ?? t("common.none")) });
    case "follow_up_opened":
      return t("timeline.follow_up_opened", { outcome: t(`outcome.${d.outcome}`) });
    case "note":
    case "follow_up_contacted":
      return (
        <>
          {t(`timeline.${entry.kind}`)}
          {d.text || d.note ? <q className="ml-1 text-muted">{String(d.text || d.note)}</q> : null}
        </>
      );
    case "cancelled":
      return t("timeline.cancelled", { reason: String(d.reason ?? "") });
    default:
      return t(`timeline.${entry.kind}`);
  }
}

/** Every status change, reminder, reply and note for a booking, oldest first (spec 2.3). */
export function Timeline({ bookingId }: { bookingId: string }) {
  const timeline = useTimeline(bookingId);
  if (timeline.isError) return <Alert>{errorMessage(timeline.error)}</Alert>;
  if (!timeline.data) return <Spinner label={t("app.loading")} />;
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5" aria-label={t("timeline.title")}>
      {timeline.data.map((entry, index) => (
        <li key={index} data-kind={entry.kind} className="relative text-sm">
          <span aria-hidden className="absolute -left-[1.6rem] top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-white" />
          <p className="text-xs text-muted">
            {formatDateTime(entry.at)}
            {entry.actor_email ? ` · ${entry.actor_email}` : ""}
          </p>
          <div className="text-ink">{describe(entry)}</div>
        </li>
      ))}
    </ol>
  );
}

export function TimelineDrawer({ bookingId, title, onClose }: { bookingId: string | null; title: string; onClose: () => void }) {
  return (
    <Dialog open={bookingId !== null} title={title} onClose={onClose} size="lg">
      {bookingId && <Timeline bookingId={bookingId} />}
    </Dialog>
  );
}

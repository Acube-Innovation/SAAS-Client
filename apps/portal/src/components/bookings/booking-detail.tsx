"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { unwrap } from "@saas/api-client";
import { Alert, Button, Dialog, ReasonDialog, StatusPill, TextField } from "@saas/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { PageHeader } from "@/components/page-header";
import { errorMessage, fieldError, t } from "@/i18n";
import { api, ensureCsrf } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { keys, usePortalConfig, useRefresh } from "@/lib/queries";
import { newDateSchema, todayIso } from "@/lib/schemas";
import type { Booking } from "@/lib/types";

import { BookingForm } from "./booking-form";
import { bookingTone, OUTCOME_TONES } from "./labels";
import { Timeline } from "./timeline";

/** Set a (new) delivery date: the reminder cycle restarts. Used by bookings and the follow-up queue. */
export function SetDateDialog({ open, title, onClose, onSubmit }: { open: boolean; title: string; onClose: () => void; onSubmit: (date: string) => Promise<void> }) {
  const [error, setError] = useState<string>();
  const form = useForm<{ scheduled_date: string }>({ resolver: zodResolver(newDateSchema), defaultValues: { scheduled_date: "" } });
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" form="set-date-form" loading={form.formState.isSubmitting}>{t("bookings.set_date")}</Button>
        </>
      }
    >
      <form
        id="set-date-form"
        noValidate
        className="space-y-3"
        onSubmit={form.handleSubmit(async ({ scheduled_date }) => {
          setError(undefined);
          try {
            await onSubmit(scheduled_date);
            form.reset();
          } catch (caught) {
            setError(errorMessage(caught));
          }
        })}
      >
        {error && <Alert>{error}</Alert>}
        <TextField label={t("bookings.new_date")} type="date" min={todayIso()} required error={fieldError(form.formState.errors.scheduled_date)} {...form.register("scheduled_date")} />
        <p className="text-sm text-muted">{t("bookings.set_date_hint")}</p>
      </form>
    </Dialog>
  );
}

export function BookingDetail({ booking }: { booking: Booking }) {
  const config = usePortalConfig();
  const refresh = useRefresh();
  const [dialog, setDialog] = useState<"date" | "cancel" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const writable = config.data?.role !== "support" && config.data?.tenant_status !== "suspended";
  const cancelled = booking.status === "cancelled";

  async function setDate(date: string) {
    await ensureCsrf();
    await unwrap(api.POST("/api/portal/bookings/{id}/set-date", { params: { path: { id: booking.id } }, body: { scheduled_date: date } }));
    await refresh(keys.bookings, keys.deliveries, keys.followUps);
    setDialog(null);
    setNotice(t("bookings.date_set", { date: formatDate(date) }));
  }

  async function cancel(reason: string) {
    setBusy(true);
    setError(undefined);
    try {
      await ensureCsrf();
      await unwrap(api.POST("/api/portal/bookings/{id}/cancel", { params: { path: { id: booking.id } }, body: { reason } }));
      await refresh(keys.bookings, keys.deliveries, keys.followUps);
      setDialog(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={booking.booking_reference}
        description={`${booking.subscriber_name} · ${booking.subscriber_mobile}${booking.area_name ? ` · ${booking.area_name}` : ""}`}
        actions={
          writable && !cancelled && (
            <>
              <Button variant="secondary" onClick={() => setDialog("date")}>{booking.scheduled_date ? t("bookings.change_date") : t("bookings.set_date")}</Button>
              <Button variant="danger" onClick={() => setDialog("cancel")}>{t("bookings.cancel")}</Button>
            </>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusPill tone={bookingTone(booking.status)}>{t(`booking_status.${booking.status}`)}</StatusPill>
        {booking.outcome && <StatusPill tone={OUTCOME_TONES[booking.outcome] ?? "neutral"}>{t(`outcome.${booking.outcome}`)}</StatusPill>}
        <span className="text-sm text-muted">
          {booking.scheduled_date ? t("bookings.delivery_on", { date: formatDate(booking.scheduled_date) }) : t("bookings.no_date")}
        </span>
        {booking.job && (
          <span className="text-sm text-muted">· {t("bookings.assigned_to", { staff: booking.job.assigned_staff_name ?? t("common.none") })}</span>
        )}
        {booking.new_date_requested && <span className="text-sm text-amber-800">· {t("bookings.new_date_requested", { date: formatDate(booking.new_date_requested) })}</span>}
      </div>
      {cancelled && <Alert tone="warn">{t("bookings.cancelled_note", { date: formatDateTime(booking.cancelled_at), reason: booking.cancel_reason })}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}
      <div className="mt-4 grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div>{writable && !cancelled ? <BookingForm key={booking.updated_at} booking={booking} onSaved={() => setNotice(t("common.saved"))} /> : null}</div>
        <section className="rounded-xl border border-slate-200 bg-white p-5" aria-label={t("timeline.title")}>
          <h2 className="mb-4 text-sm font-semibold text-ink">{t("timeline.title")}</h2>
          <Timeline key={booking.updated_at} bookingId={booking.id} />
        </section>
      </div>
      <SetDateDialog open={dialog === "date"} title={t("bookings.set_date_title", { ref: booking.booking_reference })} onClose={() => setDialog(null)} onSubmit={setDate} />
      <ReasonDialog
        open={dialog === "cancel"}
        title={t("bookings.cancel_title", { ref: booking.booking_reference })}
        description={t("bookings.cancel_body")}
        label={t("bookings.cancel_reason")}
        confirmLabel={t("bookings.cancel")}
        cancelLabel={t("bookings.keep")}
        messages={{ tooShort: t("validation.reason_min"), tooLong: t("validation.reason_max") }}
        danger
        busy={busy}
        error={error}
        onSubmit={cancel}
        onClose={() => setDialog(null)}
      />
    </>
  );
}

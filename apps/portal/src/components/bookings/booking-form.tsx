"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { unwrap } from "@saas/api-client";
import { Alert, Button, SelectField, TextAreaField, TextField } from "@saas/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";

import { fieldError, t } from "@/i18n";
import { api, ensureCsrf } from "@/lib/api";
import { keys, usePortalConfig, useRefresh, useSubscribers } from "@/lib/queries";
import { bookingSchema, todayIso } from "@/lib/schemas";
import { applyServerErrors } from "@/lib/server-errors";
import type { Booking, FieldDef } from "@/lib/types";

type Values = z.input<typeof bookingSchema>;
const FIELDS = ["booking_reference", "subscriber", "booking_date", "scheduled_date", "cylinder_type", "quantity", "remarks"] as const;

/** Picks a subscriber by name, mobile or reference (search as you type). */
function SubscriberPicker({ value, label, onPick, error }: { value: string; label: string; onPick: (id: string, name: string) => void; error?: string }) {
  const [term, setTerm] = useState("");
  const [chosen, setChosen] = useState(value ? label : "");
  const results = useSubscribers(term.trim().length >= 2 ? { search: term.trim(), status: "active" } : { search: "__none__" });
  const options = term.trim().length >= 2 ? (results.data?.results ?? []) : [];
  return (
    <div className="space-y-2">
      <TextField
        label={t("bookings.subscriber")}
        required
        placeholder={t("bookings.subscriber_placeholder")}
        value={term}
        error={error}
        hint={chosen ? t("bookings.subscriber_chosen", { name: chosen }) : undefined}
        onChange={(e) => setTerm(e.target.value)}
      />
      {options.length > 0 && (
        <ul role="listbox" aria-label={t("bookings.subscriber_results")} className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white">
          {options.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                role="option"
                aria-selected={s.id === value}
                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  onPick(s.id, `${s.customer_name} (${s.external_ref})`);
                  setChosen(`${s.customer_name} (${s.external_ref})`);
                  setTerm("");
                }}
              >
                <span className="font-medium">{s.customer_name}</span>
                <span className="ml-2 text-xs text-muted">{s.external_ref} · {s.mobile_number}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Add or edit a booking (spec 2.3). Date changes on an existing booking go through Set date. */
export function BookingForm({ booking, onSaved }: { booking?: Booking; onSaved?: () => void }) {
  const router = useRouter();
  const refresh = useRefresh();
  const config = usePortalConfig();
  const [error, setError] = useState<string>();
  const schedule = (config.data?.schedule_types as { fields?: FieldDef[] }[] | undefined)?.[0];
  const field = (key: string) => schedule?.fields?.find((f) => f.key === key);
  const custom = (booking?.custom_fields ?? {}) as { cylinder_type?: string; quantity?: number };
  const form = useForm<Values>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      booking_reference: booking?.booking_reference ?? "",
      subscriber: booking?.subscriber ?? "",
      booking_date: booking?.booking_date ?? todayIso(),
      scheduled_date: booking?.scheduled_date ?? "",
      cylinder_type: custom.cylinder_type ?? "",
      quantity: custom.quantity ?? 1,
      remarks: booking?.remarks ?? "",
    },
  });
  const subscriber = useWatch({ control: form.control, name: "subscriber" });
  const errors = form.formState.errors;

  async function onSubmit(values: Values) {
    setError(undefined);
    const body = {
      booking_reference: values.booking_reference,
      booking_date: values.booking_date,
      remarks: values.remarks,
      custom_fields: { cylinder_type: values.cylinder_type, quantity: values.quantity },
      ...(booking ? {} : { subscriber: values.subscriber, scheduled_date: values.scheduled_date || null }),
    };
    try {
      await ensureCsrf();
      const saved = booking
        ? await unwrap(api.PATCH("/api/portal/bookings/{id}", { params: { path: { id: booking.id } }, body: body as never }))
        : await unwrap(api.POST("/api/portal/bookings", { body: body as never }));
      await refresh(keys.bookings);
      if (onSaved) onSaved();
      else router.push(`/bookings/${saved.id}?saved=1`);
    } catch (caught) {
      const message = applyServerErrors(caught, form.setError, FIELDS);
      const nested = (caught as { fields?: { custom_fields?: Record<string, string[]> } }).fields?.custom_fields;
      if (nested) for (const [key, messages] of Object.entries(nested)) form.setError(key as "cylinder_type" | "quantity", { message: messages[0] });
      setError(nested ? undefined : message);
    }
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} aria-label={booking ? t("bookings.edit") : t("bookings.add")} className="space-y-6">
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
        <TextField label={field("booking_reference")?.label ?? t("bookings.reference")} required error={fieldError(errors.booking_reference)} {...form.register("booking_reference")} />
        {booking ? (
          <TextField label={t("bookings.subscriber")} value={`${booking.subscriber_name} (${booking.subscriber_external_ref})`} disabled readOnly />
        ) : (
          <SubscriberPicker
            value={subscriber}
            label=""
            error={fieldError(errors.subscriber)}
            onPick={(id) => form.setValue("subscriber", id, { shouldValidate: true })}
          />
        )}
        <TextField label={field("booking_date")?.label ?? t("bookings.booking_date")} type="date" max={todayIso()} required error={fieldError(errors.booking_date)} {...form.register("booking_date")} />
        {!booking && (
          <TextField
            label={field("scheduled_date")?.label ?? t("bookings.scheduled_date")}
            type="date"
            min={todayIso()}
            hint={t("bookings.scheduled_hint")}
            error={fieldError(errors.scheduled_date)}
            {...form.register("scheduled_date")}
          />
        )}
        <SelectField
          label={field("cylinder_type")?.label ?? t("bookings.item")}
          required
          placeholder={t("common.choose")}
          options={(field("cylinder_type")?.options ?? []).map((o) => ({ value: o, label: o }))}
          error={fieldError(errors.cylinder_type)}
          {...form.register("cylinder_type")}
        />
        <TextField label={field("quantity")?.label ?? t("bookings.quantity")} type="number" min={1} max={99} required error={fieldError(errors.quantity)} {...form.register("quantity", { valueAsNumber: true })} />
        <div className="sm:col-span-2">
          <TextAreaField label={field("remarks")?.label ?? t("bookings.remarks")} rows={2} hint={t("bookings.remarks_hint")} error={fieldError(errors.remarks)} {...form.register("remarks")} />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => router.push("/bookings")}>{t("common.cancel")}</Button>
        <Button type="submit" loading={form.formState.isSubmitting}>{booking ? t("common.save") : t("bookings.add")}</Button>
      </div>
    </form>
  );
}

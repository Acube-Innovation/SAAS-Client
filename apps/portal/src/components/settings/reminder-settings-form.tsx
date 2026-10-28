"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { unwrap } from "@saas/api-client";
import { Alert, Button, SelectField, Spinner, StatusPill, TextField } from "@saas/ui";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";

import { errorMessage, fieldError, t } from "@/i18n";
import { api, ensureCsrf } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { keys, usePortalConfig, useRefresh, useReminderSettings } from "@/lib/queries";
import { LANGUAGES, reminderSchema } from "@/lib/schemas";
import { applyServerErrors } from "@/lib/server-errors";
import type { ReminderSettings } from "@/lib/types";

type Values = z.input<typeof reminderSchema>;
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const FIELDS = ["send_time", "days_before", "wait_minutes", "quiet_start", "quiet_end", "default_language",
  "delivery_weekdays", "holiday_dates"] as const;

/** Reminder settings (spec 2.10). Changes apply to reminders not yet sent. */
export function ReminderSettingsForm({ onSaved }: { onSaved?: () => void }) {
  const settings = useReminderSettings();
  // Kept here: the form re-mounts with the saved values, which would clear its own state.
  const [saved, setSaved] = useState(false);
  if (settings.isError) return <Alert>{errorMessage(settings.error)}</Alert>;
  if (!settings.data) return <Spinner label={t("app.loading")} />;
  return (
    <div className="space-y-4">
      {saved && <Alert tone="success">{t("settings.saved")}</Alert>}
      <Form
        key={settings.data.saved_at ?? "new"}
        data={settings.data}
        onChange={() => setSaved(false)}
        onSaved={() => {
          setSaved(true);
          onSaved?.();
        }}
      />
    </div>
  );
}

function Form({ data, onSaved, onChange }: { data: ReminderSettings; onSaved: () => void; onChange: () => void }) {
  const config = usePortalConfig();
  const refresh = useRefresh();
  const [error, setError] = useState<string>();
  const [holiday, setHoliday] = useState("");
  const readOnly = config.data?.role === "support" || config.data?.tenant_status === "suspended";
  const form = useForm<Values>({
    resolver: zodResolver(reminderSchema),
    defaultValues: {
      send_time: data.send_time,
      days_before: data.days_before,
      wait_minutes: data.wait_minutes,
      quiet_start: data.quiet_start,
      quiet_end: data.quiet_end,
      default_language: data.default_language as Values["default_language"],
      delivery_weekdays: data.delivery_weekdays,
      holiday_dates: data.holiday_dates ?? [],
    },
  });
  const errors = form.formState.errors;

  async function onSubmit(values: Values) {
    setError(undefined);
    onChange();
    try {
      await ensureCsrf();
      await unwrap(api.PUT("/api/portal/reminder-settings", { body: values as never }));
      await refresh(keys.reminderSettings, keys.config);
      onSaved();
    } catch (caught) {
      setError(applyServerErrors(caught, form.setError, FIELDS));
    }
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} aria-label={t("nav.reminder_settings")} className="space-y-6">
      {error && <Alert>{error}</Alert>}
      <fieldset disabled={readOnly} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-3">
        <TextField label={t("settings.send_time")} type="time" required hint={t("settings.send_time_hint")} error={fieldError(errors.send_time)} {...form.register("send_time")} />
        <TextField label={t("settings.days_before")} type="number" min={0} max={7} required hint={t("settings.days_before_hint")} error={fieldError(errors.days_before)} {...form.register("days_before", { valueAsNumber: true })} />
        <TextField label={t("settings.wait_minutes")} type="number" min={30} max={1440} required hint={t("settings.wait_minutes_hint")} error={fieldError(errors.wait_minutes)} {...form.register("wait_minutes", { valueAsNumber: true })} />
        <TextField label={t("settings.quiet_start")} type="time" required error={fieldError(errors.quiet_start)} {...form.register("quiet_start")} />
        <TextField label={t("settings.quiet_end")} type="time" required hint={t("settings.quiet_hint")} error={fieldError(errors.quiet_end)} {...form.register("quiet_end")} />
        <SelectField
          label={t("settings.default_language")}
          required
          options={LANGUAGES.map((code) => ({ value: code, label: t(`language.${code}`) }))}
          error={fieldError(errors.default_language)}
          {...form.register("default_language")}
        />
      </fieldset>

      <fieldset disabled={readOnly} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        <legend className="px-1 text-sm font-medium text-ink">{t("settings.delivery_weekdays")}</legend>
        <Controller
          control={form.control}
          name="delivery_weekdays"
          render={({ field }) => (
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => {
                const on = field.value.includes(day);
                return (
                  <label key={day} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${on ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-300 text-ink"}`}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={() =>
                        field.onChange(on ? field.value.filter((d) => d !== day) : [...field.value, day].sort())
                      }
                    />
                    {t(`weekday.${day}`)}
                  </label>
                );
              })}
            </div>
          )}
        />
        {errors.delivery_weekdays && <p className="text-sm text-red-700">{fieldError(errors.delivery_weekdays)}</p>}

        <div className="pt-2">
          <p className="text-sm font-medium text-ink">{t("settings.holidays")}</p>
          <Controller
            control={form.control}
            name="holiday_dates"
            render={({ field }) => (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-2">
                  {field.value.length === 0 && <span className="text-sm text-muted">{t("settings.no_holidays")}</span>}
                  {field.value.map((day) => (
                    <span key={day} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm">
                      {formatDate(day)}
                      {!readOnly && (
                        <button type="button" aria-label={t("settings.remove_holiday", { date: formatDate(day) })} className="text-muted hover:text-red-700" onClick={() => field.onChange(field.value.filter((d) => d !== day))}>
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {!readOnly && (
                  <div className="flex items-end gap-2">
                    <TextField label={t("settings.add_holiday")} type="date" value={holiday} onChange={(e) => setHoliday(e.target.value)} />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!holiday}
                      onClick={() => {
                        if (!field.value.includes(holiday)) field.onChange([...field.value, holiday].sort());
                        setHoliday("");
                      }}
                    >
                      {t("settings.add")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          />
          {errors.holiday_dates && <p className="mt-1 text-sm text-red-700">{fieldError(errors.holiday_dates as { message?: string })}</p>}
        </div>
      </fieldset>

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-label={t("settings.linked_templates")}>
        <h3 className="text-sm font-medium text-ink">{t("settings.linked_templates")}</h3>
        {data.linked_templates.length === 0 ? (
          <p className="mt-1 text-sm text-muted">{t("settings.no_templates")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {data.linked_templates.map((tpl) => (
              <li key={tpl.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-mono">{tpl.name} · {tpl.language.toUpperCase()}</span>
                {tpl.live_version ? (
                  <StatusPill tone="ok">{t("settings.live_version", { version: tpl.live_version })}</StatusPill>
                ) : (
                  <StatusPill tone="neutral">{t(`template_status.${tpl.latest_status}`)}</StatusPill>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!readOnly && (
        <div className="flex items-center justify-end gap-3">
          <span className="text-xs text-muted">{t("settings.applies_to")}</span>
          <Button type="submit" loading={form.formState.isSubmitting}>
            {t("settings.save")}
          </Button>
        </div>
      )}
    </form>
  );
}

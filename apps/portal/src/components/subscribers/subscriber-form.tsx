"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { unwrap } from "@saas/api-client";
import { normalizeIndianMobile } from "@saas/api-client/schemas";
import { Alert, Button, ConfirmDialog, SelectField, StatusPill, TextAreaField, TextField } from "@saas/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";

import { PageHeader } from "@/components/page-header";
import { errorMessage, fieldError, t } from "@/i18n";
import { api, ensureCsrf } from "@/lib/api";
import { keys, useAreas, usePortalConfig, useRefresh } from "@/lib/queries";
import { CONSENT_SOURCES, LANGUAGES, subscriberSchema } from "@/lib/schemas";
import { applyServerErrors } from "@/lib/server-errors";
import type { FieldDef, Subscriber } from "@/lib/types";

type Values = z.input<typeof subscriberSchema>;
const FIELDS = [
  "customer_name", "mobile_number", "alternate_number", "external_ref", "preferred_language", "address", "area",
  "whatsapp_consent", "consent_date", "consent_source", "status", "custom_fields",
] as const;

function initial(subscriber: Subscriber | undefined, language: string): Values {
  return {
    customer_name: subscriber?.customer_name ?? "",
    mobile_number: subscriber?.mobile_number ?? "",
    alternate_number: subscriber?.alternate_number ?? "",
    external_ref: subscriber?.external_ref ?? "",
    preferred_language: (subscriber?.preferred_language ?? language) as Values["preferred_language"],
    address: subscriber?.address ?? "",
    area: subscriber?.area ?? "",
    whatsapp_consent: subscriber?.whatsapp_consent ?? false,
    consent_date: subscriber?.consent_date ?? "",
    consent_source: subscriber?.consent_source ?? "",
    status: (subscriber?.status ?? "active") as Values["status"],
    custom_fields: (subscriber?.custom_fields as Record<string, unknown>) ?? {},
  };
}

/** Add or edit a subscriber (spec 2.2). Labels come from the industry template. */
export function SubscriberForm({ subscriber }: { subscriber?: Subscriber }) {
  const router = useRouter();
  const refresh = useRefresh();
  const config = usePortalConfig();
  const areas = useAreas();
  const [error, setError] = useState<string>();
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const fields = (config.data?.subscriber_fields ?? []) as unknown as FieldDef[];
  const label = (key: string, fallback: string) => fields.find((f) => f.key === key)?.label ?? fallback;
  const custom = fields.filter((f) => !f.is_core);
  const readOnly = config.data?.role === "support" || config.data?.tenant_status === "suspended";
  const form = useForm<Values>({
    resolver: zodResolver(subscriberSchema),
    defaultValues: initial(subscriber, config.data?.default_language ?? "ml"),
  });
  const consent = useWatch({ control: form.control, name: "whatsapp_consent" });
  const errors = form.formState.errors;

  async function onSubmit(values: Values) {
    setError(undefined);
    const body = {
      ...values,
      mobile_number: normalizeIndianMobile(values.mobile_number),
      alternate_number: values.alternate_number ? normalizeIndianMobile(values.alternate_number) : "",
      area: values.area || null,
      consent_date: values.whatsapp_consent ? values.consent_date : null,
      consent_source: values.whatsapp_consent ? values.consent_source : "",
    };
    try {
      await ensureCsrf();
      const saved = subscriber
        ? await unwrap(api.PATCH("/api/portal/subscribers/{id}", { params: { path: { id: subscriber.id } }, body: body as never }))
        : await unwrap(api.POST("/api/portal/subscribers", { body: body as never }));
      await refresh(keys.subscribers);
      router.push(`/subscribers/${saved.id}?saved=1`);
    } catch (caught) {
      setError(applyServerErrors(caught, form.setError, FIELDS));
    }
  }

  async function deactivate() {
    if (!subscriber) return;
    try {
      await ensureCsrf();
      await unwrap(api.POST("/api/portal/subscribers/{id}/deactivate", { params: { path: { id: subscriber.id } } }));
      await refresh(keys.subscribers);
      setConfirmDeactivate(false);
      router.refresh();
      form.setValue("status", "inactive");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <>
      <PageHeader
        title={subscriber ? subscriber.customer_name : t("subscribers.add")}
        description={subscriber ? `${label("external_ref", t("subscribers.external_ref"))} ${subscriber.external_ref}` : t("subscribers.add_intro")}
        actions={
          subscriber && (
            <span className="flex items-center gap-2">
              {subscriber.opted_out && <StatusPill tone="error">{t("subscribers.opted_out")}</StatusPill>}
              {subscriber.status === "active" && !readOnly && (
                <Button variant="secondary" onClick={() => setConfirmDeactivate(true)}>
                  {t("subscribers.deactivate")}
                </Button>
              )}
            </span>
          )
        }
      />
      {subscriber?.opted_out && <Alert tone="warn">{t("subscribers.opted_out_note")}</Alert>}
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="mt-4 space-y-6">
        {error && <Alert>{error}</Alert>}
        <fieldset disabled={readOnly} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
          <TextField label={label("customer_name", t("subscribers.customer_name"))} required error={fieldError(errors.customer_name)} {...form.register("customer_name")} />
          <TextField label={label("external_ref", t("subscribers.external_ref"))} required error={fieldError(errors.external_ref)} {...form.register("external_ref")} />
          <TextField label={label("mobile_number", t("subscribers.mobile_number"))} required hint={t("subscribers.mobile_hint")} error={fieldError(errors.mobile_number)} {...form.register("mobile_number")} />
          <TextField label={label("alternate_number", t("subscribers.alternate_number"))} error={fieldError(errors.alternate_number)} {...form.register("alternate_number")} />
          <SelectField
            label={label("preferred_language", t("subscribers.preferred_language"))}
            required
            options={LANGUAGES.map((code) => ({ value: code, label: t(`language.${code}`) }))}
            error={fieldError(errors.preferred_language)}
            {...form.register("preferred_language")}
          />
          <SelectField
            label={label("area", t("subscribers.col.area"))}
            placeholder={t("common.none")}
            options={(areas.data ?? [])
              .filter((a) => a.is_active || a.id === subscriber?.area)
              .map((a) => ({ value: a.id, label: a.name }))}
            error={fieldError(errors.area)}
            {...form.register("area")}
          />
          <div className="sm:col-span-2">
            <TextAreaField label={label("address", t("subscribers.address"))} rows={2} error={fieldError(errors.address)} {...form.register("address")} />
          </div>
          <SelectField
            label={t("subscribers.col.status")}
            options={[
              { value: "active", label: t("status.active") },
              { value: "inactive", label: t("status.inactive") },
            ]}
            {...form.register("status")}
          />
        </fieldset>

        <fieldset disabled={readOnly} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-3">
          <legend className="sr-only">{t("subscribers.consent_section")}</legend>
          <label className="flex items-center gap-2 text-sm font-medium text-ink sm:col-span-3">
            <input type="checkbox" className="h-4 w-4" {...form.register("whatsapp_consent")} />
            {label("whatsapp_consent", t("subscribers.whatsapp_consent"))}
          </label>
          {consent && (
            <>
              <TextField label={t("subscribers.consent_date")} type="date" required error={fieldError(errors.consent_date)} {...form.register("consent_date")} />
              <SelectField
                label={t("subscribers.consent_source")}
                required
                placeholder={t("common.choose")}
                options={CONSENT_SOURCES.map((value) => ({ value, label: t(`consent_source.${value}`) }))}
                error={fieldError(errors.consent_source)}
                {...form.register("consent_source")}
              />
            </>
          )}
          <p className="text-xs text-muted sm:col-span-3">{t("subscribers.consent_hint")}</p>
        </fieldset>

        {custom.length > 0 && (
          <fieldset disabled={readOnly} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
            <legend className="sr-only">{t("subscribers.more_fields")}</legend>
            {custom.map((field) =>
              field.field_type === "choice" ? (
                <SelectField
                  key={field.key}
                  label={field.label}
                  required={field.required}
                  placeholder={t("common.choose")}
                  options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
                  error={fieldError((errors.custom_fields as Record<string, { message?: string }> | undefined)?.[field.key])}
                  {...form.register(`custom_fields.${field.key}`)}
                />
              ) : field.field_type === "boolean" ? (
                <label key={field.key} className="flex items-center gap-2 text-sm font-medium text-ink">
                  <input type="checkbox" className="h-4 w-4" {...form.register(`custom_fields.${field.key}`)} />
                  {field.label}
                </label>
              ) : (
                <TextField
                  key={field.key}
                  label={field.label}
                  required={field.required}
                  type={field.field_type === "date" ? "date" : field.field_type === "number" ? "number" : "text"}
                  error={fieldError((errors.custom_fields as Record<string, { message?: string }> | undefined)?.[field.key])}
                  {...form.register(`custom_fields.${field.key}`)}
                />
              ),
            )}
          </fieldset>
        )}

        {!readOnly && (
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => router.push("/subscribers")}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              {subscriber ? t("common.save") : t("subscribers.add")}
            </Button>
          </div>
        )}
      </form>
      <ConfirmDialog
        open={confirmDeactivate}
        title={t("subscribers.deactivate_title")}
        message={t("subscribers.deactivate_body")}
        confirmLabel={t("subscribers.deactivate")}
        cancelLabel={t("common.cancel")}
        danger
        onConfirm={deactivate}
        onClose={() => setConfirmDeactivate(false)}
      />
    </>
  );
}

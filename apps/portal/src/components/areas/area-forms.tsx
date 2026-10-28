"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { unwrap } from "@saas/api-client";
import { normalizeIndianMobile } from "@saas/api-client/schemas";
import { Alert, Button, SelectField, TextField } from "@saas/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { fieldError, t } from "@/i18n";
import { api, ensureCsrf } from "@/lib/api";
import { keys, useRefresh, useStaff } from "@/lib/queries";
import { areaSchema, staffSchema } from "@/lib/schemas";
import { applyServerErrors } from "@/lib/server-errors";
import type { Area, StaffMember } from "@/lib/types";

type AreaValues = z.input<typeof areaSchema>;
type StaffValues = z.input<typeof staffSchema>;

/** Add or edit an area (spec 2.7): name unique in the agency, optional code and default staff. */
export function AreaForm({ area, onSaved }: { area?: Area; onSaved?: () => void }) {
  const refresh = useRefresh();
  const staff = useStaff();
  const [error, setError] = useState<string>();
  const form = useForm<AreaValues>({
    resolver: zodResolver(areaSchema),
    defaultValues: {
      name: area?.name ?? "",
      code: area?.code ?? "",
      default_staff: area?.default_staff ?? "",
      is_active: area?.is_active ?? true,
    },
  });
  const errors = form.formState.errors;

  async function onSubmit(values: AreaValues) {
    setError(undefined);
    const body = { ...values, default_staff: values.default_staff || null };
    try {
      await ensureCsrf();
      if (area) await unwrap(api.PATCH("/api/portal/areas/{id}", { params: { path: { id: area.id } }, body: body as never }));
      else await unwrap(api.POST("/api/portal/areas", { body: body as never }));
      await refresh(keys.areas);
      if (!area) form.reset({ name: "", code: "", default_staff: values.default_staff, is_active: true });
      onSaved?.();
    } catch (caught) {
      setError(applyServerErrors(caught, form.setError, ["name", "code", "default_staff", "is_active"]));
    }
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} aria-label={area ? t("areas.edit") : t("areas.add")} className="space-y-3">
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem_1fr]">
        <TextField label={t("areas.name")} required error={fieldError(errors.name)} {...form.register("name")} />
        <TextField label={t("areas.code")} error={fieldError(errors.code)} {...form.register("code")} />
        <SelectField
          label={t("areas.default_staff")}
          placeholder={t("common.none")}
          options={(staff.data?.results ?? [])
            .filter((s) => s.is_active || s.id === area?.default_staff)
            .map((s) => ({ value: s.id, label: s.name }))}
          error={fieldError(errors.default_staff)}
          {...form.register("default_staff")}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        {area ? (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="h-4 w-4" {...form.register("is_active")} />
            {t("areas.active")}
          </label>
        ) : (
          <span className="text-xs text-muted">{t("areas.default_staff_hint")}</span>
        )}
        <Button type="submit" loading={form.formState.isSubmitting}>
          {area ? t("common.save") : t("areas.add")}
        </Button>
      </div>
    </form>
  );
}

/** Add or edit a delivery staff member (not a portal user). */
export function StaffForm({ member, onSaved }: { member?: StaffMember; onSaved?: () => void }) {
  const refresh = useRefresh();
  const [error, setError] = useState<string>();
  const form = useForm<StaffValues>({
    resolver: zodResolver(staffSchema),
    defaultValues: { name: member?.name ?? "", phone: member?.phone ?? "", is_active: member?.is_active ?? true },
  });
  const errors = form.formState.errors;

  async function onSubmit(values: StaffValues) {
    setError(undefined);
    const body = { ...values, phone: values.phone ? normalizeIndianMobile(values.phone) : "" };
    try {
      await ensureCsrf();
      if (member) await unwrap(api.PATCH("/api/portal/staff/{id}", { params: { path: { id: member.id } }, body }));
      else await unwrap(api.POST("/api/portal/staff", { body }));
      await refresh(keys.staff);
      if (!member) form.reset({ name: "", phone: "", is_active: true });
      onSaved?.();
    } catch (caught) {
      setError(applyServerErrors(caught, form.setError, ["name", "phone", "is_active"]));
    }
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} aria-label={member ? t("staff.edit") : t("staff.add")} className="space-y-3">
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={t("staff.name")} required error={fieldError(errors.name)} {...form.register("name")} />
        <TextField label={t("staff.phone")} hint={t("subscribers.mobile_hint")} error={fieldError(errors.phone)} {...form.register("phone")} />
      </div>
      <div className="flex items-center justify-between gap-3">
        {member ? (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="h-4 w-4" {...form.register("is_active")} />
            {t("areas.active")}
          </label>
        ) : (
          <span />
        )}
        <Button type="submit" variant={member ? "primary" : "secondary"} loading={form.formState.isSubmitting}>
          {member ? t("common.save") : t("staff.add")}
        </Button>
      </div>
    </form>
  );
}

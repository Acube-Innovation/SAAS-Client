"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { unwrap } from "@saas/api-client";
import { Alert, Button, SelectField, TextField } from "@saas/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { fieldError, t } from "@/i18n";
import { api, ensureCsrf } from "@/lib/api";
import { keys, useRefresh } from "@/lib/queries";
import { inviteSchema } from "@/lib/schemas";
import { applyServerErrors } from "@/lib/server-errors";

type Values = z.input<typeof inviteSchema>;

/** Invite a team member by email (spec 2.10). The link is valid for 72 hours. */
export function InviteForm({ onInvited }: { onInvited?: (email: string) => void }) {
  const refresh = useRefresh();
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState<string>();
  const form = useForm<Values>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", full_name: "", role: "office_staff" },
  });
  const errors = form.formState.errors;

  async function onSubmit(values: Values) {
    setError(undefined);
    setSent(undefined);
    try {
      await ensureCsrf();
      await unwrap(api.POST("/api/portal/users", { body: values }));
      await refresh(keys.users);
      setSent(values.email.trim().toLowerCase());
      form.reset({ email: "", full_name: "", role: values.role });
      onInvited?.(values.email);
    } catch (caught) {
      setError(applyServerErrors(caught, form.setError, ["email", "full_name", "role"]));
    }
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} aria-label={t("users.invite")} className="space-y-3">
      {error && <Alert>{error}</Alert>}
      {sent && <Alert tone="success">{t("users.invited", { email: sent })}</Alert>}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_12rem]">
        <TextField label={t("users.email")} type="email" required error={fieldError(errors.email)} {...form.register("email")} />
        <TextField label={t("users.full_name")} required error={fieldError(errors.full_name)} {...form.register("full_name")} />
        <SelectField
          label={t("users.role")}
          required
          options={["office_staff", "manager", "owner"].map((role) => ({ value: role, label: t(`role.${role}`) }))}
          error={fieldError(errors.role)}
          {...form.register("role")}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted">{t("users.invite_hint")}</span>
        <Button type="submit" loading={form.formState.isSubmitting}>
          {t("users.send_invite")}
        </Button>
      </div>
    </form>
  );
}

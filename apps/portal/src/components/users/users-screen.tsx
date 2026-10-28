"use client";

import { unwrap } from "@saas/api-client";
import { Alert, Button, type Column, ConfirmDialog, DataTable, StatusBadge, StatusPill } from "@saas/ui";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { errorMessage, t } from "@/i18n";
import { api, ensureCsrf } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { keys, usePortalConfig, useRefresh, useTeam } from "@/lib/queries";
import type { TeamMember } from "@/lib/types";

import { InviteForm } from "./invite-form";

/** Users (spec 2.10, owner): invite, change role, deactivate, resend invite. */
export function UsersScreen() {
  const config = usePortalConfig();
  const team = useTeam();
  const refresh = useRefresh();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [deactivating, setDeactivating] = useState<TeamMember | null>(null);
  const writable = config.data?.role === "owner" && config.data?.tenant_status !== "suspended";

  async function run(action: () => Promise<unknown>, message?: string) {
    setError(undefined);
    setNotice(undefined);
    try {
      await ensureCsrf();
      await action();
      await refresh(keys.users);
      if (message) setNotice(message);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  const columns: Column<TeamMember>[] = [
    {
      key: "person",
      header: t("users.person"),
      render: (row) => (
        <span>
          <span className="font-medium text-ink">{row.full_name || row.email}</span>
          {row.is_you && <span className="ml-2 text-xs text-muted">{t("users.you")}</span>}
          <span className="block text-xs text-muted">{row.email}</span>
        </span>
      ),
    },
    {
      key: "role",
      header: t("users.role"),
      render: (row) =>
        writable && row.status !== "deactivated" ? (
          <select
            aria-label={t("users.role_for", { email: row.email })}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
            value={row.role}
            onChange={(event) =>
              run(() =>
                unwrap(api.POST("/api/portal/users/{id}/role", { params: { path: { id: row.id } }, body: { role: event.target.value as TeamMember["role"] } })),
              )
            }
          >
            {["owner", "manager", "office_staff"].map((role) => (
              <option key={role} value={role}>
                {t(`role.${role}`)}
              </option>
            ))}
          </select>
        ) : (
          t(`role.${row.role}`)
        ),
    },
    { key: "status", header: t("subscribers.col.status"), render: (row) => <StatusBadge status={row.status} label={t(`status.${row.status}`)} /> },
    {
      key: "2fa",
      header: t("users.two_factor"),
      render: (row) => (row.otp_enabled ? <StatusPill tone="ok">{t("common.on")}</StatusPill> : <span className="text-muted">{t("common.none")}</span>),
    },
    { key: "last", header: t("users.last_login"), render: (row) => formatDateTime(row.last_login) },
    {
      key: "actions",
      header: t("users.actions"),
      render: (row) =>
        writable && (
          <span className="flex gap-2">
            {row.status === "invited" && (
              <Button
                variant="secondary"
                onClick={() =>
                  run(
                    () => unwrap(api.POST("/api/portal/users/{id}/resend-invite", { params: { path: { id: row.id } } })),
                    t("users.resent", { email: row.email }),
                  )
                }
              >
                {t("users.resend")}
              </Button>
            )}
            {row.status !== "deactivated" && !row.is_you && (
              <Button variant="ghost" onClick={() => setDeactivating(row)}>
                {t("users.deactivate")}
              </Button>
            )}
          </span>
        ),
    },
  ];

  return (
    <>
      <PageHeader title={t("nav.users")} description={t("users.description")} />
      <div className="space-y-4">
        {writable && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <InviteForm />
          </div>
        )}
        {error && <Alert>{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}
        {team.isError && <Alert>{errorMessage(team.error)}</Alert>}
        <DataTable
          caption={t("nav.users")}
          columns={columns}
          rows={team.data}
          rowKey={(row) => row.id}
          loading={team.isPending}
          loadingLabel={t("app.loading")}
          empty={t("users.empty")}
        />
      </div>
      <ConfirmDialog
        open={deactivating !== null}
        title={t("users.deactivate_title", { email: deactivating?.email ?? "" })}
        message={t("users.deactivate_body")}
        confirmLabel={t("users.deactivate")}
        cancelLabel={t("common.cancel")}
        danger
        onConfirm={() => {
          const member = deactivating!;
          setDeactivating(null);
          void run(() => unwrap(api.POST("/api/portal/users/{id}/deactivate", { params: { path: { id: member.id } } })));
        }}
        onClose={() => setDeactivating(null)}
      />
    </>
  );
}

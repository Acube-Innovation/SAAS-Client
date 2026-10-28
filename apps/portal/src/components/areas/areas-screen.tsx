"use client";

import { Alert, type Column, DataTable, Dialog, StatusBadge } from "@saas/ui";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { errorMessage, t } from "@/i18n";
import { useAreas, usePortalConfig, useStaff } from "@/lib/queries";
import type { Area, StaffMember } from "@/lib/types";

import { AreaForm, StaffForm } from "./area-forms";

/** Areas and staff (spec 2.7): jobs in an area go to its default staff member. */
export function AreasScreen() {
  const config = usePortalConfig();
  const canEdit = config.data?.role === "owner" || config.data?.role === "manager";
  const writable = canEdit && config.data?.tenant_status !== "suspended";
  const areas = useAreas();
  const staff = useStaff();
  const [editArea, setEditArea] = useState<Area | null>(null);
  const [editStaff, setEditStaff] = useState<StaffMember | null>(null);

  const areaColumns: Column<Area>[] = [
    { key: "name", header: t("areas.name"), render: (row) => <span className="font-medium">{row.name}</span> },
    { key: "code", header: t("areas.code"), render: (row) => row.code || t("common.none") },
    { key: "staff", header: t("areas.default_staff"), render: (row) => row.default_staff_name ?? t("common.none") },
    { key: "subs", header: t("areas.subscribers"), render: (row) => (row.subscriber_count ?? 0).toLocaleString("en-IN") },
    {
      key: "active",
      header: t("subscribers.col.status"),
      render: (row) => <StatusBadge status={row.is_active ? "active" : "inactive"} label={t(row.is_active ? "status.active" : "status.inactive")} />,
    },
  ];
  const staffColumns: Column<StaffMember>[] = [
    { key: "name", header: t("staff.name"), render: (row) => <span className="font-medium">{row.name}</span> },
    { key: "phone", header: t("staff.phone"), render: (row) => row.phone || t("common.none") },
    {
      key: "active",
      header: t("subscribers.col.status"),
      render: (row) => <StatusBadge status={row.is_active ? "active" : "inactive"} label={t(row.is_active ? "status.active" : "status.inactive")} />,
    },
  ];

  return (
    <>
      <PageHeader title={t("nav.areas")} description={t("areas.description")} />
      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <section aria-label={t("areas.title")} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t("areas.title")}</h2>
          {writable && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <AreaForm />
            </div>
          )}
          {areas.isError && <Alert>{errorMessage(areas.error)}</Alert>}
          <DataTable
            caption={t("areas.title")}
            columns={areaColumns}
            rows={areas.data}
            rowKey={(row) => row.id}
            loading={areas.isPending}
            loadingLabel={t("app.loading")}
            empty={t("areas.empty")}
            onRowClick={writable ? setEditArea : undefined}
          />
        </section>
        <section aria-label={t("staff.title")} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t("staff.title")}</h2>
          {writable && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <StaffForm />
            </div>
          )}
          {staff.isError && <Alert>{errorMessage(staff.error)}</Alert>}
          <DataTable
            caption={t("staff.title")}
            columns={staffColumns}
            rows={staff.data?.results}
            rowKey={(row) => row.id}
            loading={staff.isPending}
            loadingLabel={t("app.loading")}
            empty={t("staff.empty")}
            onRowClick={writable ? setEditStaff : undefined}
          />
        </section>
      </div>
      <Dialog open={editArea !== null} title={t("areas.edit")} onClose={() => setEditArea(null)} size="lg">
        {editArea && <AreaForm key={editArea.id} area={editArea} onSaved={() => setEditArea(null)} />}
      </Dialog>
      <Dialog open={editStaff !== null} title={t("staff.edit")} onClose={() => setEditStaff(null)}>
        {editStaff && <StaffForm key={editStaff.id} member={editStaff} onSaved={() => setEditStaff(null)} />}
      </Dialog>
    </>
  );
}

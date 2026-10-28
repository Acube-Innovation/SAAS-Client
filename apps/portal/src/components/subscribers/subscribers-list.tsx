"use client";

import { Alert, Button, type Column, DataTable, SelectField, StatusBadge, StatusPill, TextField } from "@saas/ui";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { errorMessage, t } from "@/i18n";
import { useAreas, usePortalConfig, useSubscribers } from "@/lib/queries";
import type { Subscriber } from "@/lib/types";

const FILTERS = ["search", "area", "status", "consent", "opted_out", "page"] as const;

/** Subscribers (spec 2.2): search, filters, 50 per page, consent and opt-out badges. */
export function SubscribersList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const config = usePortalConfig();
  const areas = useAreas();
  const filters = Object.fromEntries(FILTERS.map((key) => [key, params.get(key) ?? ""])) as Record<
    (typeof FILTERS)[number],
    string
  >;
  const [search, setSearch] = useState(filters.search);
  const query = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
  const list = useSubscribers(query);
  const readOnly = config.data?.role === "support" || config.data?.tenant_status === "suspended";
  const refLabel =
    (config.data?.subscriber_fields as { key: string; label: string }[] | undefined)?.find((f) => f.key === "external_ref")
      ?.label ?? t("subscribers.external_ref");

  function update(changes: Partial<typeof filters>) {
    const next = new URLSearchParams({ ...filters, page: "", ...changes });
    for (const [key, value] of [...next.entries()]) if (!value || (key === "page" && value === "1")) next.delete(key);
    router.replace(next.size ? `${pathname}?${next}` : pathname);
  }

  const columns: Column<Subscriber>[] = [
    {
      key: "name",
      header: t("subscribers.col.name"),
      render: (row) => (
        <Link href={`/subscribers/${row.id}`} className="block">
          <span className="font-medium text-ink hover:text-brand-700">{row.customer_name}</span>
          <span className="block font-mono text-xs text-muted">{row.external_ref}</span>
        </Link>
      ),
    },
    { key: "mobile", header: t("subscribers.col.mobile"), render: (row) => row.mobile_number },
    { key: "area", header: t("subscribers.col.area"), render: (row) => row.area_name ?? t("common.none") },
    {
      key: "consent",
      header: t("subscribers.col.consent"),
      render: (row) => (
        <span className="flex flex-wrap gap-1">
          {row.opted_out ? (
            <StatusPill tone="error">{t("subscribers.opted_out")}</StatusPill>
          ) : row.whatsapp_consent ? (
            <StatusPill tone="ok">{t("subscribers.consent_yes")}</StatusPill>
          ) : (
            <StatusPill tone="warn">{t("subscribers.consent_no")}</StatusPill>
          )}
        </span>
      ),
    },
    {
      key: "status",
      header: t("subscribers.col.status"),
      render: (row) => <StatusBadge status={row.status} label={t(`status.${row.status}`)} />,
    },
  ];

  const anyFilter = Boolean(filters.search || filters.area || filters.status || filters.consent || filters.opted_out);
  return (
    <>
      <PageHeader
        title={t("nav.subscribers")}
        description={t("subscribers.description")}
        actions={
          !readOnly && (
            <>
              <Link href="/subscribers/import">
                <Button variant="secondary">{t("subscribers.import")}</Button>
              </Link>
              <Link href="/subscribers/new">
                <Button>{t("subscribers.add")}</Button>
              </Link>
            </>
          )
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_11rem_9rem_9rem_9rem]">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            update({ search: search.trim() });
          }}
        >
          <TextField
            label={t("subscribers.search")}
            type="search"
            placeholder={t("subscribers.search_placeholder", { ref: refLabel.toLowerCase() })}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onBlur={() => search.trim() !== filters.search && update({ search: search.trim() })}
          />
        </form>
        <SelectField
          label={t("subscribers.col.area")}
          value={filters.area}
          placeholder={t("common.all")}
          options={[
            { value: "none", label: t("subscribers.no_area") },
            ...(areas.data ?? []).map((a) => ({ value: a.id, label: a.name })),
          ]}
          onChange={(event) => update({ area: event.target.value })}
        />
        <SelectField
          label={t("subscribers.col.status")}
          value={filters.status}
          placeholder={t("common.all")}
          options={[
            { value: "active", label: t("status.active") },
            { value: "inactive", label: t("status.inactive") },
          ]}
          onChange={(event) => update({ status: event.target.value })}
        />
        <SelectField
          label={t("subscribers.col.consent")}
          value={filters.consent}
          placeholder={t("common.all")}
          options={[
            { value: "true", label: t("subscribers.consent_yes") },
            { value: "false", label: t("subscribers.consent_no") },
          ]}
          onChange={(event) => update({ consent: event.target.value })}
        />
        <SelectField
          label={t("subscribers.opted_out")}
          value={filters.opted_out}
          placeholder={t("common.all")}
          options={[
            { value: "true", label: t("common.yes") },
            { value: "false", label: t("common.no") },
          ]}
          onChange={(event) => update({ opted_out: event.target.value })}
        />
      </div>
      {list.isError && <Alert>{errorMessage(list.error)}</Alert>}
      <DataTable
        caption={t("nav.subscribers")}
        columns={columns}
        rows={list.data?.results}
        rowKey={(row) => row.id}
        loading={list.isPending}
        loadingLabel={t("app.loading")}
        empty={anyFilter ? t("subscribers.empty") : t("subscribers.empty_all")}
        onRowClick={(row) => router.push(`/subscribers/${row.id}`)}
      />
      {list.data && list.data.count > 0 && (
        <Pagination
          page={Number(filters.page || "1")}
          count={list.data.count}
          pageSize={50}
          onChange={(page) => update({ page: String(page) })}
        />
      )}
    </>
  );
}

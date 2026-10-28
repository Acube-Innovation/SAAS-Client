"use client";

import { unwrap } from "@saas/api-client";
import { Alert, Button, type Column, DataTable, SelectField, StatusPill, TextField } from "@saas/ui";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { errorMessage, t } from "@/i18n";
import { api, ensureCsrf } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { keys, useAreas, useBookings, usePortalConfig, useRefresh } from "@/lib/queries";
import { OUTCOMES, todayIso } from "@/lib/schemas";
import type { Booking } from "@/lib/types";

import { bookingTone, OUTCOME_TONES } from "./labels";
import { TimelineDrawer } from "./timeline";

const FILTERS = ["date", "no_date", "outcome", "status", "area", "search", "page"] as const;
const STATUSES = ["booked", "reminded", "awaiting_reply", "closed", "cancelled"] as const;

/** Bookings (spec 2.3): by delivery date, "No date yet", filters, bulk set date, timeline drawer. */
export function BookingsList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const config = usePortalConfig();
  const areas = useAreas();
  const refresh = useRefresh();
  const filters = Object.fromEntries(FILTERS.map((key) => [key, params.get(key) ?? ""])) as Record<(typeof FILTERS)[number], string>;
  const [search, setSearch] = useState(filters.search);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDate, setBulkDate] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [timelineFor, setTimelineFor] = useState<Booking | null>(null);
  const query = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
  const list = useBookings(query);
  const writable = config.data?.role !== "support" && config.data?.tenant_status !== "suspended";
  const schedule = (config.data?.schedule_types as { name?: string; fields?: { key: string; label: string }[] }[] | undefined)?.[0];
  const label = (key: string, fallback: string) => schedule?.fields?.find((f) => f.key === key)?.label ?? fallback;

  function update(changes: Partial<typeof filters>) {
    const next = new URLSearchParams({ ...filters, page: "", ...changes });
    for (const [key, value] of [...next.entries()]) if (!value || (key === "page" && value === "1")) next.delete(key);
    setSelected(new Set());
    router.replace(next.size ? `${pathname}?${next}` : pathname);
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyBulkDate() {
    setBulkBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await ensureCsrf();
      const result = await unwrap(
        api.POST("/api/portal/bookings/bulk-set-date", { body: { ids: [...selected], scheduled_date: bulkDate } }),
      );
      setNotice(
        t("bookings.bulk_done", {
          count: result.updated.length,
          date: formatDate(bulkDate),
          skipped: result.skipped_cancelled.length,
        }),
      );
      setSelected(new Set());
      await refresh(keys.bookings, keys.deliveries);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBulkBusy(false);
    }
  }

  const rows = list.data?.results ?? [];
  const selectable = rows.filter((row) => row.status !== "cancelled");
  const columns: Column<Booking>[] = [
    ...(writable
      ? [
          {
            key: "select",
            header: t("bookings.select"),
            className: "w-10",
            render: (row: Booking) =>
              row.status !== "cancelled" && (
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  aria-label={t("bookings.select_row", { ref: row.booking_reference })}
                  checked={selected.has(row.id)}
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => toggle(row.id)}
                />
              ),
          },
        ]
      : []),
    {
      key: "ref",
      header: label("booking_reference", t("bookings.reference")),
      render: (row) => (
        <Link href={`/bookings/${row.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-xs font-medium text-ink hover:text-brand-700">
          {row.booking_reference}
        </Link>
      ),
    },
    {
      key: "customer",
      header: t("bookings.customer"),
      render: (row) => (
        <span>
          <span className="font-medium text-ink">{row.subscriber_name}</span>
          <span className="block text-xs text-muted">
            {row.subscriber_mobile}
            {row.area_name ? ` · ${row.area_name}` : ""}
          </span>
        </span>
      ),
    },
    {
      key: "date",
      header: label("scheduled_date", t("bookings.scheduled_date")),
      render: (row) => (row.scheduled_date ? formatDate(row.scheduled_date) : <StatusPill tone="warn">{t("bookings.no_date")}</StatusPill>),
    },
    {
      key: "cylinder",
      header: t("bookings.item"),
      render: (row) => {
        const custom = row.custom_fields as { cylinder_type?: string; quantity?: number };
        return `${custom.cylinder_type ?? ""}${custom.quantity && custom.quantity > 1 ? ` × ${custom.quantity}` : ""}`;
      },
    },
    { key: "status", header: t("bookings.status"), render: (row) => <StatusPill tone={bookingTone(row.status)}>{t(`booking_status.${row.status}`)}</StatusPill> },
    {
      key: "outcome",
      header: t("bookings.outcome"),
      render: (row) =>
        row.outcome ? (
          <StatusPill tone={OUTCOME_TONES[row.outcome] ?? "neutral"}>{t(`outcome.${row.outcome}`)}</StatusPill>
        ) : (
          <span className="text-muted">{t("common.none")}</span>
        ),
    },
    {
      key: "timeline",
      header: t("timeline.title"),
      render: (row) => (
        <Button variant="ghost" onClick={(event) => { event.stopPropagation(); setTimelineFor(row); }}>
          {t("bookings.open_timeline")}
        </Button>
      ),
    },
  ];

  const anyFilter = Boolean(filters.date || filters.no_date || filters.outcome || filters.status || filters.area || filters.search);
  return (
    <>
      <PageHeader
        title={t("nav.bookings")}
        description={schedule?.name ? t("bookings.description", { schedule: schedule.name.toLowerCase() }) : undefined}
        actions={
          writable && (
            <>
              <Link href="/bookings/import">
                <Button variant="secondary">{t("subscribers.import")}</Button>
              </Link>
              <Link href="/bookings/new">
                <Button>{t("bookings.add")}</Button>
              </Link>
            </>
          )
        }
      />
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_10rem_10rem_10rem_10rem]">
        <form role="search" onSubmit={(e) => { e.preventDefault(); update({ search: search.trim() }); }}>
          <TextField
            label={t("subscribers.search")}
            type="search"
            placeholder={t("bookings.search_placeholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => search.trim() !== filters.search && update({ search: search.trim() })}
          />
        </form>
        <TextField label={label("scheduled_date", t("bookings.scheduled_date"))} type="date" value={filters.date} disabled={Boolean(filters.no_date)} onChange={(e) => update({ date: e.target.value })} />
        <SelectField
          label={t("bookings.outcome")}
          value={filters.outcome}
          placeholder={t("common.all")}
          options={[{ value: "none", label: t("bookings.no_answer") }, ...OUTCOMES.map((o) => ({ value: o, label: t(`outcome.${o}`) }))]}
          onChange={(e) => update({ outcome: e.target.value })}
        />
        <SelectField
          label={t("bookings.status")}
          value={filters.status}
          placeholder={t("common.all")}
          options={STATUSES.map((s) => ({ value: s, label: t(`booking_status.${s}`) }))}
          onChange={(e) => update({ status: e.target.value })}
        />
        <SelectField
          label={t("subscribers.col.area")}
          value={filters.area}
          placeholder={t("common.all")}
          options={[{ value: "none", label: t("subscribers.no_area") }, ...(areas.data ?? []).map((a) => ({ value: a.id, label: a.name }))]}
          onChange={(e) => update({ area: e.target.value })}
        />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant={filters.no_date ? "primary" : "secondary"} aria-pressed={Boolean(filters.no_date)} onClick={() => update({ no_date: filters.no_date ? "" : "true", date: "" })}>
          {t("bookings.no_date_filter")}
        </Button>
        <Button variant="ghost" onClick={() => update({ date: todayIso(), no_date: "" })}>{t("bookings.today")}</Button>
        {anyFilter && <Button variant="ghost" onClick={() => { setSearch(""); router.replace(pathname); }}>{t("bookings.clear")}</Button>}
      </div>

      {writable && selected.size > 0 && (
        <div role="region" aria-label={t("bookings.bulk_title")} className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <p className="text-sm font-medium text-brand-900">{t("bookings.selected", { count: selected.size })}</p>
          <TextField label={t("bookings.bulk_date")} type="date" min={todayIso()} value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
          <Button onClick={applyBulkDate} disabled={!bulkDate} loading={bulkBusy}>{t("bookings.bulk_apply")}</Button>
          <Button variant="ghost" onClick={() => setSelected(new Set())}>{t("common.cancel")}</Button>
          <p className="w-full text-xs text-brand-900">{t("bookings.bulk_hint")}</p>
        </div>
      )}
      {writable && selectable.length > 0 && selected.size === 0 && (
        <p className="mb-2 text-xs text-muted">{t("bookings.select_hint")}</p>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}
      {list.isError && <Alert>{errorMessage(list.error)}</Alert>}
      <div className="mt-2">
        <DataTable
          caption={t("nav.bookings")}
          columns={columns}
          rows={list.data?.results}
          rowKey={(row) => row.id}
          loading={list.isPending}
          loadingLabel={t("app.loading")}
          empty={anyFilter ? t("bookings.empty") : t("bookings.empty_all")}
          onRowClick={(row) => setTimelineFor(row)}
        />
      </div>
      {list.data && list.data.count > 0 && (
        <Pagination page={Number(filters.page || "1")} count={list.data.count} pageSize={50} onChange={(page) => update({ page: String(page) })} />
      )}
      <TimelineDrawer
        bookingId={timelineFor?.id ?? null}
        title={timelineFor ? t("timeline.drawer_title", { ref: timelineFor.booking_reference, name: timelineFor.subscriber_name }) : ""}
        onClose={() => setTimelineFor(null)}
      />
    </>
  );
}

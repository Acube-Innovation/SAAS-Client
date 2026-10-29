"use client";

import { unwrap } from "@saas/api-client";
import { Alert, Button, cn, ConfirmDialog, Dialog, SelectField, Spinner, StatusPill, TextAreaField, TextField } from "@saas/ui";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { errorMessage, t } from "@/i18n";
import { api, ensureCsrf } from "@/lib/api";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import { keys, useAutoTopUp, useInvoices, usePlan, usePortalConfig, useRefresh, useWallet, useWalletTransactions } from "@/lib/queries";
import type { Checkout, Mandate, PlanInfo } from "@/lib/types";

import { openProviderCheckout, waitFor } from "./checkout";

const TABS = ["overview", "transactions", "invoices", "plan"] as const;
type Tab = (typeof TABS)[number];
const PRESETS = [1000, 2000, 5000, 10000];
const GST_RATE = 0.18;

/** The signed-in user may pay and change auto top-up (spec 1.1: owner; managers view). */
function useCanPay() {
  const config = usePortalConfig();
  return config.data?.role === "owner" && config.data?.tenant_status !== "suspended";
}

/** Wallet and billing / Plan (spec 2.9). */
export function WalletScreen() {
  const params = useSearchParams();
  const pathname = usePathname();
  const requested = params.get("tab") as Tab | null;
  const tab: Tab = requested && TABS.includes(requested) ? requested : "overview";
  return (
    <>
      <PageHeader title={t("nav.wallet")} description={t("wallet.description")} />
      <nav aria-label={t("wallet.sections")} className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((key) => (
          <Link
            key={key}
            href={key === "overview" ? pathname : `${pathname}?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", tab === key ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-ink")}
          >
            {t(`wallet.tab.${key}`)}
          </Link>
        ))}
      </nav>
      {tab === "overview" && <Overview />}
      {tab === "transactions" && <Transactions />}
      {tab === "invoices" && <Invoices />}
      {tab === "plan" && <PlanTab />}
    </>
  );
}

// --- overview ---------------------------------------------------------------------------------

function Overview() {
  const wallet = useWallet();
  if (wallet.isPending) return <Spinner label={t("app.loading")} />;
  if (wallet.isError) return <Alert>{errorMessage(wallet.error)}</Alert>;
  const data = wallet.data;
  const status = !data.can_send ? "paused" : data.is_low ? "low" : "ok";
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-label={t("wallet.balance")} className="rounded-xl border border-slate-200 bg-white p-5" data-status={status}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-muted">{t("wallet.balance")}</h2>
          <StatusPill tone={status === "paused" ? "error" : status === "low" ? "warn" : "ok"}>{t(`wallet.status.${status}`)}</StatusPill>
        </div>
        <p className="mt-2 text-4xl font-semibold tabular-nums text-ink" data-testid="wallet-balance">{formatRupees(data.balance_paise)}</p>
        <p className="mt-2 text-sm text-muted">{t("wallet.low_level", { amount: formatRupees(data.low_balance_level_paise) })}</p>
        {data.held_reminders > 0 && <Alert tone="warn">{t("wallet.held", { count: data.held_reminders })}</Alert>}
        <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
          {data.prices.map((price) => (
            <div key={price.channel} className="rounded-lg bg-slate-50 p-2">
              <dt className="text-xs text-muted">{t(`wallet.price.${price.channel}`)}</dt>
              <dd className="font-medium tabular-nums text-ink">{formatRupees(price.price_paise)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <TopUp />
      <div className="lg:col-span-2">
        <AutoTopUpCard />
      </div>
    </div>
  );
}

/** The sandbox stand-in for the provider window (local development, no real money). */
function SandboxDialog({
  open,
  title,
  amount,
  payLabel,
  busy,
  onPay,
  onDecline,
  onClose,
}: {
  open: boolean;
  title: string;
  amount?: number;
  payLabel: string;
  busy: boolean;
  onPay: (twice: boolean) => void;
  onDecline: () => void;
  onClose: () => void;
}) {
  const [twice, setTwice] = useState(false);
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onDecline} disabled={busy}>{t("wallet.sandbox_decline")}</Button>
          <Button onClick={() => onPay(twice)} loading={busy}>{payLabel}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Alert tone="info">{t("wallet.sandbox_note")}</Alert>
        {amount !== undefined && <p className="text-2xl font-semibold tabular-nums text-ink">{formatRupees(amount)}</p>}
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="h-4 w-4" checked={twice} onChange={(e) => setTwice(e.target.checked)} />
          {t("wallet.sandbox_twice")}
        </label>
      </div>
    </Dialog>
  );
}

function TopUp() {
  const canPay = useCanPay();
  const refresh = useRefresh();
  const [rupees, setRupees] = useState("2000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [sandbox, setSandbox] = useState<{ orderId: string; total: number } | null>(null);
  const amount = Number(rupees);
  const valid = Number.isInteger(amount) && amount >= 1000 && amount <= 500000;
  const gst = valid ? Math.round(amount * 100 * GST_RATE) : 0;

  async function waitForPayment(orderId: string) {
    setNotice(t("wallet.waiting_payment"));
    let final = "";
    const done = await waitFor(async () => {
      const order = await unwrap(api.GET("/api/portal/top-ups/{id}", { params: { path: { id: orderId } } }));
      final = order.status;
      return order.status !== "created";
    });
    await refresh(keys.billing);
    setNotice(undefined);
    if (!done) setError(t("wallet.payment_pending"));
    else if (final === "paid") setNotice(t("wallet.paid", { amount: formatRupees(amount * 100) }));
    else setError(t(`wallet.order_status.${final}`));
  }

  async function start() {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await ensureCsrf();
      const started = await unwrap(api.POST("/api/portal/top-ups", { body: { credit_paise: amount * 100 } }));
      if (started.checkout.provider === "stub") {
        setSandbox({ orderId: started.order.id, total: started.order.total_paise });
      } else {
        await openProviderCheckout(started.checkout as Checkout, t("wallet.top_up"));
        await waitForPayment(started.order.id);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function simulate(outcome: "success" | "failure", twice = false) {
    if (!sandbox) return;
    setBusy(true);
    try {
      await ensureCsrf();
      await unwrap(api.POST("/api/portal/dev/payments/simulate", { body: { target: "order", id: sandbox.orderId, outcome, times: twice ? 2 : 1 } }));
      const orderId = sandbox.orderId;
      setSandbox(null);
      await waitForPayment(orderId);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={t("wallet.top_up")} className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-ink">{t("wallet.top_up")}</h2>
      {!canPay ? (
        <p className="mt-2 text-sm text-muted">{t("wallet.owner_only")}</p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("wallet.presets")}>
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={amount === preset}
                onClick={() => setRupees(String(preset))}
                className={cn("rounded-lg border px-3 py-1.5 text-sm font-medium", amount === preset ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-ink hover:border-slate-300")}
              >
                {formatRupees(preset * 100).replace(".00", "")}
              </button>
            ))}
          </div>
          <TextField
            label={t("wallet.amount")}
            type="number"
            inputMode="numeric"
            min={1000}
            step={1}
            value={rupees}
            hint={t("wallet.amount_hint")}
            error={rupees && !valid ? t("wallet.amount_error") : undefined}
            onChange={(e) => setRupees(e.target.value)}
          />
          {valid && (
            <dl className="space-y-1 text-sm" aria-label={t("wallet.summary")}>
              <div className="flex justify-between"><dt className="text-muted">{t("wallet.credit")}</dt><dd className="tabular-nums">{formatRupees(amount * 100)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">{t("wallet.gst")}</dt><dd className="tabular-nums">{formatRupees(gst)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>{t("wallet.you_pay")}</dt><dd className="tabular-nums">{formatRupees(amount * 100 + gst)}</dd></div>
            </dl>
          )}
          {error && <Alert>{error}</Alert>}
          {notice && <Alert tone={notice === t("wallet.waiting_payment") ? "info" : "success"}>{notice}</Alert>}
          <Button onClick={start} disabled={!valid} loading={busy && !sandbox}>{t("wallet.pay")}</Button>
          <p className="text-xs text-muted">{t("wallet.credited_after")}</p>
        </div>
      )}
      <SandboxDialog
        open={Boolean(sandbox)}
        title={t("wallet.sandbox_title")}
        amount={sandbox?.total}
        payLabel={t("wallet.sandbox_pay", { amount: formatRupees(sandbox?.total ?? 0) })}
        busy={busy}
        onPay={(twice) => simulate("success", twice)}
        onDecline={() => simulate("failure")}
        onClose={() => setSandbox(null)}
      />
    </section>
  );
}

// --- auto top-up ------------------------------------------------------------------------------

function AutoTopUpCard() {
  const canPay = useCanPay();
  const state = useAutoTopUp();
  const refresh = useRefresh();
  const [rupees, setRupees] = useState("2000");
  const [method, setMethod] = useState("upi");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [sandbox, setSandbox] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editing, setEditing] = useState(false);

  if (state.isPending) return <Spinner label={t("app.loading")} />;
  if (state.isError) return <Alert>{errorMessage(state.error)}</Alert>;
  const { mandate, low_balance_level_paise: level } = state.data;
  const amount = Number(rupees);
  const valid = Number.isInteger(amount) && amount >= 1000 && amount <= 15000;

  async function run(kind: string, call: () => Promise<unknown>, message?: string) {
    setBusy(kind);
    setError(undefined);
    setNotice(undefined);
    try {
      await ensureCsrf();
      await call();
      await refresh(keys.billing);
      if (message) setNotice(message);
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function waitForMandate() {
    const done = await waitFor(async () => {
      const current = await unwrap(api.GET("/api/portal/auto-top-up"));
      return current.mandate?.status !== "pending";
    });
    await refresh(keys.billing);
    if (!done) setError(t("wallet.mandate_pending"));
  }

  async function setUp() {
    await run("setup", async () => {
      const started = await unwrap(api.POST("/api/portal/auto-top-up", { body: { credit_paise: amount * 100, method: method as "upi" | "card" } }));
      if (started.checkout.provider === "stub") setSandbox(started.mandate.id);
      else {
        await openProviderCheckout(started.checkout as Checkout, t("wallet.auto_title"));
        await waitForMandate();
      }
    });
  }

  async function simulate(target: "mandate" | "charge", id: string, outcome: "success" | "failure", twice = false) {
    await run(target, async () => {
      await unwrap(api.POST("/api/portal/dev/payments/simulate", { body: { target, id, outcome, times: twice ? 2 : 1 } }));
      setSandbox(null);
    }, target === "mandate" ? (outcome === "success" ? t("wallet.mandate_active") : undefined) : undefined);
  }

  const act = (action: "pause" | "resume" | "cancel" | "amount", message: string) =>
    run(action, () => unwrap(api.POST("/api/portal/auto-top-up/{action}", { params: { path: { action } }, body: (action === "amount" ? { credit_paise: amount * 100 } : {}) as never })), message);

  return (
    <section aria-label={t("wallet.auto_title")} className="rounded-xl border border-slate-200 bg-white p-5" data-mandate={mandate?.status ?? "none"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">{t("wallet.auto_title")}</h2>
        {mandate && <StatusPill tone={mandate.status === "active" ? "ok" : mandate.status === "paused" ? "warn" : "info"}>{t(`wallet.mandate_status.${mandate.status}`)}</StatusPill>}
      </div>
      <p className="mt-1 text-sm text-muted">{t("wallet.auto_hint", { level: formatRupees(level) })}</p>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      {notice && <div className="mt-3"><Alert tone="success">{notice}</Alert></div>}

      {!mandate ? (
        canPay ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-[12rem_12rem_auto] sm:items-end">
            <TextField label={t("wallet.auto_amount")} type="number" min={1000} max={15000} value={rupees} error={rupees && !valid ? t("wallet.auto_amount_error") : undefined} onChange={(e) => setRupees(e.target.value)} />
            <SelectField label={t("wallet.method")} value={method} options={[{ value: "upi", label: t("wallet.method.upi") }, { value: "card", label: t("wallet.method.card") }]} onChange={(e) => setMethod(e.target.value)} />
            <Button onClick={setUp} disabled={!valid} loading={busy === "setup"}>{t("wallet.auto_set_up")}</Button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">{t("wallet.auto_none")}</p>
        )
      ) : (
        <MandateDetails mandate={mandate} />
      )}

      {mandate && canPay && (
        <div className="mt-4 flex flex-wrap gap-2">
          {mandate.status === "pending" && mandate.provider === "stub" && (
            <Button onClick={() => setSandbox(mandate.id)}>{t("wallet.sandbox_authorise")}</Button>
          )}
          {(mandate.status === "active" || mandate.status === "paused") && (
            editing ? (
              <span className="flex items-end gap-2">
                <TextField label={t("wallet.auto_amount")} type="number" min={1000} max={15000} value={rupees} onChange={(e) => setRupees(e.target.value)} />
                <Button disabled={!valid} loading={busy === "amount"} onClick={async () => { if (await act("amount", t("wallet.amount_changed"))) setEditing(false); }}>{t("common.save")}</Button>
                <Button variant="ghost" onClick={() => setEditing(false)}>{t("common.cancel")}</Button>
              </span>
            ) : (
              <Button variant="secondary" onClick={() => { setRupees(String(mandate.credit_paise / 100)); setEditing(true); }}>{t("wallet.change_amount")}</Button>
            )
          )}
          {mandate.status === "active" && <Button variant="secondary" loading={busy === "pause"} onClick={() => act("pause", t("wallet.paused"))}>{t("wallet.pause")}</Button>}
          {mandate.status === "paused" && <Button variant="secondary" loading={busy === "resume"} onClick={() => act("resume", t("wallet.resumed"))}>{t("wallet.resume")}</Button>}
          <Button variant="ghost" onClick={() => setConfirmCancel(true)}>{t("wallet.cancel_mandate")}</Button>
          {mandate.charge_in_progress && mandate.provider === "stub" && (
            <Button variant="secondary" loading={busy === "charge"} onClick={() => simulate("charge", mandate.id, "success")}>{t("wallet.sandbox_complete_debit")}</Button>
          )}
        </div>
      )}

      <SandboxDialog
        open={Boolean(sandbox)}
        title={t("wallet.sandbox_mandate_title")}
        payLabel={t("wallet.sandbox_approve")}
        busy={busy === "mandate"}
        onPay={() => sandbox && simulate("mandate", sandbox, "success")}
        onDecline={() => sandbox && simulate("mandate", sandbox, "failure")}
        onClose={() => setSandbox(null)}
      />
      <ConfirmDialog
        open={confirmCancel}
        title={t("wallet.cancel_title")}
        message={t("wallet.cancel_message")}
        confirmLabel={t("wallet.cancel_mandate")}
        cancelLabel={t("common.cancel")}
        danger
        busy={busy === "cancel"}
        onConfirm={async () => { if (await act("cancel", t("wallet.cancelled"))) setConfirmCancel(false); }}
        onClose={() => setConfirmCancel(false)}
      />
    </section>
  );
}

function MandateDetails({ mandate }: { mandate: Mandate }) {
  return (
    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
      <div>
        <dt className="text-muted">{t("wallet.auto_amount")}</dt>
        <dd className="font-medium tabular-nums text-ink">{formatRupees(mandate.credit_paise)}</dd>
        <dd className="text-xs text-muted">{t("wallet.plus_gst", { amount: formatRupees(mandate.gst_paise) })}</dd>
      </div>
      <div>
        <dt className="text-muted">{t("wallet.method")}</dt>
        <dd className="font-medium text-ink">{t(`wallet.method.${mandate.method}`)} · {t(`wallet.provider.${mandate.provider}`)}</dd>
      </div>
      <div>
        <dt className="text-muted">{t("wallet.last_top_up")}</dt>
        <dd className="font-medium text-ink">{mandate.last_charged_at ? formatDateTime(mandate.last_charged_at) : t("common.none")}</dd>
        {mandate.charge_in_progress && <dd className="text-xs text-sky-700">{t("wallet.debit_in_progress")}</dd>}
      </div>
      {mandate.last_failure && (
        <div>
          <dt className="text-muted">{t("wallet.last_failure")}</dt>
          <dd className="text-red-700">{mandate.last_failure}</dd>
        </div>
      )}
    </dl>
  );
}

// --- ledger and invoices ----------------------------------------------------------------------

function Transactions() {
  const [page, setPage] = useState(1);
  const txns = useWalletTransactions(page);
  if (txns.isPending) return <Spinner label={t("app.loading")} />;
  if (txns.isError) return <Alert>{errorMessage(txns.error)}</Alert>;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <caption className="sr-only">{t("wallet.tab.transactions")}</caption>
          <thead className="bg-slate-50 text-left text-xs uppercase text-muted">
            <tr>
              <th scope="col" className="px-4 py-2">{t("wallet.col.when")}</th>
              <th scope="col" className="px-4 py-2">{t("wallet.col.description")}</th>
              <th scope="col" className="px-4 py-2 text-right">{t("wallet.col.amount")}</th>
              <th scope="col" className="px-4 py-2 text-right">{t("wallet.col.balance")}</th>
              <th scope="col" className="px-4 py-2">{t("wallet.col.invoice")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {txns.data.results.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">{t("wallet.no_transactions")}</td></tr>}
            {txns.data.results.map((row) => (
              <tr key={row.id} data-kind={row.kind}>
                <td className="px-4 py-2 text-muted">{formatDateTime(row.created_at)}</td>
                <td className="px-4 py-2 text-ink">
                  {t(`wallet.reason.${row.reason}`)}
                  {row.description && <span className="block text-xs text-muted">{row.description}</span>}
                </td>
                <td className={cn("px-4 py-2 text-right tabular-nums", row.kind === "credit" ? "text-emerald-700" : "text-ink")}>
                  {row.kind === "credit" ? "+" : "−"}{formatRupees(row.amount_paise)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-muted">{formatRupees(row.balance_after_paise)}</td>
                <td className="px-4 py-2 font-mono text-xs">{row.invoice_number ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {txns.data.count > 0 && <Pagination page={page} count={txns.data.count} pageSize={50} onChange={setPage} />}
    </div>
  );
}

function Invoices() {
  const [page, setPage] = useState(1);
  const invoices = useInvoices(page);
  const [error, setError] = useState<string>();
  if (invoices.isPending) return <Spinner label={t("app.loading")} />;
  if (invoices.isError) return <Alert>{errorMessage(invoices.error)}</Alert>;

  async function download(id: string) {
    setError(undefined);
    try {
      const link = await unwrap(api.GET("/api/portal/invoices/{id}/pdf", { params: { path: { id } } }));
      window.open(link.url, "_blank", "noopener");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <caption className="sr-only">{t("wallet.tab.invoices")}</caption>
          <thead className="bg-slate-50 text-left text-xs uppercase text-muted">
            <tr>
              <th scope="col" className="px-4 py-2">{t("wallet.col.number")}</th>
              <th scope="col" className="px-4 py-2">{t("wallet.col.date")}</th>
              <th scope="col" className="px-4 py-2">{t("wallet.col.kind")}</th>
              <th scope="col" className="px-4 py-2 text-right">{t("wallet.col.taxable")}</th>
              <th scope="col" className="px-4 py-2 text-right">{t("wallet.gst")}</th>
              <th scope="col" className="px-4 py-2 text-right">{t("wallet.col.total")}</th>
              <th scope="col" className="px-4 py-2"><span className="sr-only">{t("wallet.download")}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoices.data.results.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-muted">{t("wallet.no_invoices")}</td></tr>}
            {invoices.data.results.map((invoice) => (
              <tr key={invoice.id} data-invoice={invoice.number}>
                <td className="px-4 py-2 font-mono text-xs text-ink">{invoice.number}</td>
                <td className="px-4 py-2 text-muted">{formatDate(invoice.issued_at)}</td>
                <td className="px-4 py-2 text-ink">{t(`wallet.invoice_kind.${invoice.kind}`)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatRupees(invoice.taxable_paise)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatRupees(invoice.cgst_paise + invoice.sgst_paise + invoice.igst_paise)}</td>
                <td className="px-4 py-2 text-right font-medium tabular-nums">{formatRupees(invoice.total_paise)}</td>
                <td className="px-4 py-2 text-right">
                  <Button variant="secondary" onClick={() => download(invoice.id)}>{t("wallet.download")}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {invoices.data.count > 0 && <Pagination page={page} count={invoices.data.count} pageSize={50} onChange={setPage} />}
    </div>
  );
}

// --- plan -------------------------------------------------------------------------------------

function features(plan: PlanInfo) {
  return (["voice_ai", "public_api", "staff_app"] as const).filter((f) => plan.features[f]);
}

function PlanTab() {
  const plan = usePlan();
  const canPay = useCanPay();
  const refresh = useRefresh();
  const [choice, setChoice] = useState<PlanInfo | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [requested, setRequested] = useState<{ id: string; plan: string } | null>(null);
  if (plan.isPending) return <Spinner label={t("app.loading")} />;
  if (plan.isError) return <Alert>{errorMessage(plan.error)}</Alert>;
  const data = plan.data;
  const current = data.plan;

  async function request() {
    if (!choice) return;
    setBusy(true);
    setError(undefined);
    try {
      await ensureCsrf();
      const created = await unwrap(api.POST("/api/portal/plan/request-change", { body: { plan_code: choice.code, note: note.trim() } }));
      await refresh(keys.changeRequests);
      setRequested({ id: created.id, plan: choice.name });
      setChoice(null);
      setNote("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {requested && (
        <Alert tone="success">
          {t("wallet.plan_requested", { plan: requested.plan })}{" "}
          <Link href={`/messages/requests/${requested.id}`} className="font-medium underline">{t("wallet.plan_follow")}</Link>
        </Alert>
      )}
      {current && (
        <section aria-label={t("wallet.current_plan")} className="rounded-xl border border-brand-200 bg-white p-5" data-plan={current.code}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("wallet.current_plan")}</p>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">{current.name}</h2>
            <p className="text-lg font-semibold tabular-nums text-ink">{t("wallet.per_month", { amount: formatRupees(current.monthly_fee_paise) })}</p>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-sm"><span className="text-muted">{t("wallet.subscribers_used")}</span><span className="tabular-nums text-ink">{data.active_subscribers.toLocaleString("en-IN")} / {current.max_active_subscribers.toLocaleString("en-IN")}</span></div>
            <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.min(100, (data.active_subscribers * 100) / current.max_active_subscribers)}%` }} /></div>
          </div>
          <p className="mt-3 text-sm text-muted">
            {t("wallet.next_billing", { date: formatDate(data.next_billing_date) })}
            {data.pending_plan && ` · ${t("wallet.pending_plan", { plan: data.pending_plan.name })}`}
          </p>
          {current.is_placeholder && <p className="mt-2 text-xs text-amber-800">{t("wallet.placeholder_plans")}</p>}
        </section>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {data.plans.map((option) => (
          <section key={option.code} aria-label={option.name} className={cn("rounded-xl border bg-white p-5", option.code === current?.code ? "border-brand-300" : "border-slate-200")}>
            <h3 className="font-semibold text-ink">{option.name}</h3>
            <p className="mt-1 text-sm tabular-nums text-ink">{t("wallet.per_month", { amount: formatRupees(option.monthly_fee_paise) })}</p>
            <p className="text-sm text-muted">{t("wallet.up_to", { count: option.max_active_subscribers.toLocaleString("en-IN") })}</p>
            <ul className="mt-2 space-y-0.5 text-sm text-ink">
              {features(option).map((f) => <li key={f}>✓ {t(`wallet.feature.${f}`)}</li>)}
              {features(option).length === 0 && <li className="text-muted">{t("wallet.feature.reminders_only")}</li>}
            </ul>
            {option.code === current?.code ? (
              <p className="mt-4 text-sm font-medium text-brand-700">{t("wallet.your_plan")}</p>
            ) : canPay ? (
              <Button variant="secondary" className="mt-4" onClick={() => setChoice(option)}>{t("wallet.request_plan")}</Button>
            ) : null}
          </section>
        ))}
      </div>
      <p className="text-sm text-muted">{t("wallet.plan_view_only")}</p>
      <Dialog
        open={Boolean(choice)}
        title={choice ? t("wallet.request_title", { plan: choice.name }) : ""}
        onClose={() => setChoice(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setChoice(null)}>{t("common.cancel")}</Button>
            <Button onClick={request} loading={busy}>{t("wallet.send_request")}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p>{t("wallet.request_hint")}</p>
          {error && <Alert>{error}</Alert>}
          <TextAreaField label={t("wallet.request_note")} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Dialog>
    </div>
  );
}

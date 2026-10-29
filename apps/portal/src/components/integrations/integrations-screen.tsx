"use client";

import { unwrap } from "@saas/api-client";
import { Alert, Button, cn, ConfirmDialog, Dialog, SelectField, Spinner, StatusPill, type StatusTone, TextField } from "@saas/ui";
import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { errorMessage, t } from "@/i18n";
import { api, ensureCsrf } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { keys, useApiKeys, useEventTypes, useRefresh, useWebhookDeliveries, useWebhookEndpoints } from "@/lib/queries";
import type { ApiKey, WebhookEndpoint } from "@/lib/types";

const DELIVERY_TONES: Record<string, StatusTone> = { pending: "info", succeeded: "ok", failed: "error" };

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Integrations (spec 2.10): API keys, webhook endpoints, delivery log. Owner only. */
export function IntegrationsScreen() {
  return (
    <>
      <PageHeader title={t("nav.integrations")} description={t("integrations.description")} />
      <div className="space-y-8">
        <ApiKeys />
        <Webhooks />
        <DeliveryLog />
        <HowTo />
      </div>
    </>
  );
}

// --- API keys ---------------------------------------------------------------------------------

function ApiKeys() {
  const list = useApiKeys();
  const refresh = useRefresh();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<{ name: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);

  async function create() {
    if (name.trim().length < 2) return setError(t("integrations.key_name_error"));
    setBusy(true);
    setError(undefined);
    try {
      await ensureCsrf();
      const result = await unwrap(api.POST("/api/portal/integrations/api-keys", { body: { name: name.trim() } }));
      await refresh(keys.integrations);
      setCreated({ name: result.key.name, secret: result.secret });
      setCopied(false);
      setName("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!revoking) return;
    setBusy(true);
    try {
      await ensureCsrf();
      await unwrap(api.POST("/api/portal/integrations/api-keys/{id}/revoke", { params: { path: { id: revoking.id } } }));
      await refresh(keys.integrations);
      setRevoking(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={t("integrations.api_keys")} className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-ink">{t("integrations.api_keys")}</h2>
        <p className="text-sm text-muted">{t("integrations.api_keys_hint")}</p>
      </div>
      {error && <Alert>{error}</Alert>}
      {list.isPending ? (
        <Spinner label={t("app.loading")} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <caption className="sr-only">{t("integrations.api_keys")}</caption>
            <thead className="bg-slate-50 text-left text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-2">{t("integrations.col.name")}</th>
                <th scope="col" className="px-4 py-2">{t("integrations.col.key")}</th>
                <th scope="col" className="px-4 py-2">{t("integrations.col.created")}</th>
                <th scope="col" className="px-4 py-2">{t("integrations.col.last_used")}</th>
                <th scope="col" className="px-4 py-2">{t("integrations.col.status")}</th>
                <th scope="col" className="px-4 py-2"><span className="sr-only">{t("integrations.revoke")}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(list.data ?? []).length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">{t("integrations.no_keys")}</td></tr>}
              {(list.data ?? []).map((key) => (
                <tr key={key.id} data-key={key.name} data-revoked={key.revoked_at ? "true" : "false"}>
                  <td className="px-4 py-2 font-medium text-ink">{key.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">{key.prefix}</td>
                  <td className="px-4 py-2 text-muted">{formatDateTime(key.created_at)}<span className="block text-xs">{key.created_by_email}</span></td>
                  <td className="px-4 py-2 text-muted">{key.last_used_at ? formatDateTime(key.last_used_at) : t("integrations.never")}</td>
                  <td className="px-4 py-2">
                    {key.revoked_at ? <StatusPill tone="neutral">{t("integrations.revoked")}</StatusPill> : <StatusPill tone="ok">{t("integrations.active")}</StatusPill>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!key.revoked_at && <Button variant="ghost" onClick={() => setRevoking(key)}>{t("integrations.revoke")}</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-72"><TextField label={t("integrations.key_name")} placeholder={t("integrations.key_name_placeholder")} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <Button onClick={create} loading={busy && !revoking}>{t("integrations.create_key")}</Button>
      </div>

      <Dialog
        open={Boolean(created)}
        title={t("integrations.key_created", { name: created?.name ?? "" })}
        onClose={() => setCreated(null)}
        footer={<Button onClick={() => setCreated(null)}>{t("integrations.done")}</Button>}
      >
        <div className="space-y-3">
          <Alert tone="warn">{t("integrations.shown_once")}</Alert>
          <code data-testid="new-api-key" className="block break-all rounded-lg bg-slate-900 p-3 font-mono text-xs text-emerald-200">{created?.secret}</code>
          <Button variant="secondary" onClick={async () => setCopied(await copy(created?.secret ?? ""))}>{copied ? t("integrations.copied") : t("integrations.copy")}</Button>
        </div>
      </Dialog>
      <ConfirmDialog
        open={Boolean(revoking)}
        title={t("integrations.revoke_title", { name: revoking?.name ?? "" })}
        message={t("integrations.revoke_message")}
        confirmLabel={t("integrations.revoke")}
        cancelLabel={t("common.cancel")}
        danger
        busy={busy}
        onConfirm={revoke}
        onClose={() => setRevoking(null)}
      />
    </section>
  );
}

// --- webhooks ---------------------------------------------------------------------------------

function Webhooks() {
  const endpoints = useWebhookEndpoints();
  const events = useEventTypes();
  const refresh = useRefresh();
  const [url, setUrl] = useState("");
  const [chosen, setChosen] = useState<string[]>(["outcome.recorded"]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  async function run(kind: string, call: () => Promise<unknown>, message?: string) {
    setBusy(kind);
    setError(undefined);
    setNotice(undefined);
    try {
      await ensureCsrf();
      await call();
      await refresh(keys.integrations);
      if (message) setNotice(message);
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    if (!/^https?:\/\/.+/.test(url.trim())) return setError(t("integrations.url_error"));
    if (chosen.length === 0) return setError(t("integrations.events_error"));
    if (await run("add", () => unwrap(api.POST("/api/portal/integrations/webhooks", { body: { url: url.trim(), events: chosen as never } })), t("integrations.endpoint_added"))) setUrl("");
  }

  return (
    <section aria-label={t("integrations.webhooks")} className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-ink">{t("integrations.webhooks")}</h2>
        <p className="text-sm text-muted">{t("integrations.webhooks_hint")}</p>
      </div>
      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {endpoints.isPending ? (
        <Spinner label={t("app.loading")} />
      ) : (
        <ul className="space-y-3">
          {(endpoints.data ?? []).map((endpoint) => (
            <EndpointCard key={endpoint.id} endpoint={endpoint} busy={busy} run={run} labels={events.data ?? []} />
          ))}
        </ul>
      )}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <TextField label={t("integrations.url")} placeholder="https://your-system.example.com/webhooks" value={url} onChange={(e) => setUrl(e.target.value)} />
        <fieldset>
          <legend className="text-sm font-medium text-ink">{t("integrations.events")}</legend>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
            {(events.data ?? []).map((event) => (
              <label key={event.code} className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" className="h-4 w-4" checked={chosen.includes(event.code)} onChange={(e) => setChosen(e.target.checked ? [...chosen, event.code] : chosen.filter((c) => c !== event.code))} />
                {event.label} <code className="text-xs text-muted">{event.code}</code>
              </label>
            ))}
          </div>
        </fieldset>
        <Button onClick={add} loading={busy === "add"}>{t("integrations.add_endpoint")}</Button>
      </div>
    </section>
  );
}

function EndpointCard({
  endpoint,
  busy,
  run,
  labels,
}: {
  endpoint: WebhookEndpoint;
  busy: string | null;
  run: (kind: string, call: () => Promise<unknown>, message?: string) => Promise<boolean>;
  labels: { code: string; label: string }[];
}) {
  const [reveal, setReveal] = useState(false);
  const [rotating, setRotating] = useState(false);
  const path = { params: { path: { id: endpoint.id } } };
  return (
    <li className={cn("rounded-xl border bg-white p-4", endpoint.is_active ? "border-slate-200" : "border-dashed border-slate-300 opacity-75")} data-endpoint={endpoint.url}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="break-all font-mono text-sm text-ink">{endpoint.url}</p>
          <p className="flex flex-wrap gap-1">
            {endpoint.events.map((code) => <StatusPill key={code} tone="neutral">{labels.find((l) => l.code === code)?.label ?? code}</StatusPill>)}
            {!endpoint.is_active && <StatusPill tone="warn">{t("integrations.paused")}</StatusPill>}
          </p>
          <p className="flex items-center gap-2 text-xs text-muted">
            {t("integrations.secret")}:{" "}
            <code data-testid="webhook-secret" className="font-mono text-ink">{reveal ? endpoint.secret : `whsec_${"•".repeat(16)}`}</code>
            <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setReveal(!reveal)}>{reveal ? t("integrations.hide") : t("integrations.reveal")}</button>
            <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => copy(endpoint.secret)}>{t("integrations.copy")}</button>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={busy === `test-${endpoint.id}`} disabled={!endpoint.is_active} onClick={() => run(`test-${endpoint.id}`, () => unwrap(api.POST("/api/portal/integrations/webhooks/{id}/test", path)), t("integrations.test_sent"))}>
            {t("integrations.send_test")}
          </Button>
          <Button variant="ghost" onClick={() => run(`toggle-${endpoint.id}`, () => unwrap(api.PATCH("/api/portal/integrations/webhooks/{id}", { ...path, body: { is_active: !endpoint.is_active } })))}>
            {endpoint.is_active ? t("integrations.pause") : t("integrations.resume")}
          </Button>
          <Button variant="ghost" onClick={() => setRotating(true)}>{t("integrations.rotate")}</Button>
        </div>
      </div>
      <ConfirmDialog
        open={rotating}
        title={t("integrations.rotate_title")}
        message={t("integrations.rotate_message")}
        confirmLabel={t("integrations.rotate")}
        cancelLabel={t("common.cancel")}
        busy={busy === `rotate-${endpoint.id}`}
        onConfirm={async () => { if (await run(`rotate-${endpoint.id}`, () => unwrap(api.POST("/api/portal/integrations/webhooks/{id}/rotate-secret", path)), t("integrations.rotated"))) setRotating(false); }}
        onClose={() => setRotating(false)}
      />
    </li>
  );
}

// --- delivery log -----------------------------------------------------------------------------

function DeliveryLog() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const refresh = useRefresh();
  const deliveries = useWebhookDeliveries({ ...(status ? { status } : {}), page: String(page) });
  const [error, setError] = useState<string>();

  async function retry(id: string) {
    setError(undefined);
    try {
      await ensureCsrf();
      await unwrap(api.POST("/api/portal/integrations/deliveries/{id}/retry", { params: { path: { id } } }));
      await refresh(keys.integrations);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <section aria-label={t("integrations.log")} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">{t("integrations.log")}</h2>
          <p className="text-sm text-muted">{t("integrations.log_hint")}</p>
        </div>
        <div className="w-44">
          <SelectField label={t("integrations.col.status")} value={status} placeholder={t("common.all")} options={["pending", "succeeded", "failed"].map((s) => ({ value: s, label: t(`integrations.delivery.${s}`) }))} onChange={(e) => { setStatus(e.target.value); setPage(1); }} />
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      {deliveries.isPending ? (
        <Spinner label={t("app.loading")} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <caption className="sr-only">{t("integrations.log")}</caption>
            <thead className="bg-slate-50 text-left text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-2">{t("integrations.col.when")}</th>
                <th scope="col" className="px-4 py-2">{t("integrations.col.event")}</th>
                <th scope="col" className="px-4 py-2">{t("integrations.col.endpoint")}</th>
                <th scope="col" className="px-4 py-2">{t("integrations.col.status")}</th>
                <th scope="col" className="px-4 py-2 text-right">{t("integrations.col.attempts")}</th>
                <th scope="col" className="px-4 py-2">{t("integrations.col.result")}</th>
                <th scope="col" className="px-4 py-2"><span className="sr-only">{t("integrations.details")}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(deliveries.data?.results ?? []).length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-muted">{t("integrations.no_deliveries")}</td></tr>}
              {(deliveries.data?.results ?? []).map((row) => (
                <FragmentRow key={row.id} open={open === row.id}>
                  <tr data-delivery={row.event_type} data-status={row.status}>
                    <td className="px-4 py-2 text-muted">{formatDateTime(row.created_at)}</td>
                    <td className="px-4 py-2 font-mono text-xs text-ink">{row.event_type}</td>
                    <td className="max-w-56 truncate px-4 py-2 font-mono text-xs text-muted" title={row.endpoint_url}>{row.endpoint_url}</td>
                    <td className="px-4 py-2"><StatusPill tone={DELIVERY_TONES[row.status] ?? "neutral"}>{t(`integrations.delivery.${row.status}`)}</StatusPill></td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.attempts}</td>
                    <td className="px-4 py-2 text-xs text-muted">
                      {row.last_status_code ? `HTTP ${row.last_status_code}` : row.last_error || t("common.none")}
                      {row.status === "pending" && row.next_attempt_at && <span className="block">{t("integrations.next_try", { time: formatDateTime(row.next_attempt_at) })}</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="flex justify-end gap-1">
                        <Button variant="ghost" onClick={() => setOpen(open === row.id ? null : row.id)}>{open === row.id ? t("integrations.hide") : t("integrations.payload")}</Button>
                        {row.status === "failed" && <Button variant="secondary" onClick={() => retry(row.id)}>{t("integrations.retry")}</Button>}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={7} className="bg-slate-50 px-4 py-3">
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs text-ink">{JSON.stringify(row.payload, null, 2)}</pre>
                    </td>
                  </tr>
                </FragmentRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {deliveries.data && deliveries.data.count > 0 && <Pagination page={page} count={deliveries.data.count} pageSize={50} onChange={setPage} />}
    </section>
  );
}

/** A table row plus an optional detail row underneath. */
function FragmentRow({ open, children }: { open: boolean; children: [React.ReactNode, React.ReactNode] }) {
  return (
    <>
      {children[0]}
      {open && children[1]}
    </>
  );
}

// --- how to use -------------------------------------------------------------------------------

const VERIFY_NODE = `import crypto from "node:crypto";

// raw = the request body exactly as received (a Buffer), header = X-SC-Signature
function verify(secret, raw, header) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const expected = crypto.createHmac("sha256", secret).update(\`\${parts.t}.\`).update(raw).digest("hex");
  const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) < 300;
  return fresh && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}`;

const VERIFY_PYTHON = `import hashlib, hmac, time

def verify(secret: str, raw: bytes, header: str) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    expected = hmac.new(secret.encode(), f"{parts['t']}.".encode() + raw, hashlib.sha256).hexdigest()
    fresh = abs(time.time() - int(parts["t"])) < 300
    return fresh and hmac.compare_digest(expected, parts["v1"])`;

function HowTo() {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <section aria-label={t("integrations.how_to")} className="space-y-3">
      <h2 className="text-base font-semibold text-ink">{t("integrations.how_to")}</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm text-ink">{t("integrations.how_api")}</p>
          <pre className="overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-100">{`curl -H "Authorization: Bearer sck_…" \\\n  ${origin}/api/v1/subscribers\n\ncurl "${origin}/api/v1/outcomes?since=2026-10-29T00:00:00%2B05:30" \\\n  -H "Authorization: Bearer sck_…"`}</pre>
          <p className="text-xs text-muted">{t("integrations.how_api_more")}</p>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-ink">{t("integrations.how_verify")}</p>
          <details open>
            <summary className="cursor-pointer text-sm font-medium text-brand-700">Node.js</summary>
            <pre className="mt-2 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-100">{VERIFY_NODE}</pre>
          </details>
          <details>
            <summary className="cursor-pointer text-sm font-medium text-brand-700">Python</summary>
            <pre className="mt-2 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-100">{VERIFY_PYTHON}</pre>
          </details>
        </div>
      </div>
    </section>
  );
}

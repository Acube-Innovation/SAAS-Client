"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { unwrap } from "@saas/api-client";
import { Alert, Button, cn, ConfirmDialog, Dialog, Spinner, StatusPill, type StatusTone, TextAreaField } from "@saas/ui";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";

import { OUTCOME_TONES } from "@/components/bookings/labels";
import { PageHeader } from "@/components/page-header";
import { errorMessage, fieldError, t } from "@/i18n";
import { api, ensureCsrf } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { keys, useContentTemplates, usePortalConfig, useQuestionFlows, useRefresh, useVoiceScripts } from "@/lib/queries";
import { sendBackSchema } from "@/lib/schemas";
import type { ClientTemplate, ClientVersion } from "@/lib/types";

import { useCanReview } from "./can-review";
import { ChangeRequestsTab } from "./change-requests";
import { PhonePreview } from "./phone-preview";

const TABS = ["templates", "voice", "flows", "requests"] as const;
type Tab = (typeof TABS)[number];

export const VERSION_TONES: Record<string, StatusTone> = {
  sent_to_client: "warn",
  signed_off: "info",
  sent_back: "neutral",
  submitted: "info",
  approved: "info",
  rejected: "error",
};

/** Messages and voice (spec 2.6): view-only content, approvals and change requests. */
export function MessagesScreen() {
  const params = useSearchParams();
  const pathname = usePathname();
  const requested = params.get("tab") as Tab | null;
  const tab: Tab = requested && TABS.includes(requested) ? requested : "templates";
  const templates = useContentTemplates();
  const waiting = (templates.data ?? []).filter((tpl) => tpl.pending?.can_review).length;

  return (
    <>
      <PageHeader title={t("nav.messages")} description={t("messages.description")} />
      <nav aria-label={t("messages.sections")} className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((key) => (
          <Link
            key={key}
            href={key === "templates" ? pathname : `${pathname}?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium",
              tab === key ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t(`messages.tab.${key}`)}
            {key === "templates" && waiting > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-800">{waiting}</span>
            )}
          </Link>
        ))}
      </nav>
      {tab === "templates" && <TemplatesTab />}
      {tab === "voice" && <VoiceTab />}
      {tab === "flows" && <FlowsTab />}
      {tab === "requests" && <ChangeRequestsTab />}
    </>
  );
}

// --- WhatsApp templates -------------------------------------------------------------------------

function TemplatesTab() {
  const templates = useContentTemplates();
  const config = usePortalConfig();
  if (templates.isPending || config.isPending) return <Spinner label={t("app.loading")} />;
  if (templates.isError) return <Alert>{errorMessage(templates.error)}</Alert>;
  const groups = new Map<string, ClientTemplate[]>();
  for (const template of templates.data) groups.set(template.name, [...(groups.get(template.name) ?? []), template]);
  const waiting = templates.data.filter((tpl) => tpl.pending?.can_review).length;

  if (groups.size === 0) {
    return <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">{t("messages.no_templates")}</p>;
  }
  return (
    <div className="space-y-6">
      <Alert tone="info">{t("messages.view_only")}</Alert>
      {waiting > 0 && <Alert tone="warn">{t(waiting === 1 ? "messages.waiting_one" : "messages.waiting_other", { count: waiting })}</Alert>}
      {[...groups.entries()].map(([name, items]) => (
        <TemplateGroup key={name} name={name} items={items} agencyName={config.data?.tenant_name ?? ""} />
      ))}
    </div>
  );
}

function TemplateGroup({ name, items, agencyName }: { name: string; items: ClientTemplate[]; agencyName: string }) {
  const first = items.find((i) => i.pending?.can_review) ?? items[0];
  const [language, setLanguage] = useState(first?.language);
  const template = items.find((i) => i.language === language) ?? first;
  if (!template) return null;

  return (
    <section aria-label={name} data-template={name} className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-mono text-sm font-semibold text-ink">{name}</h2>
          <p className="text-sm text-muted">{template.schedule_type_name}</p>
        </div>
        <div role="tablist" aria-label={t("messages.languages")} className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {items.map((item) => (
            <button
              key={item.language}
              type="button"
              role="tab"
              aria-selected={item.language === template.language}
              onClick={() => setLanguage(item.language)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium",
                item.language === template.language ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              {t(`language.${item.language}`)}
              {item.pending?.can_review && <span aria-label={t("messages.needs_review")} className="h-2 w-2 rounded-full bg-amber-500" />}
            </button>
          ))}
        </div>
      </div>
      <TemplateLanguage key={template.id} template={template} agencyName={agencyName} />
    </section>
  );
}

const CONTENT_PARTS = ["header_text", "body", "footer", "buttons"] as const;

/** Which parts of the pending version differ from the live one. */
export function changedParts(live: ClientVersion | null | undefined, pending: ClientVersion): string[] {
  if (!live) return [];
  return CONTENT_PARTS.filter((part) => JSON.stringify(live[part] ?? "") !== JSON.stringify(pending[part] ?? ""));
}

function TemplateLanguage({ template, agencyName }: { template: ClientTemplate; agencyName: string }) {
  const { live, pending } = template;
  const canReview = useCanReview();
  const refresh = useRefresh();
  const [dialog, setDialog] = useState<"approve" | "send_back" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  async function act(kind: "approve" | "send_back", comment?: string) {
    if (!pending) return;
    setBusy(true);
    setError(undefined);
    try {
      await ensureCsrf();
      const path = { params: { path: { id: template.id, vid: pending.id } } };
      if (kind === "approve") await unwrap(api.POST("/api/portal/content/templates/{id}/versions/{vid}/approve", path));
      else await unwrap(api.POST("/api/portal/content/templates/{id}/versions/{vid}/send-back", { ...path, body: { comment: comment! } }));
      await refresh(keys.content, keys.changeRequests);
      setNotice(t(kind === "approve" ? "messages.approved_done" : "messages.sent_back_done"));
      setDialog(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  const changed = pending ? changedParts(live, pending) : [];
  return (
    <div className="mt-5 space-y-5">
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && !dialog && <Alert>{error}</Alert>}
      <div className={cn("grid gap-6", pending && "lg:grid-cols-2")}>
        <div className="space-y-3" data-version="live">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            {live ? t("messages.live_version", { version: live.version }) : t("messages.not_live")}
            {live && <StatusPill tone="ok">{t("messages.live")}</StatusPill>}
          </h3>
          {live ? (
            <>
              <PhonePreview content={live} agencyName={agencyName} />
              <ButtonOutcomes version={live} />
            </>
          ) : (
            <p className="text-sm text-muted">{t("messages.not_live_hint")}</p>
          )}
        </div>
        {pending && (
          <div
            className={cn("space-y-3 rounded-xl p-4", pending.can_review ? "bg-amber-50 ring-1 ring-amber-200" : "bg-slate-50")}
            data-version="pending"
          >
            <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
              {t("messages.new_version", { version: pending.version })}
              <StatusPill tone={VERSION_TONES[pending.status] ?? "neutral"}>{t(`messages.status.${pending.status}`)}</StatusPill>
            </h3>
            <p className="text-sm text-muted">{t(`messages.status_hint.${pending.status}`)}</p>
            {changed.length > 0 && (
              <p className="text-sm text-ink">
                {t("messages.changed", { parts: changed.map((p) => t(`messages.part.${p}`)).join(", ") })}
              </p>
            )}
            {pending.sent_back_comment && (
              <blockquote className="border-l-2 border-slate-300 pl-3 text-sm text-ink">{pending.sent_back_comment}</blockquote>
            )}
            {pending.signed_off_at && (
              <p className="text-xs text-muted">
                {t("messages.signed_off_by", { name: pending.signed_off_by_name ?? t("messages.platform_team"), date: formatDateTime(pending.signed_off_at) })}
              </p>
            )}
            <PhonePreview content={pending} agencyName={agencyName} />
            <ButtonOutcomes version={pending} />
            {pending.can_review && canReview && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setDialog("approve")}>{t("messages.approve")}</Button>
                <Button variant="secondary" onClick={() => setDialog("send_back")}>{t("messages.send_back")}</Button>
              </div>
            )}
            {pending.can_review && !canReview && <p className="text-xs text-muted">{t("messages.review_roles")}</p>}
          </div>
        )}
      </div>
      <History template={template} />

      <ConfirmDialog
        open={dialog === "approve"}
        title={t("messages.approve_title", { version: pending?.version ?? "", language: t(`language.${template.language}`) })}
        message={
          <div className="space-y-2">
            <p>{t("messages.approve_message")}</p>
            {error && <Alert>{error}</Alert>}
          </div>
        }
        confirmLabel={t("messages.approve")}
        cancelLabel={t("common.cancel")}
        busy={busy}
        onConfirm={() => act("approve")}
        onClose={() => { setDialog(null); setError(undefined); }}
      />
      <SendBackDialog
        open={dialog === "send_back"}
        busy={busy}
        error={error}
        version={pending?.version ?? 0}
        onClose={() => { setDialog(null); setError(undefined); }}
        onSubmit={(comment) => act("send_back", comment)}
      />
    </div>
  );
}

function ButtonOutcomes({ version }: { version: ClientVersion }) {
  if (version.buttons.length === 0) return null;
  return (
    <dl className="max-w-[20rem] space-y-1 text-sm" aria-label={t("messages.button_outcomes")}>
      {version.buttons.map((button) => (
        <div key={button.text} className="flex items-center justify-between gap-2">
          <dt className="text-ink">{button.text}</dt>
          <dd>
            <StatusPill tone={OUTCOME_TONES[button.outcome] ?? "neutral"}>{t(`outcome.${button.outcome}`)}</StatusPill>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function History({ template }: { template: ClientTemplate }) {
  if (template.history.length === 0) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium text-brand-700">{t("messages.history")}</summary>
      <ol className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3">
        {template.history.map((event, i) => (
          <li key={i} data-action={event.action}>
            <span className="text-xs text-muted">{formatDateTime(event.created_at)} · </span>
            <span className="text-ink">
              {t(`messages.event.${event.action}`, { version: event.version, name: event.by ?? t("messages.platform_team") })}
            </span>
            {event.note && <span className="block text-muted">“{event.note}”</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}

function SendBackDialog({
  open,
  busy,
  error,
  version,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  error?: string;
  version: number;
  onClose: () => void;
  onSubmit: (comment: string) => void;
}) {
  const formId = useId();
  const form = useForm<{ comment: string }>({ resolver: zodResolver(sendBackSchema), defaultValues: { comment: "" } });
  useEffect(() => {
    if (!open) form.reset({ comment: "" });
  }, [open, form]);
  return (
    <Dialog
      open={open}
      title={t("messages.send_back_title", { version })}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>{t("common.cancel")}</Button>
          <Button type="submit" form={formId} loading={busy}>{t("messages.send_back")}</Button>
        </>
      }
    >
      <form id={formId} noValidate className="space-y-3" onSubmit={form.handleSubmit(({ comment }) => onSubmit(comment.trim()))}>
        <p>{t("messages.send_back_hint")}</p>
        {error && <Alert>{error}</Alert>}
        <TextAreaField label={t("messages.what_to_change")} required error={fieldError(form.formState.errors.comment)} {...form.register("comment")} />
      </form>
    </Dialog>
  );
}

// --- Voice scripts and question flows -----------------------------------------------------------

function VoiceTab() {
  const scripts = useVoiceScripts();
  if (scripts.isPending) return <Spinner label={t("app.loading")} />;
  if (scripts.isError) return <Alert>{errorMessage(scripts.error)}</Alert>;
  if (scripts.data.length === 0) {
    return <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">{t("messages.no_voice")}</p>;
  }
  return (
    <div className="space-y-4">
      <Alert tone="info">{t("messages.view_only")}</Alert>
      {scripts.data.map((script) => (
        <section key={script.id} aria-label={script.name} className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-sm font-semibold text-ink">{script.name}</h2>
            <StatusPill tone="neutral">{t(`language.${script.language}`)}</StatusPill>
            {script.live && <StatusPill tone="ok">{t("messages.live_version", { version: script.live.version })}</StatusPill>}
          </div>
          <p className="text-sm text-muted">{script.schedule_type_name}</p>
          {script.live && (
            <div className="mt-4 grid gap-6 md:grid-cols-[1fr_16rem]">
              <ol className="space-y-3" aria-label={t("messages.script")}>
                <ScriptLine speaker={t("messages.voice_says")} label={t("messages.greeting")} text={script.live.greeting} />
                <ScriptLine speaker={t("messages.voice_says")} label={t("messages.question")} text={script.live.question} />
                <li className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("messages.customer_answers")}</p>
                  <ul className="mt-2 space-y-1.5">
                    {script.live.answers.map((answer) => (
                      <li key={answer.text} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-ink">“{answer.text}”</span>
                        <StatusPill tone={OUTCOME_TONES[answer.outcome] ?? "neutral"}>{t(`outcome.${answer.outcome}`)}</StatusPill>
                      </li>
                    ))}
                  </ul>
                </li>
              </ol>
              <dl className="space-y-2 text-sm">
                <Setting label={t("messages.voice")} value={script.live.voice || t("common.none")} />
                <Setting label={t("messages.retries")} value={String(script.live.max_retries)} />
                <Setting label={t("messages.retry_gap")} value={t("messages.minutes", { count: script.live.retry_gap_minutes })} />
              </dl>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function ScriptLine({ speaker, label, text }: { speaker: string; label: string; text: string }) {
  return (
    <li className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label} · {speaker}
      </p>
      <p className="mt-1 text-ink">{text}</p>
    </li>
  );
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 pb-1">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

function FlowsTab() {
  const flows = useQuestionFlows();
  if (flows.isPending) return <Spinner label={t("app.loading")} />;
  if (flows.isError) return <Alert>{errorMessage(flows.error)}</Alert>;
  return (
    <div className="space-y-4">
      <Alert tone="info">{t("messages.flows_hint")}</Alert>
      {flows.data.map((flow) => (
        <section key={flow.schedule_type} aria-label={flow.name} className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-ink">{flow.name}</h2>
          <table className="mt-3 min-w-full text-sm">
            <caption className="sr-only">{flow.name}</caption>
            <thead className="text-left text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="py-2 pr-4">{t("messages.answer")}</th>
                <th scope="col" className="py-2 pr-4">{t("messages.records")}</th>
                <th scope="col" className="py-2">{t("messages.then")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {flow.answers.map((answer) => (
                <tr key={answer.key} data-answer={answer.key}>
                  <td className="py-2 pr-4 text-ink">{answer.label}</td>
                  <td className="py-2 pr-4">
                    <StatusPill tone={OUTCOME_TONES[answer.outcome] ?? "neutral"}>{t(`outcome.${answer.outcome}`)}</StatusPill>
                  </td>
                  <td className="py-2 text-muted">
                    {answer.pick_next_delivery_days
                      ? t("messages.pick_days", { count: answer.pick_next_delivery_days })
                      : t(`messages.then.${answer.outcome}`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

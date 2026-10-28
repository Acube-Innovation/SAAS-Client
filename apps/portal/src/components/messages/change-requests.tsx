"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { unwrap } from "@saas/api-client";
import { Alert, Button, Dialog, SelectField, Spinner, StatusPill, type StatusTone, TextAreaField, TextField } from "@saas/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";

import { PageHeader } from "@/components/page-header";
import { errorMessage, fieldError, t } from "@/i18n";
import { api, ensureCsrf } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { keys, useChangeRequest, useChangeRequests, useRefresh } from "@/lib/queries";
import { changeRequestSchema, type ChangeRequestValues, commentSchema, REQUEST_TYPES } from "@/lib/schemas";
import { applyServerErrors } from "@/lib/server-errors";

import { useCanReview } from "./can-review";

export const REQUEST_TONES: Record<string, StatusTone> = {
  open: "warn",
  in_progress: "info",
  done: "ok",
  declined: "neutral",
};

/** Change requests (spec 2.6): raise one, follow its status, comment. */
export function ChangeRequestsTab() {
  const canRequest = useCanReview();
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const requests = useChangeRequests(status ? { status } : {});
  const rows = requests.data?.results ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-56">
          <SelectField
            label={t("bookings.status")}
            value={status}
            placeholder={t("common.all")}
            options={["open", "in_progress", "done", "declined"].map((s) => ({ value: s, label: t(`requests.status.${s}`) }))}
            onChange={(e) => setStatus(e.target.value)}
          />
        </div>
        {canRequest && <Button onClick={() => setCreating(true)}>{t("requests.new")}</Button>}
      </div>
      <p className="text-sm text-muted">{t("requests.hint")}</p>
      {requests.isError && <Alert>{errorMessage(requests.error)}</Alert>}
      {requests.isPending ? (
        <Spinner label={t("app.loading")} />
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">{t("requests.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <caption className="sr-only">{t("messages.tab.requests")}</caption>
            <thead className="bg-slate-50 text-left text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-2">{t("requests.subject")}</th>
                <th scope="col" className="px-4 py-2">{t("requests.type")}</th>
                <th scope="col" className="px-4 py-2">{t("bookings.status")}</th>
                <th scope="col" className="px-4 py-2">{t("requests.raised_by")}</th>
                <th scope="col" className="px-4 py-2">{t("requests.raised_on")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} data-request={row.id}>
                  <td className="px-4 py-2">
                    <Link href={`/messages/requests/${row.id}`} className="font-medium text-brand-700 hover:underline">{row.subject}</Link>
                    {row.comment_count > 0 && <span className="ml-2 text-xs text-muted">{t("requests.comment_count", { count: row.comment_count })}</span>}
                  </td>
                  <td className="px-4 py-2 text-ink">{t(`requests.type.${row.request_type}`)}</td>
                  <td className="px-4 py-2"><StatusPill tone={REQUEST_TONES[row.status] ?? "neutral"}>{t(`requests.status.${row.status}`)}</StatusPill></td>
                  <td className="px-4 py-2 text-muted">{row.requested_by_name}</td>
                  <td className="px-4 py-2 text-muted">{formatDate(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NewRequestDialog open={creating} onClose={() => setCreating(false)} onCreated={(id) => router.push(`/messages/requests/${id}`)} />
    </div>
  );
}

function NewRequestDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const formId = useId();
  const refresh = useRefresh();
  const [error, setError] = useState<string>();
  const form = useForm<ChangeRequestValues>({
    resolver: zodResolver(changeRequestSchema),
    defaultValues: { request_type: "" as ChangeRequestValues["request_type"], subject: "", description: "" },
  });
  const errors = form.formState.errors;
  useEffect(() => {
    if (!open) form.reset();
  }, [open, form]);

  function close() {
    setError(undefined);
    onClose();
  }

  async function onSubmit(values: ChangeRequestValues) {
    setError(undefined);
    try {
      await ensureCsrf();
      const created = await unwrap(api.POST("/api/portal/change-requests", { body: values }));
      await refresh(keys.changeRequests);
      close();
      onCreated(created.id);
    } catch (caught) {
      setError(applyServerErrors(caught, form.setError, ["request_type", "subject", "description"]));
    }
  }

  return (
    <Dialog
      open={open}
      title={t("requests.new_title")}
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close}>{t("common.cancel")}</Button>
          <Button type="submit" form={formId} loading={form.formState.isSubmitting}>{t("requests.submit")}</Button>
        </>
      }
    >
      <form id={formId} noValidate className="space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
        <p>{t("requests.new_hint")}</p>
        {error && <Alert>{error}</Alert>}
        <SelectField
          label={t("requests.type")}
          required
          placeholder={t("common.choose")}
          options={REQUEST_TYPES.map((type) => ({ value: type, label: t(`requests.type.${type}`) }))}
          error={fieldError(errors.request_type)}
          {...form.register("request_type")}
        />
        <TextField label={t("requests.subject")} required maxLength={150} error={fieldError(errors.subject)} {...form.register("subject")} />
        <TextAreaField label={t("requests.description")} hint={t("requests.description_hint")} error={fieldError(errors.description)} {...form.register("description")} />
      </form>
    </Dialog>
  );
}

/** One change request with its comment thread. */
export function ChangeRequestDetail({ id }: { id: string }) {
  const request = useChangeRequest(id);
  const canComment = useCanReview();
  const refresh = useRefresh();
  const [error, setError] = useState<string>();
  const form = useForm<{ body: string }>({ resolver: zodResolver(commentSchema), defaultValues: { body: "" } });

  if (request.isPending) return <Spinner label={t("app.loading")} />;
  if (request.isError) return <Alert>{errorMessage(request.error)}</Alert>;
  const data = request.data;
  const closed = data.status === "done" || data.status === "declined";

  async function onSubmit({ body }: { body: string }) {
    setError(undefined);
    try {
      await ensureCsrf();
      await unwrap(api.POST("/api/portal/change-requests/{id}/comments", { params: { path: { id } }, body: { body: body.trim() } }));
      await refresh(keys.changeRequests);
      form.reset({ body: "" });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/messages?tab=requests" className="text-brand-700 hover:underline">← {t("messages.tab.requests")}</Link>
      </p>
      <PageHeader
        title={data.subject}
        description={t("requests.meta", { type: t(`requests.type.${data.request_type}`), name: data.requested_by_name, date: formatDateTime(data.created_at) })}
        actions={<StatusPill tone={REQUEST_TONES[data.status] ?? "neutral"}>{t(`requests.status.${data.status}`)}</StatusPill>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {data.description && <p className="whitespace-pre-line rounded-xl border border-slate-200 bg-white p-4 text-sm text-ink">{data.description}</p>}
          <section aria-label={t("requests.comments")} className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">{t("requests.comments")}</h2>
            {data.comments.length === 0 && <p className="text-sm text-muted">{t("requests.no_comments")}</p>}
            <ol className="space-y-3">
              {data.comments.map((comment) => (
                <li
                  key={comment.id}
                  data-from={comment.from_staff ? "staff" : "client"}
                  className={comment.from_staff ? "mr-8 rounded-xl bg-brand-50 p-3" : "ml-8 rounded-xl border border-slate-200 bg-white p-3"}
                >
                  <p className="text-xs text-muted">
                    {comment.from_staff ? t("requests.from_support", { name: comment.author_name }) : comment.author_name} · {formatDateTime(comment.created_at)}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-ink">{comment.body}</p>
                </li>
              ))}
            </ol>
            {canComment && !closed && (
              <form noValidate onSubmit={form.handleSubmit(onSubmit)} aria-label={t("requests.add_comment")} className="space-y-2">
                {error && <Alert>{error}</Alert>}
                <TextAreaField label={t("requests.add_comment")} error={fieldError(form.formState.errors.body)} {...form.register("body")} />
                <Button type="submit" loading={form.formState.isSubmitting}>{t("requests.post_comment")}</Button>
              </form>
            )}
            {closed && <p className="text-sm text-muted">{t("requests.closed_hint")}</p>}
          </section>
        </div>
        <aside className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <p className="font-medium text-ink">{t(`requests.status_hint.${data.status}`)}</p>
            {data.status === "declined" && data.decline_reason && (
              <p className="mt-2 text-ink">
                <span className="text-muted">{t("requests.decline_reason")}: </span>
                {data.decline_reason}
              </p>
            )}
            {data.closed_at && <p className="mt-2 text-xs text-muted">{t("requests.closed_on", { date: formatDateTime(data.closed_at) })}</p>}
          </div>
          {data.linked_version && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm" data-linked-version={data.linked_version.version}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("requests.linked_version")}</p>
              <p className="mt-1 font-mono text-ink">{data.linked_version.template_name}</p>
              <p className="text-muted">
                {t(`language.${data.linked_version.language}`)} · {t("requests.version", { version: data.linked_version.version })} ·{" "}
                {data.linked_version.is_live ? t("messages.live") : t(`requests.version_status.${data.linked_version.status}`)}
              </p>
              <Link href="/messages" className="mt-2 inline-block font-medium text-brand-700 hover:underline">{t("requests.see_templates")}</Link>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

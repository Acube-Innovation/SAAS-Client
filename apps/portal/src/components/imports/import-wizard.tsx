"use client";

import { ApiError, readCookie, unwrap } from "@saas/api-client";
import { Alert, Button, FileUpload, Spinner, StatusPill } from "@saas/ui";
import { useEffect, useState } from "react";

import { errorMessage, t } from "@/i18n";
import { api, ensureCsrf } from "@/lib/api";
import { keys, useImportJob, useRefresh } from "@/lib/queries";

type Entity = "subscribers" | "bookings";
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * CSV import (Workflow 3.5): download the template, upload, wait for the background check, review
 * the totals and per-row errors, confirm, and download the error file. Nothing is saved before
 * Confirm.
 */
export function ImportWizard({ entity, onDone }: { entity: Entity; onDone?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const job = useImportJob(jobId);
  const refresh = useRefresh();
  const data = job.data;

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      await ensureCsrf();
      const form = new FormData();
      form.append("entity", entity);
      form.append("file", file);
      // Multipart upload: plain fetch (the typed client sends JSON).
      const response = await fetch("/api/portal/imports", {
        method: "POST",
        body: form,
        credentials: "include",
        headers: { "X-CSRFToken": readCookie("csrftoken") ?? "" },
      });
      const body = await response.json();
      if (!response.ok) {
        const fileError = Array.isArray(body?.fields?.file) ? body.fields.file.join(" ") : undefined;
        throw new ApiError(response.status, fileError ? { ...body, detail: fileError } : body);
      }
      setJobId(body.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!jobId) return;
    setBusy(true);
    setError(undefined);
    try {
      await ensureCsrf();
      await unwrap(api.POST("/api/portal/imports/{id}/confirm", { params: { path: { id: jobId } } }));
      await job.refetch();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setJobId(null);
    setFile(null);
    setError(undefined);
  }

  const status = data?.status;
  const working = status === "uploaded" || status === "previewing" || status === "confirming";
  useEffect(() => {
    // Once, when the import finishes: lists, Home numbers and the checklist change.
    if (status === "done") void refresh(keys.subscribers, keys.bookings, keys.imports).then(() => onDone?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <section aria-label={t(`import.title.${entity}`)} className="space-y-4">
      {!jobId && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>
              {t("import.step_template")}{" "}
              <a
                className="font-medium text-brand-700 hover:underline"
                href={`/api/portal/imports/template?entity=${entity}`}
                download
              >
                {t("import.download_template")}
              </a>
            </li>
            <li>{t("import.step_fill")}</li>
            <li>{t("import.step_upload")}</li>
          </ol>
          <FileUpload
            label={t("import.file")}
            hint={t("import.file_hint")}
            accept={[".csv"]}
            maxBytes={MAX_BYTES}
            messages={{
              wrongType: t("import.wrong_type"),
              tooLarge: t("import.too_large"),
              choose: t("import.choose"),
              replace: t("import.replace"),
            }}
            onChange={setFile}
          />
          {error && <Alert>{error}</Alert>}
          <Button onClick={upload} disabled={!file} loading={busy}>
            {t("import.check_file")}
          </Button>
        </div>
      )}

      {jobId && !data && <Spinner label={t("app.loading")} />}

      {data && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5" data-status={data.status}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-ink">{data.original_filename}</p>
            <StatusPill tone={status === "failed" ? "error" : status === "done" ? "ok" : working ? "info" : "warn"}>
              {t(`import.status.${data.status}`)}
            </StatusPill>
          </div>

          {working && <Spinner label={t(status === "confirming" ? "import.importing" : "import.checking")} />}

          {status === "failed" && <Alert>{data.failure_reason}</Alert>}

          {(status === "previewed" || status === "done") && (
            <dl className="grid gap-3 sm:grid-cols-4" aria-label={t("import.totals")}>
              <Total label={t("import.total_rows")} value={data.total_rows} />
              <Total label={t("import.valid_rows")} value={data.valid_rows} tone="text-emerald-700" />
              <Total label={t("import.error_rows")} value={data.error_rows} tone={data.error_rows ? "text-red-700" : undefined} />
              {status === "previewed" ? (
                <Total
                  label={t("import.new_and_updated")}
                  value={`${(data.summary as { would_create?: number }).would_create ?? 0} / ${(data.summary as { would_update?: number }).would_update ?? 0}`}
                />
              ) : (
                <Total label={t("import.created_updated")} value={`${data.created_rows} / ${data.updated_rows}`} />
              )}
            </dl>
          )}

          {status === "previewed" && ((data.summary as { ignored_columns?: string[] }).ignored_columns ?? []).length > 0 && (
            <p className="text-sm text-muted">
              {t("import.ignored", { columns: (data.summary as { ignored_columns: string[] }).ignored_columns.join(", ") })}
            </p>
          )}

          {(status === "previewed" || status === "done") && data.error_rows > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">{t("import.errors_title")}</h3>
                <a
                  className="text-sm font-medium text-brand-700 hover:underline"
                  href={`/api/portal/imports/${data.id}/error-file`}
                  download
                >
                  {t("import.download_errors")}
                </a>
              </div>
              <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <caption className="sr-only">{t("import.errors_title")}</caption>
                  <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2">{t("import.row")}</th>
                      <th scope="col" className="px-3 py-2">{t("import.reference")}</th>
                      <th scope="col" className="px-3 py-2">{t("import.problem")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(data.errors as { row: number; key: string; errors: Record<string, string> }[]).map((row) => (
                      <tr key={row.row}>
                        <td className="px-3 py-2 tabular-nums">{row.row}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.key || t("common.none")}</td>
                        <td className="px-3 py-2">
                          {Object.entries(row.errors).map(([column, message]) => (
                            <p key={column}>
                              <span className="font-mono text-xs text-muted">{column}</span>: {message}
                            </p>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && <Alert>{error}</Alert>}
          {status === "previewed" && (
            <Alert tone="info">{data.valid_rows > 0 ? t("import.nothing_saved_yet") : t("import.nothing_valid")}</Alert>
          )}
          <div className="flex flex-wrap gap-3">
            {status === "previewed" && data.valid_rows > 0 && (
              <Button onClick={confirm} loading={busy}>
                {t("import.confirm", { count: data.valid_rows })}
              </Button>
            )}
            {status === "done" && <Alert tone="success">{t("import.done", { created: data.created_rows, updated: data.updated_rows })}</Alert>}
            {(status === "previewed" || status === "done" || status === "failed") && (
              <Button variant="secondary" onClick={restart}>
                {t("import.another")}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Total({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? "text-ink"}`}>
        {typeof value === "number" ? value.toLocaleString("en-IN") : value}
      </dd>
    </div>
  );
}

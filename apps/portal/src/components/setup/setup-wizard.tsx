"use client";

import { Alert, Button, cn, Spinner } from "@saas/ui";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AreaForm, StaffForm } from "@/components/areas/area-forms";
import { ImportWizard } from "@/components/imports/import-wizard";
import { ReminderSettingsForm } from "@/components/settings/reminder-settings-form";
import { InviteForm } from "@/components/users/invite-form";
import { errorMessage, t } from "@/i18n";
import { useAgency, useAreas, useChecklistAction, useHome } from "@/lib/queries";
import type { ChecklistItem } from "@/lib/types";

const STEPS = [
  "agency_details",
  "areas",
  "reminder_settings",
  "import_subscribers",
  "import_bookings",
  "invite_team",
  "auto_top_up",
] as const;
type Step = (typeof STEPS)[number];

/**
 * Guided first-login set-up (Workflow 3.6): the checklist's steps one at a time, with the real
 * forms. Steps tick as the data appears; the owner can move on and come back.
 */
export function SetupWizard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const home = useHome();
  if (home.isError) return <Alert>{errorMessage(home.error)}</Alert>;
  if (!home.data) return <Spinner label={t("app.loading")} />;
  const items = Object.fromEntries((home.data.checklist?.items ?? []).map((i) => [i.key, i])) as Record<Step, ChecklistItem>;
  const requested = params.get("step") as Step | null;
  const step: Step =
    requested && STEPS.includes(requested) ? requested : (STEPS.find((s) => !items[s]?.done && !items[s]?.skipped) ?? "auto_top_up");
  const index = STEPS.indexOf(step);
  const go = (to: Step | "done") => router.replace(to === "done" ? "/home" : `${pathname}?step=${to}`);
  const next = () => go(STEPS[index + 1] ?? "done");
  const doneCount = STEPS.filter((s) => items[s]?.done || items[s]?.skipped).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{t("setup.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("setup.intro", { done: doneCount, total: STEPS.length })}</p>
      </div>
      {home.data.checklist?.complete && (
        <Alert tone="success">
          {t("setup.complete")}{" "}
          <Link href="/home" className="font-medium underline">
            {t("setup.go_home")}
          </Link>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <nav aria-label={t("setup.steps")}>
          <ol className="space-y-1">
            {STEPS.map((key, i) => {
              const item = items[key];
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => go(key)}
                    aria-current={key === step ? "step" : undefined}
                    data-step={key}
                    data-state={item?.done ? "done" : item?.skipped ? "skipped" : "todo"}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm",
                      key === step ? "bg-brand-50 font-medium text-brand-800" : "text-ink hover:bg-slate-100",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                        item?.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-slate-500",
                      )}
                    >
                      {item?.done ? "✓" : i + 1}
                    </span>
                    {t(`checklist.item.${key}`)}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <section aria-label={t(`checklist.item.${step}`)} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {t("setup.step_of", { step: index + 1, total: STEPS.length })}
            </p>
            <h2 className="text-lg font-semibold text-ink">{t(`checklist.item.${step}`)}</h2>
            <p className="mt-1 text-sm text-muted">{t(`setup.help.${step}`)}</p>
          </div>
          {/* key: each step starts fresh (the two imports share a component). */}
          <StepBody key={step} step={step} item={items[step]} onNext={next} />
          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <Button variant="ghost" disabled={index === 0} onClick={() => go(STEPS[index - 1]!)}>
              {t("setup.back")}
            </Button>
            {step !== "auto_top_up" && (
              <Button variant={items[step]?.done ? "primary" : "secondary"} onClick={next}>
                {items[step]?.done ? t("setup.next") : t("setup.later")}
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StepBody({ step, item, onNext }: { step: Step; item?: ChecklistItem; onNext: () => void }) {
  const action = useChecklistAction();
  if (step === "agency_details") return <AgencyStep done={Boolean(item?.done)} onConfirm={() => action.mutate({ item: "agency_details", action: "done" }, { onSuccess: onNext })} />;
  if (step === "areas") return <AreasStep />;
  if (step === "reminder_settings") return <ReminderSettingsForm />;
  if (step === "import_subscribers") return <ImportWizard entity="subscribers" />;
  if (step === "import_bookings") return <ImportWizard entity="bookings" />;
  if (step === "invite_team") return <InviteForm />;
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-slate-50 p-4 text-sm text-ink">
        <p>{t("setup.top_up_body")}</p>
        <p className="mt-2 text-muted">{t("setup.top_up_soon")}</p>
      </div>
      {action.isError && <Alert>{errorMessage(action.error)}</Alert>}
      <div className="flex flex-wrap gap-3">
        <Button disabled title={t("setup.top_up_soon")}>
          {t("setup.top_up_set")}
        </Button>
        {item?.skipped ? (
          <Button variant="secondary" onClick={() => action.mutate({ item: "auto_top_up", action: "unskip" })}>
            {t("checklist.undo_skip")}
          </Button>
        ) : (
          <Button variant="secondary" loading={action.isPending} onClick={() => action.mutate({ item: "auto_top_up", action: "skip" })}>
            {t("setup.top_up_skip")}
          </Button>
        )}
      </div>
    </div>
  );
}

function AgencyStep({ done, onConfirm }: { done: boolean; onConfirm: () => void }) {
  const agency = useAgency();
  if (!agency.data) return <Spinner label={t("app.loading")} />;
  const a = agency.data;
  const rows: [string, string][] = [
    [t("agency.name"), a.name],
    [t("agency.legal_name"), a.legal_name],
    [t("agency.gstin"), a.gstin || t("common.none")],
    [t("agency.address"), [a.address_line1, a.address_line2, a.city, a.state, a.pin_code].filter(Boolean).join(", ")],
    [t("agency.contact"), `${a.contact_name} · ${a.contact_phone} · ${a.contact_email}`],
    [t("agency.daily_send_cap"), a.daily_send_cap.toLocaleString("en-IN")],
  ];
  return (
    <div className="space-y-4">
      <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-2 text-sm">
            <dt className="text-muted">{label}</dt>
            <dd className="text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted">{t("setup.details_wrong")}</p>
      {done ? (
        <Alert tone="success">{t("setup.details_confirmed")}</Alert>
      ) : (
        <Button onClick={onConfirm}>{t("setup.details_ok")}</Button>
      )}
    </div>
  );
}

function AreasStep() {
  const areas = useAreas();
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-sm font-medium text-ink">{t("staff.title")}</h3>
        <StaffForm />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium text-ink">{t("areas.title")}</h3>
        <AreaForm />
      </div>
      {(areas.data ?? []).length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t("setup.areas_added")}>
          {(areas.data ?? []).map((area) => (
            <li key={area.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm">
              {area.name}
              {area.default_staff_name ? ` · ${area.default_staff_name}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { unwrap } from "@saas/api-client";
import { Alert, Button, Spinner, StatusPill } from "@saas/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { errorMessage, t } from "@/i18n";
import { api, ensureCsrf, ME_KEY, useMe } from "@/lib/api";
import { safeNext } from "@/lib/auth";

/** Users with memberships in several agencies pick one (POST /api/auth/tenant). */
function SelectAgency() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const me = useMe();
  const [error, setError] = useState<string>();
  const next = safeNext(params.get("next"));

  useEffect(() => {
    if (!me.isPending && !me.data) router.replace("/login");
  }, [me.isPending, me.data, router]);

  async function choose(tenantId: string) {
    setError(undefined);
    try {
      await ensureCsrf();
      const state = await unwrap(api.POST("/api/auth/tenant", { body: { tenant_id: tenantId } }));
      queryClient.clear();
      queryClient.setQueryData(ME_KEY, state);
      router.replace(next);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  if (!me.data) return <Spinner label={t("app.loading")} />;
  const memberships = me.data.memberships.filter((m) => m.status === "active");
  return (
    <>
      <h1 className="text-lg font-semibold text-ink">{t("agency.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("agency.intro")}</p>
      {error && (
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <ul className="mt-6 space-y-2">
        {memberships.map((m) => (
          <li key={m.tenant_id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <div>
              <p className="font-medium text-ink">{m.tenant_name}</p>
              <p className="text-xs text-muted">{t(`role.${m.role}`)}</p>
            </div>
            <div className="flex items-center gap-3">
              {m.tenant_status === "suspended" && <StatusPill tone="error">{t("agency.suspended")}</StatusPill>}
              <Button variant="secondary" onClick={() => choose(m.tenant_id)}>
                {t("agency.open")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function SelectAgencyPage() {
  return (
    <Suspense>
      <SelectAgency />
    </Suspense>
  );
}

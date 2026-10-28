"use client";

import type { AuthState } from "@saas/api-client";
import { Alert, Button, EmptyState, Spinner } from "@saas/ui";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { errorMessage, t } from "@/i18n";
import { api, ME_KEY, useMe } from "@/lib/api";
import { nextRoute } from "@/lib/auth";
import { canOpen, type PortalRole } from "@/lib/menu";
import { usePortalConfig } from "@/lib/queries";

import { Banners } from "./banners";
import { icons } from "./icons";
import { Sidebar } from "./sidebar";

/**
 * Protected layout: checks the session on every load, sends the user to sign-in, two-factor or
 * the agency choice when needed, and shows only the screens the user's role may use (spec 1.1).
 */
export function PortalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const me = useMe();
  const [menuOpen, setMenuOpen] = useState(false);
  const route = me.isPending ? undefined : nextRoute(me.data);
  const config = usePortalConfig(route === null);

  useEffect(() => {
    if (route === "/login" || route === "/two-factor" || route === "/select-agency") {
      router.replace(`${route}?next=${encodeURIComponent(pathname)}`);
    }
  }, [route, router, pathname]);

  async function signOut() {
    await api.POST("/api/auth/logout");
    queryClient.setQueryData(ME_KEY, null);
    queryClient.clear();
    router.replace("/login");
  }

  if (route === "denied") {
    return (
      <div className="mx-auto max-w-lg px-4 py-24">
        <EmptyState
          title={t("denied.title")}
          description={me.data?.platform_role ? t("denied.staff_body") : t("denied.body")}
          action={
            <Button variant="secondary" onClick={signOut}>
              {t("account.sign_out")}
            </Button>
          }
        />
      </div>
    );
  }
  if (route !== null || config.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label={t("app.loading")} />
      </div>
    );
  }
  if (config.isError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24">
        <Alert>{errorMessage(config.error)}</Alert>
      </div>
    );
  }

  const user = me.data as AuthState;
  const role = config.data.role as PortalRole;
  const several = user.memberships.filter((m) => m.status === "active").length > 1;
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 lg:block print:hidden">
        <Sidebar role={role} />
      </aside>
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div aria-hidden className="absolute inset-0 bg-slate-900/50" onClick={() => setMenuOpen(false)} />
          <aside className="relative h-full w-64">
            <Sidebar role={role} onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64 print:pl-0">
        <header className="sticky top-0 z-30 flex h-16 print:hidden items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6">
          <button
            type="button"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label={menuOpen ? t("nav.close_menu") : t("nav.open_menu")}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? icons.close : icons.menu}
          </button>
          <p className="hidden text-sm font-semibold text-ink sm:block">{config.data.tenant_name}</p>
          <div className="ml-auto flex items-center gap-4">
            {several && (
              <Button variant="ghost" onClick={() => router.push(`/select-agency?next=${encodeURIComponent(pathname)}`)}>
                {t("account.switch_agency")}
              </Button>
            )}
            <div className="text-right">
              <p className="text-sm font-medium text-ink">{user.full_name || user.email}</p>
              <p className="text-xs text-muted">
                {t(`role.${role}`)} · {user.email}
              </p>
            </div>
            <Button variant="ghost" onClick={signOut} aria-label={t("account.sign_out")}>
              {icons.signOut}
              <span className="hidden sm:inline">{t("account.sign_out")}</span>
            </Button>
          </div>
        </header>
        <div className="print:hidden">
          <Banners config={config.data} />
        </div>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          {canOpen(role, pathname) ? (
            children
          ) : (
            <EmptyState title={t("forbidden.title")} description={t("forbidden.body")} />
          )}
        </main>
      </div>
    </div>
  );
}

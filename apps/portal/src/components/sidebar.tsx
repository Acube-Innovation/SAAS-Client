"use client";

import { cn } from "@saas/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { t } from "@/i18n";
import { menuFor, type PortalRole } from "@/lib/menu";

import { Brand } from "./brand";
import { icons } from "./icons";

const ICONS: Record<string, React.ReactNode> = {
  home: icons.home,
  subscribers: icons.people,
  bookings: icons.calendar,
  deliveries: icons.truck,
  follow_up: icons.inbox,
  reports: icons.chart,
  messages: icons.whatsapp,
  areas: icons.map,
  communication_log: icons.phone,
  wallet: icons.wallet,
  users: icons.clients,
  reminder_settings: icons.bell,
  integrations: icons.plug,
  audit_log: icons.audit,
};

export function Sidebar({ role, onNavigate }: { role: PortalRole; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-slate-900 px-4 py-5">
      <div className="px-2">
        <Brand inverted />
      </div>
      <nav aria-label={t("nav.main")} className="mt-8 flex-1">
        <ul className="space-y-1">
          {menuFor(role).map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                    active ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/60 hover:text-white",
                  )}
                >
                  {ICONS[item.key]}
                  {t(`nav.${item.key}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

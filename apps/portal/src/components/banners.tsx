import { t } from "@/i18n";
import { formatDate } from "@/lib/format";
import type { PortalConfig } from "@/lib/types";

/** Read-only banners: suspended agency (every write returns 403) and platform support view. */
export function Banners({ config }: { config: PortalConfig }) {
  return (
    <>
      {config.tenant_status === "suspended" && (
        <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:px-6">
          <p className="font-semibold">{t("banner.suspended_title")}</p>
          <p>
            {t("banner.suspended_body", {
              date: formatDate(config.suspended_at),
              reason: config.suspension_reason || t("common.none"),
            })}
          </p>
        </div>
      )}
      {config.role === "support" && (
        <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-6">
          {t("banner.support")}
        </div>
      )}
    </>
  );
}

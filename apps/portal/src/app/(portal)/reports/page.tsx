import type { Metadata } from "next";
import { Suspense } from "react";

import { ReportsScreen } from "@/components/reports/reports-screen";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("nav.reports") };

export default function ReportsPage() {
  return (
    <Suspense>
      <ReportsScreen />
    </Suspense>
  );
}

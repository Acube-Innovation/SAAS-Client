import type { Metadata } from "next";
import { Suspense } from "react";

import { SetupWizard } from "@/components/setup/setup-wizard";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("setup.title") };

export default function SetupPage() {
  return (
    <Suspense>
      <SetupWizard />
    </Suspense>
  );
}

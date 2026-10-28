import type { Metadata } from "next";
import { Suspense } from "react";

import { CommunicationLog } from "@/components/log/communication-log";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("nav.communication_log") };

export default function CommunicationLogPage() {
  return (
    <Suspense>
      <CommunicationLog />
    </Suspense>
  );
}

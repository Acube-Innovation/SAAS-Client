import type { Metadata } from "next";
import { Suspense } from "react";

import { FollowUpQueue } from "@/components/follow-up/follow-up-queue";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("nav.follow_up") };

export default function FollowUpPage() {
  return (
    <Suspense>
      <FollowUpQueue />
    </Suspense>
  );
}

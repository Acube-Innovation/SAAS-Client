import type { Metadata } from "next";
import { Suspense } from "react";

import { SubscribersList } from "@/components/subscribers/subscribers-list";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("nav.subscribers") };

export default function SubscribersPage() {
  return (
    <Suspense>
      <SubscribersList />
    </Suspense>
  );
}

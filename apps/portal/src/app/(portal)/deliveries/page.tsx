import type { Metadata } from "next";
import { Suspense } from "react";

import { DeliveriesScreen } from "@/components/deliveries/deliveries-screen";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("nav.deliveries") };

export default function DeliveriesPage() {
  return (
    <Suspense>
      <DeliveriesScreen />
    </Suspense>
  );
}

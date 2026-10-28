import type { Metadata } from "next";
import { Suspense } from "react";

import { MessagesScreen } from "@/components/messages/messages-screen";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("nav.messages") };

export default function MessagesPage() {
  return (
    <Suspense>
      <MessagesScreen />
    </Suspense>
  );
}

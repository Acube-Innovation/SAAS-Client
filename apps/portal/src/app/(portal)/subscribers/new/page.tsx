"use client";

import { Spinner } from "@saas/ui";

import { SubscriberForm } from "@/components/subscribers/subscriber-form";
import { t } from "@/i18n";
import { usePortalConfig } from "@/lib/queries";

export default function NewSubscriberPage() {
  const config = usePortalConfig();
  if (!config.data) return <Spinner label={t("app.loading")} />;
  return <SubscriberForm />;
}

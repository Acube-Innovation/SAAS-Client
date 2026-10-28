"use client";

import { Alert, Spinner } from "@saas/ui";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

import { SubscriberForm } from "@/components/subscribers/subscriber-form";
import { errorMessage, t } from "@/i18n";
import { usePortalConfig, useSubscriber } from "@/lib/queries";

export default function SubscriberPage() {
  const { id } = useParams<{ id: string }>();
  const saved = useSearchParams().get("saved");
  const subscriber = useSubscriber(id);
  const config = usePortalConfig();
  if (subscriber.isError) return <Alert>{errorMessage(subscriber.error)}</Alert>;
  if (!subscriber.data || !config.data) return <Spinner label={t("app.loading")} />;
  return (
    <>
      <Link href="/subscribers" className="mb-4 inline-block text-sm text-brand-700 hover:underline">
        ← {t("nav.subscribers")}
      </Link>
      {saved && <Alert tone="success">{t("common.saved")}</Alert>}
      <SubscriberForm key={subscriber.data.updated_at} subscriber={subscriber.data} />
    </>
  );
}

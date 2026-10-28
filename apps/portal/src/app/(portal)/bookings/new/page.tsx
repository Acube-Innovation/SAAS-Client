"use client";

import { Spinner } from "@saas/ui";
import Link from "next/link";

import { BookingForm } from "@/components/bookings/booking-form";
import { PageHeader } from "@/components/page-header";
import { t } from "@/i18n";
import { usePortalConfig } from "@/lib/queries";

export default function NewBookingPage() {
  const config = usePortalConfig();
  if (!config.data) return <Spinner label={t("app.loading")} />;
  return (
    <>
      <Link href="/bookings" className="mb-4 inline-block text-sm text-brand-700 hover:underline">← {t("nav.bookings")}</Link>
      <PageHeader title={t("bookings.add")} description={t("bookings.add_intro")} />
      <BookingForm />
    </>
  );
}

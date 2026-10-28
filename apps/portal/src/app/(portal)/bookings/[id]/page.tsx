"use client";

import { Alert, Spinner } from "@saas/ui";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

import { BookingDetail } from "@/components/bookings/booking-detail";
import { errorMessage, t } from "@/i18n";
import { useBooking, usePortalConfig } from "@/lib/queries";

export default function BookingPage() {
  const { id } = useParams<{ id: string }>();
  const saved = useSearchParams().get("saved");
  const booking = useBooking(id);
  const config = usePortalConfig();
  if (booking.isError) return <Alert>{errorMessage(booking.error)}</Alert>;
  if (!booking.data || !config.data) return <Spinner label={t("app.loading")} />;
  return (
    <>
      <Link href="/bookings" className="mb-4 inline-block text-sm text-brand-700 hover:underline">← {t("nav.bookings")}</Link>
      {saved && <Alert tone="success">{t("common.saved")}</Alert>}
      <BookingDetail booking={booking.data} />
    </>
  );
}

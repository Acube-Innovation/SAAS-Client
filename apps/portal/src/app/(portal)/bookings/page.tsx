import type { Metadata } from "next";
import { Suspense } from "react";

import { BookingsList } from "@/components/bookings/bookings-list";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("nav.bookings") };

export default function BookingsPage() {
  return (
    <Suspense>
      <BookingsList />
    </Suspense>
  );
}

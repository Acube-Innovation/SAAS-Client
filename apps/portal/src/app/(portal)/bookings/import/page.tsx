import type { Metadata } from "next";
import Link from "next/link";

import { ImportWizard } from "@/components/imports/import-wizard";
import { PageHeader } from "@/components/page-header";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("import.title.bookings") };

export default function ImportBookingsPage() {
  return (
    <>
      <Link href="/bookings" className="mb-4 inline-block text-sm text-brand-700 hover:underline">← {t("nav.bookings")}</Link>
      <PageHeader title={t("import.title.bookings")} description={t("import.intro")} />
      <ImportWizard entity="bookings" />
    </>
  );
}

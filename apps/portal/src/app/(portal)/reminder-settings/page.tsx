import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { ReminderSettingsForm } from "@/components/settings/reminder-settings-form";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("nav.reminder_settings") };

export default function ReminderSettingsPage() {
  return (
    <>
      <PageHeader title={t("nav.reminder_settings")} description={t("settings.description")} />
      <ReminderSettingsForm />
    </>
  );
}

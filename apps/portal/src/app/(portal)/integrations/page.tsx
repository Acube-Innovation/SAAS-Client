import type { Metadata } from "next";

import { IntegrationsScreen } from "@/components/integrations/integrations-screen";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("nav.integrations") };

export default function IntegrationsPage() {
  return <IntegrationsScreen />;
}

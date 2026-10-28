import type { Metadata } from "next";

import { AreasScreen } from "@/components/areas/areas-screen";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("nav.areas") };

export default function AreasPage() {
  return <AreasScreen />;
}

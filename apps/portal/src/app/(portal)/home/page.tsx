import type { Metadata } from "next";

import { HomeScreen } from "@/components/home/home";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("home.title") };

export default function HomePage() {
  return <HomeScreen />;
}

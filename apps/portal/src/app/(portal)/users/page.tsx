import type { Metadata } from "next";

import { UsersScreen } from "@/components/users/users-screen";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("nav.users") };

export default function UsersPage() {
  return <UsersScreen />;
}

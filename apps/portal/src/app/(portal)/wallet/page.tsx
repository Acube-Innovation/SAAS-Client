import type { Metadata } from "next";
import { Suspense } from "react";

import { WalletScreen } from "@/components/wallet/wallet-screen";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t("nav.wallet") };

export default function WalletPage() {
  return (
    <Suspense>
      <WalletScreen />
    </Suspense>
  );
}

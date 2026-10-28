import { EmptyState } from "@saas/ui";
import { notFound } from "next/navigation";

import { t } from "@/i18n";
import { SECTIONS } from "@/lib/menu";

/** Screens from later build steps: listed in the menu (by role) with a placeholder until built. */
export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const match = SECTIONS.find((s) => s.href === `/${section}`);
  if (!match) notFound();
  return (
    <>
      <h1 className="mb-6 text-xl font-semibold tracking-tight text-ink">{t(`nav.${match.key}`)}</h1>
      <EmptyState title={t("page.coming_title")} description={t("page.coming_body")} />
    </>
  );
}

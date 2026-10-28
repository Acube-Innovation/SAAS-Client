import { cn } from "@saas/ui";

import { t } from "@/i18n";

type Content = {
  header_text?: string;
  body: string;
  footer?: string;
  buttons: { text: string; outcome: string }[];
  sample_values: unknown;
};

const VARIABLE = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;

/** Template text with each {{variable}} replaced by its sample value, marked so clients can see it varies. */
export function FilledText({ text, samples }: { text: string; samples: Record<string, unknown> }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(VARIABLE)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    const key = match[1] ?? "";
    const value = samples[key];
    parts.push(
      <mark key={`${key}-${index}`} data-variable={key} title={`{{${key}}}`} className="rounded bg-emerald-100 px-0.5 text-inherit">
        {value === undefined || value === "" ? `{{${key}}}` : String(value)}
      </mark>,
    );
    last = index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** A WhatsApp-style phone preview of a template version with sample values (spec 2.6). */
export function PhonePreview({ content, agencyName, className }: { content: Content; agencyName: string; className?: string }) {
  const samples = { agency_name: agencyName, ...(content.sample_values as Record<string, unknown>) };
  return (
    <figure
      aria-label={t("messages.preview")}
      className={cn("w-full max-w-[20rem] overflow-hidden rounded-[2rem] border-[6px] border-slate-800 bg-slate-800 shadow-lg", className)}
    >
      <div className="flex items-center gap-2 bg-[#075e54] px-4 py-3 text-white">
        <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">
          {agencyName.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{agencyName}</span>
          <span className="block text-[11px] text-white/80">{t("messages.business_account")}</span>
        </span>
      </div>
      <div className="min-h-[18rem] space-y-1.5 bg-[#efeae2] p-3">
        <div className="max-w-[92%] rounded-lg rounded-tl-none bg-white px-3 py-2 text-[13px] leading-snug text-slate-900 shadow-sm">
          {content.header_text && (
            <p className="mb-1 font-semibold" data-part="header">
              <FilledText text={content.header_text} samples={samples} />
            </p>
          )}
          <p className="whitespace-pre-line" data-part="body">
            <FilledText text={content.body} samples={samples} />
          </p>
          {content.footer && (
            <p className="mt-1 text-[11px] text-slate-500" data-part="footer">
              {content.footer}
            </p>
          )}
          <p className="mt-0.5 text-right text-[10px] text-slate-400">10:00</p>
        </div>
        {content.buttons.length > 0 && (
          <ul className="max-w-[92%] space-y-1" aria-label={t("messages.buttons")}>
            {content.buttons.map((button) => (
              <li key={button.text} className="rounded-lg bg-white py-1.5 text-center text-[13px] font-medium text-[#027eb5] shadow-sm">
                {button.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </figure>
  );
}

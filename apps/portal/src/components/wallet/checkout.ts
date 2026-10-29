"use client";

import type { Checkout } from "@/lib/types";

/**
 * Opens the payment provider's own checkout. The browser never credits the wallet: whatever the
 * checkout reports, the screen waits for the server, which credits only from the signed webhook.
 */
const SCRIPTS = {
  razorpay: "https://checkout.razorpay.com/v1/checkout.js",
  cashfree: "https://sdk.cashfree.com/js/v3/cashfree.js",
} as const;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(script);
  });
}

type ProviderWindow = Window & {
  Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: () => void) => void };
  Cashfree?: (options: { mode: string }) => {
    checkout: (options: Record<string, unknown>) => Promise<unknown>;
    subscriptionsCheckout?: (options: Record<string, unknown>) => Promise<unknown>;
  };
};

/** Resolves when the provider's window closes (paid or not); the caller then polls the server. */
export async function openProviderCheckout(checkout: Checkout, description: string): Promise<void> {
  const data = checkout.data as Record<string, unknown>;
  const w = window as ProviderWindow;
  if (checkout.provider === "razorpay") {
    await loadScript(SCRIPTS.razorpay);
    await new Promise<void>((resolve) => {
      const rzp = new w.Razorpay!({
        key: data.key_id,
        order_id: data.order_id,
        amount: data.amount,
        currency: data.currency,
        name: data.name,
        description,
        prefill: data.prefill,
        ...(data.recurring ? { customer_id: data.customer_id, recurring: data.recurring } : {}),
        handler: () => resolve(),
        modal: { ondismiss: () => resolve() },
      });
      rzp.on("payment.failed", () => resolve());
      rzp.open();
    });
    return;
  }
  if (checkout.provider === "cashfree") {
    await loadScript(SCRIPTS.cashfree);
    const cashfree = w.Cashfree!({ mode: String(data.mode ?? "sandbox") });
    if (data.subscription_session_id && cashfree.subscriptionsCheckout) {
      await cashfree.subscriptionsCheckout({ subsSessionId: data.subscription_session_id, redirectTarget: "_modal" });
    } else {
      await cashfree.checkout({ paymentSessionId: data.payment_session_id, redirectTarget: "_modal" });
    }
  }
}

/** Poll `check` every `everyMs` until it returns true or the time runs out. */
export async function waitFor(check: () => Promise<boolean>, { everyMs = 2000, timeoutMs = 120_000 } = {}): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return false;
}

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockApi, navigation, portalConfig, renderWithQuery } from "@/test/utils";

import { WalletScreen } from "./wallet/wallet-screen";

beforeEach(() => {
  navigation.pathname = "/wallet";
  navigation.search = new URLSearchParams();
});

const wallet = (overrides = {}) => ({
  balance_paise: 640_235, low_balance_level_paise: 100_000, is_low: false, can_send: true, paused_at: null, held_reminders: 0,
  prices: [{ channel: "whatsapp_utility", price_paise: 85 }, { channel: "whatsapp_service", price_paise: 35 }, { channel: "voice_minute", price_paise: 150 }],
  ...overrides,
});
const order = (overrides = {}) => ({
  id: "o1", provider: "stub", credit_paise: 200_000, gst_paise: 36_000, total_paise: 236_000, status: "created", failure_reason: "",
  created_at: "2026-10-29T06:00:00Z", paid_at: null, ...overrides,
});
const mandate = (overrides = {}) => ({
  id: "m1", provider: "stub", method: "upi", status: "active", credit_paise: 200_000, gst_paise: 36_000, charge_in_progress: false,
  last_charged_at: null, last_failure: "", activated_at: "2026-10-29T06:00:00Z", created_at: "2026-10-29T06:00:00Z", ...overrides,
});
const autoTopUp = (m: unknown = null) => ({ mandate: m, min_credit_paise: 100_000, max_credit_paise: 1_500_000, low_balance_level_paise: 100_000 });

describe("Wallet", () => {
  it("tops up through the sandbox, sending the confirmation twice, and waits for the server", async () => {
    const calls = mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig({ role: "owner" }) },
      { method: "GET", path: "/api/portal/wallet", body: wallet() },
      { method: "GET", path: "/api/portal/auto-top-up", body: autoTopUp() },
      { method: "GET", path: "/api/auth/csrf", status: 204 },
      { method: "POST", path: "/api/portal/top-ups", status: 201, body: { order: order(), checkout: { provider: "stub", data: { order_id: "stub_order_1" } } } },
      { method: "POST", path: "/api/portal/dev/payments/simulate", body: { outcomes: ["credited", "duplicate"] } },
      { method: "GET", path: "/api/portal/top-ups/o1", body: order({ status: "paid", paid_at: "2026-10-29T06:01:00Z" }) },
    ]);
    renderWithQuery(<WalletScreen />);
    expect(await screen.findByTestId("wallet-balance")).toHaveTextContent("₹6,402.35");
    const topUp = screen.getByRole("region", { name: "Top up" });
    expect(await within(topUp).findByRole("button", { name: "₹2,000" })).toHaveAttribute("aria-pressed", "true");
    expect(topUp).toHaveTextContent("GST 18%₹360.00");
    expect(topUp).toHaveTextContent("You pay₹2,360.00");
    await userEvent.click(within(topUp).getByRole("button", { name: "Pay and top up" }));
    const dialog = await screen.findByRole("dialog", { name: "Sandbox payment" });
    expect(dialog).toHaveTextContent("no real money");
    await userEvent.click(within(dialog).getByRole("checkbox"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Pay ₹2,360.00" }));
    expect(await screen.findByText("Payment received: ₹2,000.00 added to the wallet. The invoice is under Invoices.")).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/api/portal/top-ups")?.body).toEqual({ credit_paise: 200_000 });
    expect(calls.find((c) => c.path.endsWith("/simulate"))?.body).toEqual({ target: "order", id: "o1", outcome: "success", times: 2 });
  });

  it("checks the amount before calling the API", async () => {
    mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig({ role: "owner" }) },
      { method: "GET", path: "/api/portal/wallet", body: wallet() },
      { method: "GET", path: "/api/portal/auto-top-up", body: autoTopUp() },
    ]);
    renderWithQuery(<WalletScreen />);
    const topUp = await screen.findByRole("region", { name: "Top up" });
    const input = await within(topUp).findByLabelText(/Credit to add/);
    await userEvent.clear(input);
    await userEvent.type(input, "999");
    expect(within(topUp).getByText("Enter a whole amount from ₹1,000 to ₹5,00,000.")).toBeInTheDocument();
    expect(within(topUp).getByRole("button", { name: "Pay and top up" })).toBeDisabled();
  });

  it("managers see the wallet but can't pay or change auto top-up", async () => {
    mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig({ role: "manager" }) },
      { method: "GET", path: "/api/portal/wallet", body: wallet({ is_low: true, held_reminders: 0 }) },
      { method: "GET", path: "/api/portal/auto-top-up", body: autoTopUp(mandate()) },
    ]);
    renderWithQuery(<WalletScreen />);
    expect(await screen.findByText("Only the owner can top up.")).toBeInTheDocument();
    expect(screen.getByText("Low balance")).toBeInTheDocument();
    const auto = await screen.findByRole("region", { name: "Auto top-up" });
    expect(auto).toHaveTextContent("UPI AutoPay · Sandbox");
    expect(within(auto).queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows sending paused and held reminders", async () => {
    mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig({ role: "owner" }) },
      { method: "GET", path: "/api/portal/wallet", body: wallet({ balance_paise: 40, can_send: false, is_low: true, held_reminders: 12 }) },
      { method: "GET", path: "/api/portal/auto-top-up", body: autoTopUp() },
    ]);
    renderWithQuery(<WalletScreen />);
    expect(await screen.findByText("Sending paused")).toBeInTheDocument();
    expect(screen.getByText("12 reminders are held until the wallet is topped up.")).toBeInTheDocument();
  });

  it("sets up auto top-up and authorises it in the sandbox", async () => {
    const calls = mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig({ role: "owner" }) },
      { method: "GET", path: "/api/portal/wallet", body: wallet() },
      { method: "GET", path: "/api/portal/auto-top-up", body: autoTopUp() },
      { method: "GET", path: "/api/auth/csrf", status: 204 },
      { method: "POST", path: "/api/portal/auto-top-up", status: 201, body: { mandate: mandate({ status: "pending" }), checkout: { provider: "stub", data: {} } } },
      { method: "POST", path: "/api/portal/dev/payments/simulate", body: { outcomes: ["mandate_active"] } },
    ]);
    renderWithQuery(<WalletScreen />);
    const auto = await screen.findByRole("region", { name: "Auto top-up" });
    await userEvent.clear(within(auto).getByLabelText(/Credit per top-up/));
    await userEvent.type(within(auto).getByLabelText(/Credit per top-up/), "3000");
    await userEvent.selectOptions(within(auto).getByLabelText("Pay with"), "card");
    await userEvent.click(within(auto).getByRole("button", { name: "Set up auto top-up" }));
    const dialog = await screen.findByRole("dialog", { name: "Sandbox mandate authorisation" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Approve mandate" }));
    expect(await screen.findByText("Auto top-up is active.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST" && c.path === "/api/portal/auto-top-up")?.body).toEqual({ credit_paise: 300_000, method: "card" });
    expect(calls.find((c) => c.path.endsWith("/simulate"))?.body).toEqual({ target: "mandate", id: "m1", outcome: "success", times: 1 });
  });

  it("pauses and cancels auto top-up", async () => {
    const calls = mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig({ role: "owner" }) },
      { method: "GET", path: "/api/portal/wallet", body: wallet() },
      { method: "GET", path: "/api/portal/auto-top-up", body: autoTopUp(mandate({ last_failure: "Insufficient funds" })) },
      { method: "GET", path: "/api/auth/csrf", status: 204 },
      { method: "POST", path: "/api/portal/auto-top-up/pause", body: mandate({ status: "paused" }) },
      { method: "POST", path: "/api/portal/auto-top-up/cancel", body: mandate({ status: "cancelled" }) },
    ]);
    renderWithQuery(<WalletScreen />);
    const auto = await screen.findByRole("region", { name: "Auto top-up" });
    expect(auto).toHaveTextContent("₹2,000.00+ ₹360.00 GST");
    expect(auto).toHaveTextContent("Insufficient funds");
    await userEvent.click(within(auto).getByRole("button", { name: "Pause" }));
    expect(await within(auto).findByText("Auto top-up paused. Nothing is debited until you resume it.")).toBeInTheDocument();
    await userEvent.click(within(auto).getByRole("button", { name: "Cancel auto top-up" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel auto top-up?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel auto top-up" }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/cancel"))).toBe(true));
  });
});

describe("Transactions, invoices and plan", () => {
  it("lists transactions with signed amounts", async () => {
    navigation.search = new URLSearchParams("tab=transactions");
    mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig({ role: "manager" }) },
      {
        method: "GET", path: "/api/portal/wallet/transactions",
        body: { count: 2, next: null, previous: null, results: [
          { id: "t2", created_at: "2026-10-29T06:00:00Z", kind: "debit", reason: "send", amount_paise: 85, balance_after_paise: 199_915, channel: "whatsapp_utility", description: "WhatsApp for BK1", invoice_id: null, invoice_number: null },
          { id: "t1", created_at: "2026-10-29T05:00:00Z", kind: "credit", reason: "top_up", amount_paise: 200_000, balance_after_paise: 200_000, channel: "", description: "Top-up", invoice_id: "i1", invoice_number: "SC/2026-27/000007" },
        ] },
      },
    ]);
    renderWithQuery(<WalletScreen />);
    const debit = await waitFor(() => {
      const row = document.querySelector("tr[data-kind=debit]");
      expect(row).not.toBeNull();
      return row!;
    });
    expect(debit).toHaveTextContent("−₹0.85");
    expect(document.querySelector("tr[data-kind=credit]")).toHaveTextContent("+₹2,000.00");
    expect(screen.getByText("SC/2026-27/000007")).toBeInTheDocument();
  });

  it("downloads an invoice through a short-lived link", async () => {
    navigation.search = new URLSearchParams("tab=invoices");
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig({ role: "owner" }) },
      {
        method: "GET", path: "/api/portal/invoices",
        body: { count: 1, next: null, previous: null, results: [
          { id: "i1", number: "SC/2026-27/000007", financial_year: "2026-27", kind: "top_up", issued_at: "2026-10-29T05:00:00Z", taxable_paise: 200_000, cgst_paise: 18_000, sgst_paise: 18_000, igst_paise: 0, total_paise: 236_000, payment_reference: "stub:x" },
        ] },
      },
      { method: "GET", path: "/api/portal/invoices/i1/pdf", body: { url: "http://storage/inv.pdf?X-Amz-Expires=300", expires_in: 300 } },
    ]);
    renderWithQuery(<WalletScreen />);
    const row = await screen.findByText("SC/2026-27/000007");
    expect(row.closest("tr")).toHaveTextContent("₹360.00");
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(open).toHaveBeenCalledWith("http://storage/inv.pdf?X-Amz-Expires=300", "_blank", "noopener"));
    open.mockRestore();
  });

  it("requests a plan change from the plan tab", async () => {
    navigation.search = new URLSearchParams("tab=plan");
    const plan = (code: string, name: string, fee: number, max: number, features = {}) => ({
      code, name, monthly_fee_paise: fee, max_active_subscribers: max, is_placeholder: true,
      features: { voice_ai: false, public_api: false, staff_app: false, ...features },
    });
    const calls = mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig({ role: "owner" }) },
      {
        method: "GET", path: "/api/portal/plan",
        body: { plan: plan("starter", "Starter", 199_900, 1000), pending_plan: null, status: "active", current_period_start: "2026-10-29",
          next_billing_date: "2026-11-29", active_subscribers: 588,
          plans: [plan("starter", "Starter", 199_900, 1000), plan("growth", "Growth", 499_900, 5000, { public_api: true })] },
      },
      { method: "GET", path: "/api/auth/csrf", status: 204 },
      { method: "POST", path: "/api/portal/plan/request-change", status: 201, body: { id: "cr9" } },
    ]);
    renderWithQuery(<WalletScreen />);
    const current = await screen.findByRole("region", { name: "Your plan" });
    expect(current).toHaveTextContent("588 / 1,000");
    expect(current).toHaveTextContent("Next billing date: 29 Nov 2026");
    expect(current).toHaveTextContent("placeholders");
    const growth = screen.getByRole("region", { name: "Growth" });
    expect(growth).toHaveTextContent("✓ Public API");
    await userEvent.click(within(growth).getByRole("button", { name: "Request this plan" }));
    const dialog = await screen.findByRole("dialog", { name: "Request Growth" });
    await userEvent.type(within(dialog).getByLabelText(/Note/), "We need the API");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
    expect(await screen.findByRole("link", { name: "Follow it under Change requests" })).toHaveAttribute("href", "/messages/requests/cr9");
    expect(calls.find((c) => c.path.endsWith("request-change"))?.body).toEqual({ plan_code: "growth", note: "We need the API" });
  });
});

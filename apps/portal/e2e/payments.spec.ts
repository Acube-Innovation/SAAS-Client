import fs from "node:fs";

import { expect, type Page, test } from "@playwright/test";

import { AUTH_DIR, authFile, manage } from "./support";

/**
 * Step 21: top-up and auto top-up through the sandbox payment simulator. The simulator sends the
 * same signed webhook a provider would, and can send it twice: the wallet must be credited once.
 */
const agency = () => fs.readFileSync(`${AUTH_DIR}/agency.txt`, "utf8").trim();

async function walletState(page: Page) {
  const wallet = await (await page.request.get("/api/portal/wallet")).json();
  const txns = await (await page.request.get("/api/portal/wallet/transactions?kind=credit")).json();
  return { balance: wallet.balance_paise as number, credits: txns.count as number };
}

const rupees = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(paise / 100);

test.describe.configure({ mode: "serial" });

test.describe("Wallet and billing (owner)", () => {
  test.use({ storageState: authFile("owner") });

  test("a sandbox top-up whose webhook arrives twice credits the wallet once, with a GST invoice", async ({ page }) => {
    const before = await walletState(page);
    await page.goto("/wallet");
    const topUp = page.getByRole("region", { name: "Top up" });
    await topUp.getByRole("button", { name: "₹5,000" }).click();
    await expect(topUp).toContainText("You pay₹5,900.00");
    await topUp.getByRole("button", { name: "Pay and top up" }).click();
    const sandbox = page.getByRole("dialog", { name: "Sandbox payment" });
    await expect(sandbox).toContainText("₹5,900.00");
    await sandbox.getByRole("checkbox", { name: /twice/ }).check();
    await sandbox.getByRole("button", { name: "Pay ₹5,900.00" }).click();
    await expect(page.getByText("Payment received: ₹5,000.00 added to the wallet.")).toBeVisible();

    const after = await walletState(page);
    expect(after.balance - before.balance).toBe(500_000);
    expect(after.credits - before.credits).toBe(1);
    await expect(page.getByTestId("wallet-balance")).toHaveText(rupees(after.balance));

    await page.getByRole("link", { name: "Invoices" }).click();
    const invoice = page.locator("tr[data-invoice]").first();
    await expect(invoice).toContainText("Wallet top-up");
    await expect(invoice).toContainText("₹5,900.00");
    const popup = page.waitForEvent("popup");
    await invoice.getByRole("button", { name: "Download PDF" }).click();
    expect((await popup).url()).toContain("X-Amz-Expires=300");
  });

  test("auto top-up: authorise, then a low balance starts a debit that credits once", async ({ page }) => {
    await page.goto("/wallet");
    const auto = page.getByRole("region", { name: "Auto top-up" });
    await auto.getByLabel(/Credit per top-up/).fill("3000");
    await auto.getByRole("button", { name: "Set up auto top-up" }).click();
    await page.getByRole("dialog", { name: "Sandbox mandate authorisation" }).getByRole("button", { name: "Approve mandate" }).click();
    await expect(auto.getByText("Auto top-up is active.")).toBeVisible();
    await expect(auto).toHaveAttribute("data-mandate", "active");

    // Spend the wallet down to ₹500 (below the ₹1,000 level): the worker starts the mandate debit.
    manage(
      "shell",
      [
        "from apps.billing import services",
        "from apps.core.models import Tenant",
        `t = Tenant.objects.get(name=${JSON.stringify(agency())})`,
        "services.debit(t, services.wallet_for(t).balance_paise - 50_000, reference='e2e:spend')",
      ].join("\n"),
    );
    const before = await walletState(page);
    expect(before.balance).toBe(50_000);
    await expect
      .poll(async () => (await (await page.request.get("/api/portal/auto-top-up")).json()).mandate.charge_in_progress, { timeout: 30_000 })
      .toBe(true);

    // The provider confirms the debit twice; the wallet is credited once.
    const mandate = (await (await page.request.get("/api/portal/auto-top-up")).json()).mandate;
    const csrf = (await page.context().cookies()).find((c) => c.name === "csrftoken")?.value ?? "";
    const simulated = await page.request.post("/api/portal/dev/payments/simulate", {
      headers: { "X-CSRFToken": csrf },
      data: { target: "charge", id: mandate.id, times: 2 },
    });
    expect((await simulated.json()).outcomes).toEqual(["credited", "duplicate"]);
    const after = await walletState(page);
    expect(after.balance).toBe(50_000 + 300_000);
    expect(after.credits - before.credits).toBe(1);

    await page.reload();
    await expect(auto).toContainText("Last auto top-up");
    await page.getByRole("link", { name: "Transactions" }).click();
    await expect(page.locator("tr[data-kind=credit]").first()).toContainText("Auto top-up");

    // Pause, resume and cancel.
    await page.getByRole("link", { name: "Wallet", exact: true }).click();
    await auto.getByRole("button", { name: "Pause" }).click();
    await expect(auto).toHaveAttribute("data-mandate", "paused");
    await auto.getByRole("button", { name: "Resume" }).click();
    await expect(auto).toHaveAttribute("data-mandate", "active");
    await auto.getByRole("button", { name: "Cancel auto top-up" }).click();
    await page.getByRole("dialog", { name: "Cancel auto top-up?" }).getByRole("button", { name: "Cancel auto top-up" }).click();
    await expect(auto).toHaveAttribute("data-mandate", "none");
  });

  test("forged webhooks are refused", async ({ page }) => {
    const response = await page.request.post("/api/payments/webhooks/stub", {
      headers: { "X-Stub-Signature": "forged", "Content-Type": "application/json" },
      data: { id: "evt_forged", kind: "payment_succeeded", notes: {}, amount: 1 },
    });
    expect(response.status()).toBe(400);
  });
});

test.describe("Wallet and billing (manager)", () => {
  test.use({ storageState: authFile("manager") });

  test("managers view the wallet and plan but can't pay", async ({ page }) => {
    await page.goto("/wallet");
    await expect(page.getByText("Only the owner can top up.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pay and top up" })).toHaveCount(0);
    await page.getByRole("link", { name: "Plan" }).click();
    await expect(page.getByRole("region", { name: "Your plan" })).toContainText("Starter (placeholder)");
    await expect(page.getByRole("button", { name: "Request this plan" })).toHaveCount(0);
  });
});

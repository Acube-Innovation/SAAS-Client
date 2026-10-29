import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { expect, test } from "@playwright/test";

import { authFile } from "./support";

/**
 * Step 22: a test client (an HTTP server on this machine) receives our signed webhooks and verifies
 * them with its own code; an API key revoked in the portal is rejected on the very next request.
 * The worker reaches this machine as host.docker.internal (see docker-compose.yml); override with
 * E2E_WEBHOOK_HOST.
 */
type Received = { headers: http.IncomingHttpHeaders; body: Buffer };

function startReceiver(): Promise<{ url: string; received: Received[]; close: () => void }> {
  const received: Received[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      received.push({ headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(204).end();
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "0.0.0.0", () => {
      const port = (server.address() as AddressInfo).port;
      const host = process.env.E2E_WEBHOOK_HOST ?? "host.docker.internal";
      resolve({ url: `http://${host}:${port}/hooks`, received, close: () => server.close() });
    }),
  );
}

/** The client's own verification, written from the documented scheme. */
function verify(secret: string, raw: Buffer, header: string) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.`).update(raw).digest("hex");
  return Math.abs(Date.now() / 1000 - Number(parts.t)) < 300 && expected === parts.v1;
}

test.use({ storageState: authFile("owner") });

test("a test client receives signed webhooks and verifies them", async ({ page }) => {
  const receiver = await startReceiver();
  try {
    await page.goto("/integrations");
    const hooks = page.getByRole("region", { name: "Webhooks" });
    await hooks.getByLabel("Endpoint URL").fill(receiver.url);
    await hooks.getByRole("checkbox", { name: /Booking created/ }).check();
    await hooks.getByRole("button", { name: "Add endpoint" }).click();
    await expect(hooks.getByText(/Endpoint added/)).toBeVisible();
    const card = hooks.locator(`[data-endpoint="${receiver.url}"]`);
    await card.getByRole("button", { name: "Reveal" }).click();
    const secret = (await card.getByTestId("webhook-secret").textContent())!.trim();
    expect(secret).toMatch(/^whsec_/);

    await card.getByRole("button", { name: "Send test event" }).click();
    await expect.poll(() => receiver.received.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
    const test = receiver.received[0]!;
    expect(test.headers["x-sc-event"]).toBe("test");
    expect(verify(secret, test.body, String(test.headers["x-sc-signature"]))).toBe(true);
    expect(verify("whsec_wrong", test.body, String(test.headers["x-sc-signature"]))).toBe(false);

    // A real event: a booking created in the portal.
    const csrf = (await page.context().cookies()).find((c) => c.name === "csrftoken")?.value ?? "";
    const subscribers = await (await page.request.get("/api/portal/subscribers?page_size=1")).json();
    const created = await page.request.post("/api/portal/bookings", {
      headers: { "X-CSRFToken": csrf },
      data: {
        subscriber: subscribers.results[0].id,
        booking_reference: `BK-HOOK-${Date.now()}`,
        booking_date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
        custom_fields: { cylinder_type: "14.2 kg domestic", quantity: 1 },
      },
    });
    expect(created.status()).toBe(201);
    const reference = (await created.json()).booking_reference;
    await expect
      .poll(() => receiver.received.find((r) => r.headers["x-sc-event"] === "booking.created"), { timeout: 30_000 })
      .toBeTruthy();
    const event = receiver.received.find((r) => r.headers["x-sc-event"] === "booking.created")!;
    expect(verify(secret, event.body, String(event.headers["x-sc-signature"]))).toBe(true);
    expect(JSON.parse(event.body.toString()).data.booking_reference).toBe(reference);

    await page.reload();
    const log = page.getByRole("region", { name: "Delivery log" });
    await expect(log.locator("tr[data-delivery=test][data-status=succeeded]").first()).toBeVisible();
    await expect(log.locator("tr[data-delivery='booking.created'][data-status=succeeded]").first()).toBeVisible();

    // Leave the shared agency tidy for later runs.
    await page.getByRole("region", { name: "Webhooks" }).locator(`[data-endpoint="${receiver.url}"]`).getByRole("button", { name: "Pause" }).click();
  } finally {
    receiver.close();
  }
});

test("an API key works on the public API and is rejected as soon as it's revoked", async ({ page }) => {
  await page.goto("/integrations");
  const section = page.getByRole("region", { name: "API keys" });
  const name = `E2E key ${Date.now()}`;
  await section.getByLabel("Key name").fill(name);
  await section.getByRole("button", { name: "Create key" }).click();
  const dialog = page.getByRole("dialog", { name: `API key "${name}" created` });
  const raw = (await dialog.getByTestId("new-api-key").textContent())!.trim();
  await dialog.getByRole("button", { name: "I've copied it" }).click();

  const call = () => page.context().request.get("/api/v1/subscribers", { headers: { Authorization: `Bearer ${raw}` } });
  const ok = await call();
  expect(ok.status()).toBe(200);
  expect((await ok.json()).count).toBeGreaterThan(0);

  await section.locator(`tr[data-key="${name}"]`).getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("dialog", { name: `Revoke "${name}"?` }).getByRole("button", { name: "Revoke" }).click();
  await expect(section.locator(`tr[data-key="${name}"]`)).toHaveAttribute("data-revoked", "true");
  const refused = await call();
  expect(refused.status()).toBe(401);
  expect((await refused.json()).code).toBe("invalid_api_key");
});

test.describe("other roles", () => {
  test.use({ storageState: authFile("manager") });

  test("managers have no Integrations screen", async ({ page }) => {
    await page.goto("/home");
    await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Integrations" })).toHaveCount(0);
    expect((await page.request.get("/api/portal/integrations/api-keys")).status()).toBe(403);
  });
});

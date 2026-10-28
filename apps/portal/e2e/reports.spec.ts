import fs from "node:fs";

import { expect, test } from "@playwright/test";

import { apiAs, authFile, manage, staffAuthFile } from "./support";

/** Step 19: Communication log (spec 2.8) and Reports (2.5) on the seeded agency. */
test.describe("Communication log", () => {
  test.use({ storageState: authFile("manager") });

  test("a call recording plays through a 5-minute link, and each play is audited", async ({ page, baseURL }) => {
    await page.goto("/communication-log?channel=voice&has_recording=true");
    const first = page.locator("li[data-channel=voice]").first();
    await first.getByText("Transcript").click();
    await expect(first.getByText(/^Agent:/)).toBeVisible();

    const linkResponse = page.waitForResponse((r) => r.url().includes("/recording") && r.request().method() === "GET");
    await first.getByRole("button", { name: "Play recording" }).click();
    const link = await (await linkResponse).json();
    expect(link.expires_in).toBe(300);
    expect(link.url).toContain("X-Amz-Expires=300");
    await expect(first.getByLabel("Call recording")).toHaveAttribute("src", link.url);
    await expect(first.getByText(/Secure link, expires in \d+ s/)).toBeVisible();

    // The link really serves the audio.
    const audio = await page.request.get(link.url);
    expect(audio.status()).toBe(200);
    expect((await audio.body()).subarray(0, 4).toString()).toBe("RIFF");

    // Platform staff see the play in the audit log.
    const admin = await apiAs(baseURL!, staffAuthFile("super_admin"));
    const config = await (await page.request.get("/api/portal/config")).json();
    const audit = await admin.get(`/api/admin/audit-logs?tenant=${config.tenant_id}&action=recording_played`);
    expect(audit.count).toBeGreaterThanOrEqual(1);
    expect(audit.results[0].after.expires_in).toBe(300);
  });

  test("presigned links stop working when they expire (checked with a 2-second link)", async ({ page }) => {
    await page.goto("/communication-log?channel=voice&has_recording=true");
    const linkResponse = page.waitForResponse((r) => r.url().includes("/recording"));
    await page.locator("li[data-channel=voice]").first().getByRole("button", { name: "Play recording" }).click();
    const { url } = await (await linkResponse).json();
    // The object key is the path after the bucket name.
    const key = decodeURIComponent(new URL(url).pathname.split("/").slice(2).join("/"));
    expect(key).toMatch(/^recordings\/[0-9a-f-]+\/[0-9a-f-]+\.wav$/);

    const short = manage(
      `shell -c "from apps.core.storage import signed_url; print(signed_url('${key}', expires=2))"`,
    ).trim().split("\n").pop()!;
    expect((await page.request.get(short)).status()).toBe(200);
    await page.waitForTimeout(3500);
    expect((await page.request.get(short)).status()).toBe(403);
  });
});

test.describe("Reports", () => {
  test.use({ storageState: authFile("manager") });

  test("totals match the API for the seeded agency, and the CSV matches the screen", async ({ page }) => {
    await page.goto("/reports");
    const data = await (await page.request.get("/api/portal/reports/reminder-results")).json();
    expect(data.sent).toBeGreaterThan(0);
    const tile = (label: string) => page.locator(`[data-testid=report-tile][data-label="${label}"]`);
    await expect(tile("Messages sent")).toContainText(data.sent.toLocaleString("en-IN"));
    await expect(tile("Replied")).toContainText(data.replied.toLocaleString("en-IN"));
    const confirmed = data.outcomes.find((o: { outcome: string }) => o.outcome === "confirmed");
    await expect(page.locator("tr[data-outcome=confirmed]")).toContainText(`${confirmed.share}%`);
    expect(data.outcomes.reduce((sum: number, o: { count: number }) => sum + o.count, 0)).toBe(data.reminded);

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download CSV" }).click();
    const file = await (await download).path();
    const rows = fs.readFileSync(file, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/).map((l) => l.split(","));
    expect(rows[0]).toEqual(["metric", "count", "share_percent"]);
    expect(Number(rows.find((r) => r[0] === "sent")![1])).toBe(data.sent);

    await page.getByRole("link", { name: "Follow-up ageing" }).click();
    const ageing = await (await page.request.get("/api/portal/reports/follow-up-ageing")).json();
    await expect(page.locator('[data-testid=report-tile][data-label="Open items"]')).toContainText(String(ageing.total));
    await page.getByRole("link", { name: "Subscriber health" }).click();
    const health = await (await page.request.get("/api/portal/reports/subscriber-health")).json();
    await expect(page.locator('[data-testid=report-tile][data-label="No WhatsApp consent"]')).toContainText(String(health.no_consent));
  });
});

test.describe("Office staff", () => {
  test.use({ storageState: authFile("office_staff") });

  test("see the log and transcripts, but no recordings, reports or exports", async ({ page }) => {
    await page.goto("/communication-log?channel=voice&has_recording=true");
    await expect(page.getByText("Recordings: owner and managers only.").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Play recording" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Reports" })).toHaveCount(0);
    const attempt = await (await page.request.get("/api/portal/communication-log?channel=voice&has_recording=true")).json();
    const statuses = [
      (await page.request.get(`/api/portal/communication-log/${attempt.results[0].id}/recording`)).status(),
      (await page.request.get("/api/portal/reports/reminder-results")).status(),
      (await page.request.get("/api/portal/reports/message-log/export")).status(),
    ];
    expect(statuses).toEqual([403, 403, 403]);
  });
});


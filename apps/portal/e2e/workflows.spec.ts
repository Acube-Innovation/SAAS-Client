import fs from "node:fs";

import { expect, type Page, test } from "@playwright/test";

import { authFile } from "./support";

const ist = (days: number) => new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const TOMORROW = ist(1);

async function api(page: Page, path: string) {
  const response = await page.request.get(path);
  expect(response.ok()).toBe(true);
  return response.json();
}

test.describe("Workflow 3.1: booking to delivery (seeded outcomes)", () => {
  test.use({ storageState: authFile("manager") });

  test("bookings with no date get one in bulk; the timeline shows it", async ({ page }) => {
    await page.goto("/bookings?no_date=true");
    const table = page.getByRole("table", { name: "Bookings" });
    // Wait for real rows (each has a checkbox), not the loading row.
    await expect(table.getByRole("checkbox").first()).toBeVisible();
    const refs = (await table.locator("tbody tr td:nth-child(2)").allTextContents()).slice(0, 2);
    expect(refs).toHaveLength(2);
    const bar = page.getByRole("region", { name: "Set a date for the selected bookings" });
    for (const ref of refs) await page.getByLabel(`Select ${ref}`).check();
    await expect(bar).toContainText("2 selected");
    await bar.getByLabel("Delivery date").fill(ist(3));
    await bar.getByRole("button", { name: "Set date" }).click();
    await expect(page.getByRole("status").filter({ hasText: "2 bookings now deliver on" })).toBeVisible();
    await expect(table.getByText(refs[0]!)).toHaveCount(0); // no longer "No date yet"

    await page.goto(`/bookings?date=${ist(3)}&search=${refs[0]}`);
    await page.getByRole("button", { name: "Timeline" }).first().click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText(/Delivery date set/)).toBeVisible();
    await expect(drawer.locator("li").first()).toHaveAttribute("data-kind", "created");
  });

  test("deliveries: confirmed bookings by area, reassign, print, CSV, change after print flagged", async ({ page }) => {
    await page.addInitScript(() => {
      window.print = () => {};
    });
    const data = await api(page, `/api/portal/deliveries?date=${TOMORROW}`);
    expect(data.confirmed).toBeGreaterThan(0);
    await page.goto(`/deliveries?date=${TOMORROW}`);
    await expect(page.getByText(`Confirmed: ${data.confirmed}`)).toBeVisible();
    for (const area of data.areas) {
      const name = area.area_name ?? "No area";
      await expect(page.getByRole("region", { name }).locator("tbody tr")).toHaveCount(area.jobs.length);
    }

    // Reassign the first delivery to someone else.
    const job = data.areas[0].jobs[0];
    const select = page.getByLabel(`Delivery person for ${job.booking_reference}`);
    const other = await select.locator("option").evaluateAll(
      (options, current) => options.map((o) => (o as HTMLOptionElement).value).find((v) => v && v !== current),
      job.assigned_staff,
    );
    await select.selectOption(other!);
    await expect.poll(async () => {
      const fresh = await api(page, `/api/portal/deliveries?date=${TOMORROW}`);
      return fresh.areas.flatMap((a: { jobs: { id: string; assigned_staff: string }[] }) => a.jobs).find((j: { id: string }) => j.id === job.id)?.assigned_staff;
    }).toBe(other);

    // CSV has one row per delivery.
    const downloading = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download CSV" }).click();
    const csv = fs.readFileSync((await (await downloading).path())!, "utf8");
    expect(csv.trim().split("\n").length - 1).toBe(data.confirmed);

    // Print, then cancel one printed delivery: the office is warned.
    await page.getByRole("button", { name: "Print delivery list" }).click();
    await expect(page.getByText(/Last printed/)).toBeVisible();
    await page.goto(`/bookings/${job.booking_id}`);
    await page.getByRole("button", { name: "Cancel booking" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Reason/).fill("Customer cancelled by phone");
    await dialog.getByRole("button", { name: "Cancel booking" }).click();
    await expect(page.getByText(/Cancelled on/)).toBeVisible();
    await page.goto(`/deliveries?date=${TOMORROW}`);
    await expect(page.getByRole("alert").filter({ hasText: "Changed after the list was printed" })).toContainText(job.booking_reference);
  });
});

test.describe("Workflow 3.2: follow-up (seeded outcomes)", () => {
  test.use({ storageState: authFile("office_staff") });

  test("queue shows ageing; contacted stays open, a new date resolves and restarts, cancel and resolve close", async ({ page }) => {
    const queue = await api(page, "/api/portal/follow-ups");
    expect(queue.count).toBeGreaterThan(3);
    await page.goto("/follow-up");
    const items = page.getByRole("list", { name: "Follow-up queue" }).locator(":scope > li");
    await expect(items).toHaveCount(Math.min(queue.count, 50));
    const ageing = await items.evaluateAll((lis) => lis.map((li) => (li as HTMLElement).dataset.ageing));
    expect(ageing).toEqual(queue.results.map((r: { ageing: string }) => r.ageing));

    // Mark contacted: logged, stays in the queue.
    const first = items.first();
    const firstId = await first.getAttribute("data-item");
    await first.getByRole("button", { name: "Mark contacted" }).click();
    await page.getByRole("dialog").getByLabel("Note (optional)").fill("Called, will confirm tonight");
    await page.getByRole("dialog").getByRole("button", { name: "Mark contacted" }).click();
    const contacted = page.locator(`[data-item="${firstId}"]`);
    await expect(contacted.getByText("Contacted", { exact: true })).toBeVisible();
    await expect(contacted.getByText("Called, will confirm tonight")).toBeVisible();

    // Set a new date: the item leaves the queue; the booking restarts for that date.
    const second = items.nth(1);
    const secondId = await second.getAttribute("data-item");
    const secondRef = (await second.locator("a").first().textContent())!;
    await second.getByRole("button", { name: "Set new date" }).click();
    await page.getByRole("dialog").getByLabel(/New delivery date/).fill(ist(4));
    await page.getByRole("dialog").getByRole("button", { name: "Set date" }).click();
    await expect(page.getByRole("status").filter({ hasText: "reminder cycle restarts" })).toBeVisible();
    await expect(page.locator(`[data-item="${secondId}"]`)).toHaveCount(0);
    const moved = (await api(page, `/api/portal/bookings?search=${secondRef}`)).results[0];
    expect([moved.scheduled_date, moved.status, moved.outcome]).toEqual([ist(4), "booked", ""]);

    // Cancel a booking from the queue.
    const third = page.locator(`[data-item]:not([data-item="${firstId}"])`).first();
    const thirdRef = (await third.locator("a").first().textContent())!;
    await third.getByRole("button", { name: "Cancel booking" }).click();
    await page.getByRole("dialog").getByLabel(/Reason/).fill("Customer moved away");
    await page.getByRole("dialog").getByRole("button", { name: "Cancel booking" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Booking cancelled" })).toBeVisible();
    expect((await api(page, `/api/portal/bookings?search=${thirdRef}`)).results[0].status).toBe("cancelled");

    // Resolve with a note.
    await contacted.getByRole("button", { name: "Resolve" }).click();
    await page.getByRole("dialog").getByLabel("Note (optional)").fill("Confirmed by phone");
    await page.getByRole("dialog").getByRole("button", { name: "Resolve" }).click();
    await expect(page.locator(`[data-item="${firstId}"]`)).toHaveCount(0);
    await page.goto("/follow-up?status=resolved");
    await expect(page.locator(`[data-item="${firstId}"]`).getByText("Confirmed by phone")).toBeVisible();
  });
});

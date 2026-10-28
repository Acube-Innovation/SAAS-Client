import fs from "node:fs";

import { expect, type Page, test } from "@playwright/test";

import { AUTH_DIR, authFile, type Role } from "./support";

/** Portal spec 1.1: the menu each role sees, in order. */
const MENUS: Record<Role, string[]> = {
  owner: [
    "Home", "Subscribers", "Bookings", "Deliveries", "Follow-up queue", "Reports", "Messages and voice",
    "Areas and staff", "Communication log", "Wallet and billing", "Users", "Reminder settings", "Integrations",
    "Audit log",
  ],
  manager: [
    "Home", "Subscribers", "Bookings", "Deliveries", "Follow-up queue", "Reports", "Messages and voice",
    "Areas and staff", "Communication log", "Wallet and billing", "Reminder settings",
  ],
  office_staff: [
    "Home", "Subscribers", "Bookings", "Deliveries", "Follow-up queue", "Messages and voice", "Communication log",
  ],
};

const agency = () => fs.readFileSync(`${AUTH_DIR}/agency.txt`, "utf8");

async function menu(page: Page) {
  return page.getByRole("navigation", { name: "Main navigation" }).getByRole("link").allTextContents();
}

for (const role of Object.keys(MENUS) as Role[]) {
  test.describe(`${role}`, () => {
    test.use({ storageState: authFile(role) });

    test("sees exactly the menu in spec 1.1", async ({ page }) => {
      await page.goto("/home");
      await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
      expect(await menu(page)).toEqual(MENUS[role]);
      await expect(page.getByText(agency()).first()).toBeVisible();
    });
  });
}

test.describe("Home shows the seeded numbers", () => {
  test.use({ storageState: authFile("manager") });

  test("tiles match the API for the seeded agency", async ({ page }) => {
    await page.goto("/home");
    const data = await (await page.request.get("/api/portal/home")).json();
    expect(data.tomorrow_counts.total).toBeGreaterThan(0);
    const tile = (label: string) => page.getByTestId("home-tile").and(page.locator(`[data-label="${label}"]`));
    const n = (value: number) => value.toLocaleString("en-IN");
    for (const [label, key] of [
      ["Confirmed", "confirmed"], ["Reschedule", "reschedule"], ["Not available", "not_available"],
      ["No response", "no_response"], ["Awaiting reply", "awaiting_reply"], ["Needs review", "needs_review"],
    ] as const) {
      await expect(tile(label).locator("p").nth(1)).toHaveText(n(data.tomorrow_counts[key]));
    }
    await expect(tile("Follow-up queue")).toContainText(`${n(data.follow_up.open)} open`);
    await expect(tile("No planned delivery date yet").locator("p").nth(1)).toHaveText(n(data.no_date));
    await expect(page.getByText(`${data.tomorrow_counts.total} cylinder delivery bookings`)).toBeVisible();
    // The seeded agency's reminder template is live, so there is no template alert.
    await expect(page.getByRole("status").filter({ hasText: "No WhatsApp template is live yet" })).toHaveCount(0);
    // Managers don't get the owner's checklist.
    await expect(page.getByRole("region", { name: "Get started" })).toHaveCount(0);
  });

  test("Home refreshes on its own every 30 seconds", async ({ page }) => {
    await page.clock.install();
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    const refreshed = page.waitForRequest((r) => r.url().endsWith("/api/portal/home"));
    await page.clock.fastForward(31_000);
    await refreshed;
  });
});

test.describe("owner", () => {
  test.use({ storageState: authFile("owner") });

  test("first-login checklist: facts tick themselves, the owner ticks or skips the rest", async ({ page }) => {
    await page.goto("/home");
    const checklist = page.getByRole("region", { name: "Get started" });
    await expect(checklist).toBeVisible();
    // The seed created areas, subscribers, bookings and a team.
    for (const item of ["areas", "import_subscribers", "import_bookings", "invite_team"]) {
      await expect(checklist.locator(`[data-item="${item}"]`).getByText("Done")).toBeVisible();
    }
    await expect(checklist.getByText("4 of 7 done")).toBeVisible();
    await checklist.locator('[data-item="agency_details"]').getByRole("button", { name: "Mark done" }).click();
    await expect(checklist.getByText("5 of 7 done")).toBeVisible();
    await checklist.locator('[data-item="reminder_settings"]').getByRole("button", { name: "Mark done" }).click();
    await checklist.locator('[data-item="auto_top_up"]').getByRole("button", { name: "Skip" }).click();
    // Everything done or skipped: the checklist goes away.
    await expect(checklist).toHaveCount(0);
  });
});

test.describe("office staff", () => {
  test.use({ storageState: authFile("office_staff") });

  test("a screen outside the role is refused", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.getByText("Not available for your role")).toBeVisible();
    await page.goto("/integrations");
    await expect(page.getByText("Not available for your role")).toBeVisible();
  });
});

test("signed-out visitors are sent to sign-in", async ({ page }) => {
  await page.goto("/bookings");
  await expect(page).toHaveURL(/\/login\?next=%2Fbookings$/);
});

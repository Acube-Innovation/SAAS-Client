import { expect, request, test } from "@playwright/test";

import { manage, PASSWORD, totp, totpBase32, unique } from "./support";

/**
 * Done when (Step 16): an owner's first login through import completes. A super admin creates the
 * agency (admin API), the owner accepts the invite, sets up 2FA and goes through the guided set-up:
 * details, areas and staff, reminder settings, subscriber and booking imports, team, auto top-up.
 */
test("owner first login: invite -> 2FA -> guided set-up with imports -> done", async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const id = unique();
  const agency = `E2E Onboard ${id}`;
  const ownerEmail = `owner-${id}@onboard.e2e.test`;

  // A super admin creates the client (the owner is invited).
  const adminEmail = `e2e-admin-${id}@e2e.test`;
  manage(`createplatformuser --email ${adminEmail} --full-name "E2E Admin" --role super_admin --password-stdin`, `${PASSWORD}\n`);
  const admin = await request.newContext({ baseURL });
  await admin.get("/api/auth/csrf");
  const csrf = async () => ({ "X-CSRFToken": (await admin.storageState()).cookies.find((c) => c.name === "csrftoken")?.value ?? "" });
  expect((await admin.post("/api/auth/login", { data: { email: adminEmail, password: PASSWORD }, headers: await csrf() })).ok()).toBe(true);
  const setup = await (await admin.post("/api/auth/otp/setup", { headers: await csrf() })).json();
  expect((await admin.post("/api/auth/otp/confirm", { data: { otp_code: totp(setup.secret) }, headers: await csrf() })).ok()).toBe(true);
  const template = (await (await admin.get("/api/admin/industry-templates")).json()).find((t: { key: string }) => t.key === "gas_agency");
  const created = await admin.post("/api/admin/tenants", {
    headers: await csrf(),
    data: {
      industry_template: template.id, name: agency, legal_name: `${agency} LLP`, address_line1: "Main Road",
      city: "Kottayam", state: "KL", pin_code: "686001", contact_name: "Office", contact_phone: "9847000001",
      contact_email: `office-${id}@onboard.e2e.test`, owner_name: "Owner", owner_email: ownerEmail,
    },
  });
  expect(created.ok()).toBe(true);
  await admin.dispose();
  const link = manage(`issue_invite_link ${ownerEmail} --tenant "${agency}"`).trim().split("\n").pop()!;
  const invitePath = new URL(link).pathname;

  // 1. Accept the invite and set up two-factor authentication.
  await page.goto(invitePath);
  await page.getByLabel(/^Full name/).fill("Suja Varghese");
  await page.getByLabel(/^Choose a password/).fill("owner-first-login-2026");
  await page.getByLabel(/^Repeat the password/).fill("owner-first-login-2026");
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByRole("heading", { name: "Set up two-factor authentication" })).toBeVisible();
  const key = await page.locator("code").innerText();
  await page.getByLabel(/6-digit code/).fill(totpBase32(key));
  await page.getByRole("button", { name: "Confirm and continue" }).click();

  // 2. Home: the checklist starts empty; start the guided set-up.
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  const checklist = page.getByRole("region", { name: "Get started" });
  await expect(checklist.getByText("0 of 7 done")).toBeVisible();
  await checklist.getByRole("link", { name: "Start guided set-up" }).click();
  await expect(page).toHaveURL(/\/setup/);
  const step = (name: string) => page.getByRole("region", { name });

  // 3. Agency details.
  await expect(step("Confirm your agency details").getByText(`${agency} LLP`)).toBeVisible();
  await page.getByRole("button", { name: "These details are correct" }).click();

  // 4. Delivery staff and areas.
  const areas = step("Add your areas and delivery staff");
  await areas.getByLabel(/^Name/).fill("Biju K");
  await areas.getByRole("button", { name: "Add staff member" }).click();
  await areas.getByLabel(/^Area name/).fill("Nagampadam");
  await expect(areas.getByLabel(/^Default delivery person/).locator("option", { hasText: "Biju K" })).toHaveCount(1);
  await areas.getByLabel(/^Default delivery person/).selectOption({ label: "Biju K" });
  await areas.getByRole("button", { name: "Add area" }).click();
  await expect(areas.getByRole("list", { name: "Areas added" })).toContainText("Nagampadam · Biju K");
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // 5. Reminder settings.
  const settings = step("Set your reminder settings");
  await settings.getByLabel(/^Send time/).fill("09:30");
  await settings.getByRole("button", { name: "Save settings" }).click();
  await expect(settings.getByText("Reminder settings saved.")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // 6. Import subscribers: one bad row is reported and skipped.
  const subs = step("Import your subscribers");
  await expect(subs.getByRole("link", { name: "Download template" })).toHaveAttribute("href", /entity=subscribers/);
  const header = "customer_name,mobile_number,external_ref,preferred_language,area,whatsapp_consent";
  const rows = [
    "Anil Kumar,9847011111,KT001,ml,Nagampadam,yes",
    "Divya Nair,9847022222,KT002,en,Nagampadam,yes",
    "Jose Thomas,9847033333,KT003,ml,,no",
    "Bad Number,12345,KT004,ml,Nagampadam,yes",
  ];
  await subs.getByLabel(/Choose file/).setInputFiles({
    name: "subscribers.csv", mimeType: "text/csv", buffer: Buffer.from([header, ...rows].join("\n")),
  });
  await subs.getByRole("button", { name: "Upload and check" }).click();
  await expect(subs.getByText("Ready to confirm")).toBeVisible();
  await expect(subs.getByRole("table", { name: "Rows with errors (skipped)" })).toContainText("KT004");
  await subs.getByRole("button", { name: "Import 3 rows" }).click();
  await expect(subs.getByText("Imported: 3 added, 0 updated.")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // 7. Import bookings (one without a delivery date).
  const books = step("Import your bookings");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const later = new Date(Date.now() + 3 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  await books.getByLabel(/Choose file/).setInputFiles({
    name: "bookings.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "booking_reference,subscriber_ref,booking_date,scheduled_date,cylinder_type,quantity",
        `B-1,KT001,${today},${later},14.2 kg domestic,1`,
        `B-2,KT002,${today},,14.2 kg domestic,`,
      ].join("\n"),
    ),
  });
  await books.getByRole("button", { name: "Upload and check" }).click();
  await books.getByRole("button", { name: "Import 2 rows" }).click();
  await expect(books.getByText("Imported: 2 added, 0 updated.")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // 8. Invite the team.
  const team = step("Invite your team");
  await team.getByLabel(/^Email/).fill(`manager-${id}@onboard.e2e.test`);
  await team.getByLabel(/^Name/).fill("Meera Manager");
  await team.getByLabel(/^Role/).selectOption("manager");
  await team.getByRole("button", { name: "Send invitation" }).click();
  await expect(team.getByText(`Invitation sent to manager-${id}@onboard.e2e.test.`)).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // 9. Auto top-up: skipped for now; the set-up is complete.
  const topUp = step("Set up auto top-up");
  await expect(topUp.getByRole("button", { name: "Set up auto top-up" })).toBeDisabled();
  await topUp.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByText("Your agency is set up.")).toBeVisible();
  const states = await page.getByRole("navigation", { name: "Set-up steps" }).getByRole("button").evaluateAll(
    (buttons) => buttons.map((b) => (b as HTMLElement).dataset.state),
  );
  expect(states).toEqual(["done", "done", "done", "done", "done", "done", "skipped"]);

  // 10. Home: no checklist any more, and the imported data shows.
  await page.getByRole("link", { name: "Go to Home" }).click();
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Get started" })).toHaveCount(0);
  await expect(page.getByTestId("home-tile").and(page.locator('[data-label="No planned delivery date yet"]'))).toContainText("1");
  await page.goto("/subscribers");
  await expect(page.getByRole("table", { name: "Subscribers" }).locator("tbody tr")).toHaveCount(3);
});

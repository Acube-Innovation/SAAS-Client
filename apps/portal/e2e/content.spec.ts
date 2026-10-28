import { expect, test } from "@playwright/test";

import { apiAs, authFile, staffAuthFile, unique } from "./support";

/**
 * Workflow 3.3 across portal and admin: the client works in the portal (this browser); platform
 * staff act through the admin API (the admin console's own e2e drives their screens).
 */
async function englishTemplate(staff: Awaited<ReturnType<typeof apiAs>>, tenantId: string) {
  const list = await staff.get(`/api/admin/whatsapp-templates?tenant=${tenantId}&language=en`);
  const template = await staff.get(`/api/admin/whatsapp-templates/${list.results[0].id}`);
  return template as { id: string; versions: { id: string; version: number; status: string; is_live: boolean }[] };
}

test.describe("Workflow 3.3: content approval and change requests", () => {
  test.use({ storageState: authFile("manager") });

  test("raise a request -> staff reply and link -> send back -> approve -> live -> request done", async ({ page, baseURL }) => {
    const support = await apiAs(baseURL!, staffAuthFile("support"));
    const admin = await apiAs(baseURL!, staffAuthFile("super_admin"));
    const subject = `Add our office number ${unique()}`;

    // 1. The manager raises a change request in the portal.
    await page.goto("/messages?tab=requests");
    await page.getByRole("button", { name: "New change request" }).click();
    const form = page.getByRole("dialog", { name: "New change request" });
    await form.getByLabel(/^Type/).selectOption("edit_template");
    await form.getByLabel(/^Subject/).fill(subject);
    await form.getByLabel(/^Details/).fill("Customers keep asking where to call.");
    await form.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();
    await expect(page.getByText("Waiting for our team to pick it up.")).toBeVisible();
    const requestId = page.url().split("/").pop()!;

    // 2. Support starts work, replies and links the English version 2 (already sent for approval).
    const config = await (await page.request.get("/api/portal/config")).json();
    await support.patch(`/api/admin/change-requests/${requestId}`, { status: "in_progress" });
    await support.post(`/api/admin/change-requests/${requestId}/comments`, { body: "We'll put it in the footer." });
    const template = await englishTemplate(support, config.tenant_id);
    const draft = template.versions.find((v) => v.version === 2)!;
    await support.post(`/api/admin/change-requests/${requestId}/link-version`, { version: draft.id });

    await page.reload();
    await expect(page.getByText("We'll put it in the footer.")).toBeVisible();
    await expect(page.getByText("Our team is working on it.")).toBeVisible();
    await expect(page.locator("[data-linked-version='2']")).toContainText("Waiting for your approval");

    // 3. The manager sends version 2 back with a comment.
    await page.goto("/messages");
    const group = page.getByRole("region", { name: "cylinder_delivery_reminder" });
    await group.getByRole("tab", { name: /English/ }).click();
    await expect(group.getByText("Changed from the live version: Footer")).toBeVisible();
    await group.getByRole("button", { name: "Send back" }).click();
    const sendBack = page.getByRole("dialog", { name: "Send back version 2" });
    await sendBack.getByLabel(/What should change/).fill("Use the office landline 0484 2300000");
    await sendBack.getByRole("button", { name: "Send back" }).click();
    await expect(page.getByText("Sent back to our team with your comment.")).toBeVisible();
    await expect(group.locator("[data-version=pending] blockquote")).toHaveText("Use the office landline 0484 2300000");

    // 4. Support revises the footer and sends it again.
    const base = `/api/admin/whatsapp-templates/${template.id}/versions/${draft.id}`;
    const footer = "Questions? Call 0484 2300000. Reply STOP to stop.";
    await support.patch(base, { footer });
    await support.post(`${base}/send-to-client`);

    // 5. The manager approves the revised version.
    await page.reload();
    await group.getByRole("tab", { name: /English/ }).click();
    await expect(group.locator("[data-version=pending] [data-part=footer]")).toHaveText(footer);
    await group.getByRole("button", { name: "Approve" }).click();
    await page.getByRole("dialog", { name: /Approve version 2/ }).getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved. We'll submit it to WhatsApp for review.")).toBeVisible();
    await expect(group.locator("[data-version=pending]")).toContainText("Approved by Demo Manager");

    // 6. Support can't submit to Meta; a super admin submits, Meta approves (stub), it goes live.
    await expect(support.post(`${base}/submit`)).rejects.toThrow(/403/);
    await admin.post(`${base}/submit`);
    await admin.post(`/api/admin/dev/whatsapp-versions/${draft.id}/simulate`, { action: "provider_approve" });
    await expect(support.post(`${base}/make-live`)).rejects.toThrow(/403/);
    await admin.post(`${base}/make-live`);

    // 7. The request is done and the manager sees version 2 live.
    await page.goto(`/messages/requests/${requestId}`);
    await expect(page.getByText("Done: the new version is live.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Add a comment" })).toHaveCount(0);
    await page.goto("/messages");
    await group.getByRole("tab", { name: /English/ }).click();
    await expect(group.getByText("Live · version 2")).toBeVisible();
    await expect(group.locator("[data-version=live] [data-part=footer]")).toHaveText(footer);
    await expect(group.locator("[data-version=pending]")).toHaveCount(0);
  });
});

test.describe("Content is view-only for clients", () => {
  test.use({ storageState: authFile("office_staff") });

  test("office staff see a version awaiting review but can't act; content writes are refused", async ({ page, baseURL }) => {
    // Staff send a new Malayalam version for review.
    const support = await apiAs(baseURL!, staffAuthFile("support"));
    const config = await (await page.request.get("/api/portal/config")).json();
    const list = await support.get(`/api/admin/whatsapp-templates?tenant=${config.tenant_id}&language=ml`);
    const template = await support.get(`/api/admin/whatsapp-templates/${list.results[0].id}`);
    const live = template.versions.find((v: { is_live: boolean }) => v.is_live);
    const draft = await support.post(`/api/admin/whatsapp-templates/${template.id}/versions/${live.id}/new-version`);
    await support.post(`/api/admin/whatsapp-templates/${template.id}/versions/${draft.id}/send-to-client`);

    await page.goto("/messages");
    const group = page.getByRole("region", { name: "cylinder_delivery_reminder" });
    await group.getByRole("tab", { name: /Malayalam/ }).click();
    await expect(group.getByText("Waiting for your approval").first()).toBeVisible();
    await expect(group.getByText("The owner or a manager can approve or send back this version.")).toBeVisible();
    await expect(group.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await page.goto("/messages?tab=requests");
    await expect(page.getByRole("button", { name: "New change request" })).toHaveCount(0);

    const csrf = (await page.context().cookies()).find((c) => c.name === "csrftoken")?.value ?? "";
    const headers = { "X-CSRFToken": csrf };
    const detail = `/api/portal/content/templates/${template.id}`;
    const statuses = [
      (await page.request.post(`${detail}/versions/${draft.id}/approve`, { headers })).status(),
      (await page.request.post("/api/portal/content/templates", { headers, data: { name: "x", body: "Hi" } })).status(),
      (await page.request.patch(detail, { headers, data: { body: "Changed" } })).status(),
      (await page.request.delete(detail, { headers })).status(),
      (await page.request.post("/api/portal/content/voice-scripts", { headers, data: { greeting: "Hi" } })).status(),
      (await page.request.put("/api/portal/content/question-flows", { headers, data: { answers: [] } })).status(),
      (await page.request.post("/api/portal/change-requests", { headers, data: { request_type: "other", subject: "Hello there" } })).status(),
    ];
    expect(statuses).toEqual([403, 405, 405, 405, 405, 405, 403]);
  });
});

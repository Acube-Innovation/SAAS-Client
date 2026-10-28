import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { mockApi, navigation, portalConfig, renderWithQuery, router } from "@/test/utils";

import { ChangeRequestDetail } from "./messages/change-requests";
import { changedParts, MessagesScreen } from "./messages/messages-screen";
import { PhonePreview } from "./messages/phone-preview";

beforeEach(() => {
  navigation.pathname = "/messages";
  navigation.search = new URLSearchParams();
});

const BODY = "Hello {{customer_name}}, this is {{agency_name}}. Delivery on {{scheduled_date}}.";
const version = (overrides = {}) => ({
  id: "v1", version: 1, status: "approved", is_live: true, header_text: "", body: BODY,
  footer: "Reply STOP to stop.", buttons: [{ text: "Yes, available", outcome: "confirmed" }, { text: "Change date", outcome: "reschedule" }],
  sample_values: { customer_name: "Asha", scheduled_date: "29 Oct 2026" }, can_review: false, signoff_method: "manual",
  signed_off_by_name: null, signed_off_at: null, approved_at: null, sent_back_comment: null, ...overrides,
});
const template = (overrides = {}) => ({
  id: "t-en", name: "cylinder_delivery_reminder", language: "en", schedule_type_name: "Cylinder delivery",
  live: version(),
  pending: version({ id: "v2", version: 2, status: "sent_to_client", is_live: false, can_review: true, footer: "Call 0484 2345678." }),
  history: [{ action: "send_to_client", version: 2, by: null, note: "", created_at: "2026-10-28T05:00:00Z" }],
  ...overrides,
});
const ml = template({ id: "t-ml", language: "ml", pending: null, history: [] });

describe("Phone preview", () => {
  it("fills variables with sample values and the agency name", () => {
    renderWithQuery(<PhonePreview content={version()} agencyName="Kochi Gas Agency" />);
    const body = screen.getByText((_, el) => el?.getAttribute("data-part") === "body");
    expect(body).toHaveTextContent("Hello Asha, this is Kochi Gas Agency. Delivery on 29 Oct 2026.");
    expect(body.querySelectorAll("mark")).toHaveLength(3);
    expect(screen.getByRole("list", { name: "Reply buttons" })).toHaveTextContent("Yes, available");
  });

  it("shows a variable with no sample as {{name}}", () => {
    renderWithQuery(<PhonePreview content={version({ body: "Ref {{booking_reference}}" })} agencyName="A" />);
    expect(screen.getByText("{{booking_reference}}")).toBeInTheDocument();
  });

  it("lists which parts changed", () => {
    expect(changedParts(version() as never, version({ footer: "New" }) as never)).toEqual(["footer"]);
    expect(changedParts(null, version() as never)).toEqual([]);
  });
});

describe("Messages and voice", () => {
  it("approves a version sent for review", async () => {
    const calls = mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig() },
      { method: "GET", path: "/api/portal/content/templates", body: [template(), ml] },
      { method: "GET", path: "/api/auth/csrf", status: 204 },
      { method: "POST", path: "/api/portal/content/templates/t-en/versions/v2/approve", body: version({ id: "v2", status: "signed_off" }) },
    ]);
    renderWithQuery(<MessagesScreen />);
    expect(await screen.findByText("1 template version is waiting for your approval.")).toBeInTheDocument();
    const group = screen.getByRole("region", { name: "cylinder_delivery_reminder" });
    expect(within(group).getByRole("tab", { name: /English/ })).toHaveAttribute("aria-selected", "true");
    expect(within(group).getByText("Changed from the live version: Footer")).toBeInTheDocument();
    expect(within(group).getByText("Live · version 1")).toBeInTheDocument();
    await userEvent.click(within(group).getByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog", { name: "Approve version 2 (English)?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Approved. We'll submit it to WhatsApp for review.")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/v2/approve"))).toBe(true);
    // Malayalam has only a live version.
    await userEvent.click(within(group).getByRole("tab", { name: "Malayalam" }));
    expect(within(group).queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("sends a version back with a comment of 5 to 1,000 characters", async () => {
    const calls = mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig({ role: "owner" }) },
      { method: "GET", path: "/api/portal/content/templates", body: [template()] },
      { method: "GET", path: "/api/auth/csrf", status: 204 },
      { method: "POST", path: "/api/portal/content/templates/t-en/versions/v2/send-back", body: version({ id: "v2", status: "sent_back" }) },
    ]);
    renderWithQuery(<MessagesScreen />);
    await userEvent.click(await screen.findByRole("button", { name: "Send back" }));
    const dialog = await screen.findByRole("dialog", { name: "Send back version 2" });
    await userEvent.type(within(dialog).getByLabelText(/What should change/), "No");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send back" }));
    expect(await within(dialog).findByText("Use 5 to 1,000 characters.")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/What should change/), " - use the office number");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send back" }));
    expect(await screen.findByText("Sent back to our team with your comment.")).toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith("/send-back"))?.body).toEqual({ comment: "No - use the office number" });
  });

  it.each(["office_staff", "support"])("shows no review buttons to %s", async (role) => {
    mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig({ role }) },
      { method: "GET", path: "/api/portal/content/templates", body: [template()] },
    ]);
    renderWithQuery(<MessagesScreen />);
    expect(await screen.findByText("The owner or a manager can approve or send back this version.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("shows voice scripts and question flows read-only", async () => {
    navigation.search = new URLSearchParams("tab=voice");
    mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig() },
      { method: "GET", path: "/api/portal/content/templates", body: [] },
      {
        method: "GET", path: "/api/portal/content/voice-scripts",
        body: [{ id: "s1", name: "delivery_call", language: "ml", schedule_type_name: "Cylinder delivery",
          live: { version: 1, greeting: "Namaskaram", question: "Will someone be home?", answers: [{ text: "Yes", outcome: "confirmed" }],
            voice: "ml-IN-female-1", max_retries: 2, retry_gap_minutes: 60 } }],
      },
    ]);
    const { unmount } = renderWithQuery(<MessagesScreen />);
    const script = await screen.findByRole("region", { name: "delivery_call" });
    expect(script).toHaveTextContent("Will someone be home?");
    expect(script).toHaveTextContent("60 min");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    unmount();

    navigation.search = new URLSearchParams("tab=flows");
    mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig() },
      { method: "GET", path: "/api/portal/content/templates", body: [] },
      {
        method: "GET", path: "/api/portal/content/question-flows",
        body: [{ schedule_type: "cylinder_delivery", name: "Cylinder delivery", answers: [
          { key: "yes", label: "Yes, available", outcome: "confirmed" },
          { key: "change", label: "Change date", outcome: "reschedule", pick_next_delivery_days: 5 },
        ] }],
      },
    ]);
    renderWithQuery(<MessagesScreen />);
    const flow = await screen.findByRole("region", { name: "Cylinder delivery" });
    expect(flow).toHaveTextContent("Goes on the delivery list");
    expect(flow).toHaveTextContent("Customer picks one of the next 5 delivery days");
  });
});

describe("Change requests", () => {
  const request = (overrides = {}) => ({
    id: "cr1", request_type: "edit_template", subject: "Add our phone number", description: "Please add 0484 2345678.",
    status: "open", requested_by_name: "Mini Manager", linked_version: null, decline_reason: "", comment_count: 0,
    created_at: "2026-10-28T05:00:00Z", updated_at: "2026-10-28T05:00:00Z", started_at: null, closed_at: null, ...overrides,
  });

  it("raises a request after checking the subject", async () => {
    navigation.search = new URLSearchParams("tab=requests");
    const calls = mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig() },
      { method: "GET", path: "/api/portal/content/templates", body: [] },
      { method: "GET", path: "/api/portal/change-requests", body: { count: 0, next: null, previous: null, results: [] } },
      { method: "GET", path: "/api/auth/csrf", status: 204 },
      { method: "POST", path: "/api/portal/change-requests", status: 201, body: { ...request(), comments: [] } },
    ]);
    renderWithQuery(<MessagesScreen />);
    await userEvent.click(await screen.findByRole("button", { name: "New change request" }));
    const dialog = await screen.findByRole("dialog", { name: "New change request" });
    await userEvent.selectOptions(within(dialog).getByLabelText(/Type/), "edit_template");
    await userEvent.type(within(dialog).getByLabelText(/Subject/), "Add");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
    expect(await within(dialog).findByText("Use 5 to 150 characters.")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/Subject/), " our phone number");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/messages/requests/cr1"));
    expect(calls.find((c) => c.method === "POST" && c.path === "/api/portal/change-requests")?.body).toEqual({
      request_type: "edit_template", subject: "Add our phone number", description: "",
    });
  });

  it("office staff see requests but can't raise them", async () => {
    navigation.search = new URLSearchParams("tab=requests");
    mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig({ role: "office_staff" }) },
      { method: "GET", path: "/api/portal/content/templates", body: [] },
      { method: "GET", path: "/api/portal/change-requests", body: { count: 1, next: null, previous: null, results: [request()] } },
    ]);
    renderWithQuery(<MessagesScreen />);
    expect(await screen.findByRole("link", { name: "Add our phone number" })).toHaveAttribute("href", "/messages/requests/cr1");
    expect(screen.queryByRole("button", { name: "New change request" })).not.toBeInTheDocument();
  });

  it("shows the thread and posts a comment", async () => {
    const calls = mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig() },
      {
        method: "GET", path: "/api/portal/change-requests/cr1",
        body: { ...request({ status: "in_progress", linked_version: { id: "v2", template_id: "t-en", template_name: "cylinder_delivery_reminder", language: "en", version: 2, status: "draft", is_live: false } }),
          comments: [{ id: "c1", author_name: "Sam Support", from_staff: true, body: "Which line?", created_at: "2026-10-28T06:00:00Z" }] },
      },
      { method: "GET", path: "/api/auth/csrf", status: 204 },
      { method: "POST", path: "/api/portal/change-requests/cr1/comments", status: 201, body: {} },
    ]);
    renderWithQuery(<ChangeRequestDetail id="cr1" />);
    expect(await screen.findByText("Sam Support (support team)", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Our team is working on it.")).toBeInTheDocument();
    expect(screen.getByText(/Being prepared/)).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Add a comment" }), "The footer, please");
    await userEvent.click(screen.getByRole("button", { name: "Post comment" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toEqual({ body: "The footer, please" }));
  });

  it("a declined request shows the reason and takes no comments", async () => {
    mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig() },
      { method: "GET", path: "/api/portal/change-requests/cr1", body: { ...request({ status: "declined", decline_reason: "Meta won't allow it", closed_at: "2026-10-28T07:00:00Z" }), comments: [] } },
    ]);
    renderWithQuery(<ChangeRequestDetail id="cr1" />);
    expect(await screen.findByText("Meta won't allow it")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Add a comment" })).not.toBeInTheDocument();
  });
});

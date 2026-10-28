import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockApi, navigation, portalConfig, renderWithQuery } from "@/test/utils";

import { BookingDetail } from "./bookings/booking-detail";
import { BookingsList } from "./bookings/bookings-list";
import { DeliveriesScreen } from "./deliveries/deliveries-screen";
import { FollowUpQueue } from "./follow-up/follow-up-queue";

beforeEach(() => {
  navigation.search = new URLSearchParams();
});

const booking = (overrides = {}) => ({
  id: "b1", booking_reference: "BK1", subscriber: "s1", subscriber_name: "Asha Menon", subscriber_mobile: "+919847012345",
  subscriber_external_ref: "KL1", area_name: "Edappally", schedule_type: "cylinder_delivery", booking_date: "2026-10-27",
  scheduled_date: null, status: "booked", outcome: "", new_date_requested: null, remarks: "",
  custom_fields: { cylinder_type: "14.2 kg domestic", quantity: 1 }, cancelled_at: null, cancel_reason: "", job: null,
  follow_up: null, created_at: "", updated_at: "u1", ...overrides,
});
const config = portalConfig({
  schedule_types: [{
    key: "cylinder_delivery", name: "Cylinder delivery",
    fields: [{ key: "scheduled_date", label: "Planned delivery date" }, { key: "booking_reference", label: "Booking reference" },
      { key: "cylinder_type", label: "Cylinder type", options: ["14.2 kg domestic", "5 kg"] }],
  }],
});

describe("Bookings list", () => {
  it("bulk-sets a date on selected bookings without a date", async () => {
    navigation.pathname = "/bookings";
    navigation.search = new URLSearchParams("no_date=true");
    const calls = mockApi([
      { method: "GET", path: "/api/portal/config", body: config },
      { method: "GET", path: "/api/portal/areas", body: [] },
      { method: "GET", path: "/api/portal/bookings", body: { count: 2, next: null, previous: null, results: [booking(), booking({ id: "b2", booking_reference: "BK2" })] } },
      { method: "GET", path: "/api/auth/csrf", status: 204 },
      { method: "POST", path: "/api/portal/bookings/bulk-set-date", body: { updated: ["b1", "b2"], skipped_cancelled: [], not_found: [] } },
    ]);
    renderWithQuery(<BookingsList />);
    await screen.findByText("BK2");
    expect(screen.getAllByText("No date yet").length).toBeGreaterThan(2);
    expect(screen.getByRole("button", { name: "No date yet" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByLabelText("Select BK1"));
    await userEvent.click(screen.getByLabelText("Select BK2"));
    const bar = screen.getByRole("region", { name: "Set a date for the selected bookings" });
    expect(bar).toHaveTextContent("2 selected");
    await userEvent.type(within(bar).getByLabelText("Delivery date"), "2099-01-15");
    await userEvent.click(within(bar).getByRole("button", { name: "Set date" }));
    expect(await screen.findByRole("status")).toHaveTextContent("2 bookings now deliver on 15 Jan 2099");
    expect(calls.find((c) => c.path.endsWith("bulk-set-date"))?.body).toEqual({ ids: ["b1", "b2"], scheduled_date: "2099-01-15" });
    expect(new URLSearchParams(calls.find((c) => c.path === "/api/portal/bookings")!.search).get("no_date")).toBe("true");
  });

  it("opens the timeline drawer", async () => {
    navigation.pathname = "/bookings";
    mockApi([
      { method: "GET", path: "/api/portal/config", body: config },
      { method: "GET", path: "/api/portal/areas", body: [] },
      { method: "GET", path: "/api/portal/bookings", body: { count: 1, next: null, previous: null, results: [booking({ scheduled_date: "2026-10-29", status: "closed", outcome: "confirmed" })] } },
      {
        method: "GET", path: "/api/portal/bookings/b1/timeline",
        body: [
          { at: "2026-10-27T03:30:00Z", kind: "created", data: { source: "import" }, actor_email: "" },
          { at: "2026-10-28T04:30:00Z", kind: "attempt", data: { channel: "whatsapp", delivery_status: "read" }, actor_email: "" },
          { at: "2026-10-28T05:00:00Z", kind: "response", data: { channel: "whatsapp", text: "Yes, available", outcome: "confirmed" }, actor_email: "" },
          { at: "2026-10-28T05:00:00Z", kind: "job_created", data: { staff: "Biju K" }, actor_email: "" },
        ],
      },
    ]);
    renderWithQuery(<BookingsList />);
    await userEvent.click(await screen.findByRole("button", { name: "Timeline" }));
    const drawer = await screen.findByRole("dialog", { name: "BK1 · Asha Menon" });
    const items = await within(drawer).findAllByRole("listitem");
    expect(items.map((i) => i.dataset.kind)).toEqual(["created", "attempt", "response", "job_created"]);
    expect(drawer).toHaveTextContent("WhatsApp reminder · Read");
    expect(drawer).toHaveTextContent("Yes, available");
    expect(drawer).toHaveTextContent("Delivery assigned to Biju K");
  });
});

describe("Booking detail", () => {
  it("cancels with a reason", async () => {
    const calls = mockApi([
      { method: "GET", path: "/api/portal/config", body: config },
      { method: "GET", path: "/api/portal/bookings/b1/timeline", body: [] },
      { method: "GET", path: "/api/auth/csrf", status: 204 },
      { method: "POST", path: "/api/portal/bookings/b1/cancel", body: booking({ status: "cancelled" }) },
    ]);
    renderWithQuery(<BookingDetail booking={booking() as never} />);
    await userEvent.click(await screen.findByRole("button", { name: "Cancel booking" }));
    const dialog = screen.getByRole("dialog", { name: "Cancel BK1?" });
    await userEvent.type(within(dialog).getByLabelText(/Reason/), "no");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel booking" }));
    expect(await within(dialog).findByText("Give a reason of at least 5 characters.")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/Reason/), " longer reason");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel booking" }));
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/cancel"))?.body).toEqual({ reason: "no longer reason" }));
  });
});

const deliveries = (overrides = {}) => ({
  date: "2026-10-29", confirmed: 2, not_confirmed: { awaiting: 3, no_response: 1 }, printed_at: null, changed_after_print: [],
  areas: [{
    area_id: "a1", area_name: "Edappally", default_staff_name: "Biju K",
    jobs: [
      { id: "j1", status: "pending", printed_at: null, cancelled_reason: "", assigned_staff: "st1", assigned_staff_name: "Biju K", booking_id: "b1", booking_reference: "BK1", customer_name: "Asha", mobile_number: "+919847012345", address: "MG Road", cylinder_type: "14.2 kg domestic", quantity: 1 },
      { id: "j2", status: "pending", printed_at: null, cancelled_reason: "", assigned_staff: "st1", assigned_staff_name: "Biju K", booking_id: "b2", booking_reference: "BK2", customer_name: "Jose", mobile_number: "+919847012346", address: "", cylinder_type: "5 kg", quantity: 2 },
    ],
  }],
  ...overrides,
});

describe("Deliveries", () => {
  it("lists jobs by area, reassigns, prints and links the other answers", async () => {
    navigation.pathname = "/deliveries";
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const calls = mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig({ role: "manager" }) },
      { method: "GET", path: "/api/portal/deliveries", body: deliveries() },
      { method: "GET", path: "/api/portal/staff", body: { count: 2, next: null, previous: null, results: [{ id: "st1", name: "Biju K", phone: "", is_active: true }, { id: "st2", name: "Shaji P", phone: "", is_active: true }] } },
      { method: "GET", path: "/api/auth/csrf", status: 204 },
      { method: "POST", path: "/api/portal/jobs/j1/reassign", body: {} },
      { method: "POST", path: "/api/portal/deliveries/printed", body: { date: "2026-10-29", printed: 2, printed_at: "" } },
    ]);
    renderWithQuery(<DeliveriesScreen />);
    const area = await screen.findByRole("region", { name: "Edappally" });
    expect(within(area).getByText("2 deliveries · default Biju K")).toBeInTheDocument();
    expect(within(area).getByText("5 kg × 2")).toBeInTheDocument();
    await within(area).findAllByRole("option", { name: "Shaji P" });
    await userEvent.selectOptions(within(area).getByLabelText("Delivery person for BK1"), "st2");
    await waitFor(() => expect(calls.find((c) => c.path === "/api/portal/jobs/j1/reassign")?.body).toEqual({ assigned_staff: "st2" }));
    expect(screen.getByRole("link", { name: "No response: 1" })).toHaveAttribute("href", "/bookings?date=2026-10-29&outcome=no_response");
    expect(screen.getByRole("link", { name: "No answer yet: 3" })).toHaveAttribute("href", "/bookings?date=2026-10-29&outcome=none");
    expect(screen.getByRole("link", { name: "Download CSV" })).toHaveAttribute("href", "/api/portal/deliveries/export?date=2026-10-29");
    await userEvent.click(screen.getByRole("button", { name: "Print delivery list" }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    expect(calls.find((c) => c.path === "/api/portal/deliveries/printed")?.body).toEqual({ date: "2026-10-29" });
    print.mockRestore();
  });

  it("flags deliveries cancelled after printing; office staff can't reassign", async () => {
    navigation.pathname = "/deliveries";
    const cancelled = { ...deliveries().areas[0]!.jobs[0]!, status: "cancelled", printed_at: "2026-10-28T12:00:00Z" };
    mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig({ role: "office_staff" }) },
      { method: "GET", path: "/api/portal/deliveries", body: deliveries({ changed_after_print: [cancelled], printed_at: "2026-10-28T12:00:00Z" }) },
    ]);
    renderWithQuery(<DeliveriesScreen />);
    expect(await screen.findByRole("alert")).toHaveTextContent("BK1 · Asha (was with Biju K) is no longer confirmed");
    expect(screen.queryByLabelText("Delivery person for BK1")).not.toBeInTheDocument();
    expect(screen.getByText(/Last printed/)).toBeInTheDocument();
  });
});

const item = (overrides = {}) => ({
  id: "f1", outcome: "needs_review", status: "open", opened_at: "", contacted_at: null, notes: [], age_minutes: 300,
  ageing: "amber", booking_id: "b1", booking_reference: "BK1", scheduled_date: "2026-10-29", new_date_requested: null,
  customer_name: "Asha", mobile_number: "+919847012345", area_name: "Edappally", last_reply: "Please come after 5 pm", failure_reason: "",
  ...overrides,
});

describe("Follow-up queue", () => {
  it("shows ageing and the customer's words, and works an item", async () => {
    navigation.pathname = "/follow-up";
    const calls = mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig() },
      { method: "GET", path: "/api/portal/areas", body: [] },
      { method: "GET", path: "/api/portal/follow-ups", body: { count: 2, next: null, previous: null, results: [item(), item({ id: "f2", outcome: "failed", ageing: "red", age_minutes: 2000, last_reply: "", failure_reason: "Number not on WhatsApp" })] } },
      { method: "GET", path: "/api/auth/csrf", status: 204 },
      { method: "POST", path: "/api/portal/follow-ups/f1/contacted", body: item({ status: "contacted" }) },
      { method: "POST", path: "/api/portal/follow-ups/f2/set-date", body: item({ id: "f2", status: "resolved" }) },
    ]);
    renderWithQuery(<FollowUpQueue />);
    const list = await screen.findByRole("list", { name: "Follow-up queue" });
    const [first, second] = within(list).getAllByRole("listitem").filter((li) => li.dataset.item);
    expect(first!.dataset.ageing).toBe("amber");
    expect(first).toHaveTextContent("Waiting 5 h");
    expect(first).toHaveTextContent("Please come after 5 pm");
    expect(second!.dataset.ageing).toBe("red");
    expect(second).toHaveTextContent("Number not on WhatsApp");

    await userEvent.click(within(first!).getByRole("button", { name: "Mark contacted" }));
    const dialog = screen.getByRole("dialog", { name: "Contacted Asha" });
    await userEvent.type(within(dialog).getByLabelText("Note (optional)"), "Will be home after 5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Mark contacted" }));
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/contacted"))?.body).toEqual({ note: "Will be home after 5" }));

    await userEvent.click(within(second!).getByRole("button", { name: "Set new date" }));
    const dateDialog = screen.getByRole("dialog", { name: "New delivery date for Asha" });
    await userEvent.type(within(dateDialog).getByLabelText(/New delivery date/), "2099-02-01");
    await userEvent.click(within(dateDialog).getByRole("button", { name: "Set date" }));
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/set-date"))?.body).toEqual({ scheduled_date: "2099-02-01" }));
  });
});

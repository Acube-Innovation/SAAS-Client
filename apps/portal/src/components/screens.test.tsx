import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { mockApi, navigation, portalConfig, renderWithQuery, router } from "@/test/utils";

import { ImportWizard } from "./imports/import-wizard";
import { ReminderSettingsForm } from "./settings/reminder-settings-form";
import { SetupWizard } from "./setup/setup-wizard";
import { SubscriberForm } from "./subscribers/subscriber-form";
import { SubscribersList } from "./subscribers/subscribers-list";
import { UsersScreen } from "./users/users-screen";

beforeEach(() => {
  navigation.pathname = "/subscribers";
  navigation.search = new URLSearchParams();
});

const subscriber = (overrides = {}) => ({
  id: "s1", customer_name: "Asha Menon", mobile_number: "+919847012345", alternate_number: "", external_ref: "KL1",
  preferred_language: "ml", address: "", area: null, area_name: null, whatsapp_consent: true, consent_date: "2026-01-02",
  consent_source: "verbal", opted_out: false, opted_out_at: null, status: "active", custom_fields: {},
  can_be_messaged: true, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", ...overrides,
});

describe("Subscribers list", () => {
  it("shows badges and sends the URL filters", async () => {
    navigation.search = new URLSearchParams("consent=false&search=asha");
    const calls = mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig() },
      { method: "GET", path: "/api/portal/areas", body: [] },
      {
        method: "GET",
        path: "/api/portal/subscribers",
        body: { count: 2, next: null, previous: null, results: [subscriber(), subscriber({ id: "s2", customer_name: "Jose", opted_out: true })] },
      },
    ]);
    renderWithQuery(<SubscribersList />);
    const table = await screen.findByRole("table", { name: "Subscribers" });
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(3));
    expect(within(table).getByText("Consent")).toBeInTheDocument();
    expect(within(table).getByText("Opted out")).toBeInTheDocument();
    const call = calls.find((c) => c.path === "/api/portal/subscribers")!;
    expect(Object.fromEntries(new URLSearchParams(call.search))).toEqual({ consent: "false", search: "asha" });
    expect(screen.getByPlaceholderText("Name, mobile or consumer number")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Status"), "inactive");
    expect(router.replace).toHaveBeenCalledWith("/subscribers?search=asha&status=inactive&consent=false");
  });
});

describe("Subscriber form", () => {
  it("checks consent fields before calling the API, then shows the API's field errors", async () => {
    const calls = mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig() },
      { method: "GET", path: "/api/portal/areas", body: [] },
      { method: "GET", path: "/api/auth/csrf", status: 204 },
      {
        method: "POST",
        path: "/api/portal/subscribers",
        status: 400,
        body: { code: "validation_error", detail: "Fix the fields.", fields: { external_ref: ["Another subscriber already uses this reference."] } },
      },
    ]);
    renderWithQuery(<SubscriberForm />);
    await userEvent.type(await screen.findByLabelText(/^Customer name/), "Asha Menon");
    await userEvent.type(screen.getByLabelText(/^Consumer number/), "KL1");
    await userEvent.type(screen.getByLabelText(/^Mobile number/), "98470 12345");
    await userEvent.click(screen.getByLabelText("WhatsApp consent"));
    await userEvent.click(screen.getByRole("button", { name: "Add subscriber" }));
    expect(await screen.findAllByText("Required when the customer has given consent.")).toHaveLength(2);
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    await userEvent.type(screen.getByLabelText(/^Consent date/), "2026-01-02");
    await userEvent.selectOptions(screen.getByLabelText(/^How consent was given/), "paper_form");
    await userEvent.click(screen.getByRole("button", { name: "Add subscriber" }));
    expect(await screen.findByText("Another subscriber already uses this reference.")).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ mobile_number: "+919847012345", area: null, consent_source: "paper_form" });
  });

  it("explains that an opt-out can't be cleared", async () => {
    mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig() },
      { method: "GET", path: "/api/portal/areas", body: [] },
    ]);
    renderWithQuery(<SubscriberForm subscriber={subscriber({ opted_out: true }) as never} />);
    expect(await screen.findByText(/replied STOP/)).toBeInTheDocument();
  });
});

const job = (overrides = {}) => ({
  id: "j1", entity: "subscribers", original_filename: "list.csv", status: "previewed", total_rows: 3, valid_rows: 2,
  error_rows: 1, created_rows: 0, updated_rows: 0,
  errors: [{ row: 4, key: "KL3", errors: { mobile_number: "Enter a valid Indian mobile number." } }],
  summary: { would_create: 2, would_update: 0, ignored_columns: ["Notes"] }, has_error_file: true, failure_reason: "",
  created_by_email: "o@a.test", created_at: "2026-10-28T00:00:00Z", previewed_at: null, confirmed_at: null, finished_at: null,
  ...overrides,
});

describe("Import wizard", () => {
  it("uploads, shows the preview with per-row errors, and confirms", async () => {
    const calls = mockApi([
      { method: "GET", path: "/api/auth/csrf", status: 204 },
      { method: "POST", path: "/api/portal/imports", status: 201, body: job({ status: "previewing" }) },
      { method: "GET", path: "/api/portal/imports/j1", body: job() },
      { method: "POST", path: "/api/portal/imports/j1/confirm", body: job({ status: "confirming" }) },
    ]);
    renderWithQuery(<ImportWizard entity="subscribers" />);
    expect(screen.getByRole("link", { name: "Download template" })).toHaveAttribute(
      "href", "/api/portal/imports/template?entity=subscribers",
    );
    const file = new File(["customer_name\nAsha"], "list.csv", { type: "text/csv" });
    await userEvent.upload(screen.getByLabelText(/Choose file/), file);
    await userEvent.click(screen.getByRole("button", { name: "Upload and check" }));

    expect(await screen.findByText("Ready to confirm")).toBeInTheDocument();
    const totals = screen.getByLabelText("Import totals");
    expect(within(totals).getByText("2 / 0")).toBeInTheDocument();
    expect(screen.getByText("Columns not used: Notes.")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Rows with errors (skipped)" })).toHaveTextContent("Enter a valid Indian mobile number.");
    expect(screen.getByRole("link", { name: "Download error file" })).toHaveAttribute("href", "/api/portal/imports/j1/error-file");
    expect(screen.getByRole("status")).toHaveTextContent("Nothing is saved yet");

    await userEvent.click(screen.getByRole("button", { name: "Import 2 rows" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/api/portal/imports/j1/confirm")).toBe(true));
    expect(calls.find((c) => c.path === "/api/portal/imports" && c.method === "POST")).toBeTruthy();
  });

  it("shows why a file failed", async () => {
    mockApi([
      { method: "GET", path: "/api/auth/csrf", status: 204 },
      { method: "POST", path: "/api/portal/imports", status: 201, body: job({ status: "previewing" }) },
      { method: "GET", path: "/api/portal/imports/j1", body: job({ status: "failed", failure_reason: "Missing required columns: mobile_number." }) },
    ]);
    renderWithQuery(<ImportWizard entity="subscribers" />);
    await userEvent.upload(screen.getByLabelText(/Choose file/), new File(["x"], "a.csv", { type: "text/csv" }));
    await userEvent.click(screen.getByRole("button", { name: "Upload and check" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Missing required columns: mobile_number.");
  });
});

const settings = {
  schedule_type: "cylinder_delivery", send_time: "10:00", days_before: 1, wait_minutes: 240, quiet_start: "21:00",
  quiet_end: "08:00", default_language: "ml", delivery_weekdays: [0, 1, 2, 3, 4, 5], holiday_dates: [],
  linked_templates: [{ id: "tp1", name: "delivery_reminder", language: "ml", live_version: 2, latest_status: "approved" }],
  saved_at: null,
};

describe("Reminder settings", () => {
  it("validates quiet hours and saves", async () => {
    const calls = mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig() },
      { method: "GET", path: "/api/portal/reminder-settings", body: settings },
      { method: "GET", path: "/api/auth/csrf", status: 204 },
      { method: "PUT", path: "/api/portal/reminder-settings", body: { ...settings, saved_at: "2026-10-28T00:00:00Z" } },
    ]);
    renderWithQuery(<ReminderSettingsForm />);
    expect(await screen.findByText("Live: version 2")).toBeInTheDocument();
    const time = screen.getByLabelText(/^Send time/);
    await userEvent.clear(time);
    await userEvent.type(time, "22:00");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("The send time is inside quiet hours.")).toBeInTheDocument();
    await userEvent.clear(time);
    await userEvent.type(time, "09:30");
    await userEvent.click(screen.getByText("Sat"));
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")!.body).toMatchObject({ send_time: "09:30", delivery_weekdays: [0, 1, 2, 3, 4] });
  });
});

describe("Users", () => {
  it("shows the last-owner refusal from the API", async () => {
    const team = [
      { id: "m1", email: "o@a.test", full_name: "Owner", role: "owner", status: "active", last_login: null, otp_enabled: true, is_you: true, created_at: "" },
      { id: "m2", email: "s@a.test", full_name: "Staff", role: "office_staff", status: "invited", last_login: null, otp_enabled: false, is_you: false, created_at: "" },
    ];
    mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig({ role: "owner" }) },
      { method: "GET", path: "/api/portal/users", body: team },
      { method: "GET", path: "/api/auth/csrf", status: 204 },
      { method: "POST", path: "/api/portal/users/m1/role", status: 409, body: { code: "last_owner", detail: "The agency needs at least one active owner.", fields: {} } },
    ]);
    renderWithQuery(<UsersScreen />);
    await userEvent.selectOptions(await screen.findByLabelText("Role for o@a.test"), "manager");
    expect(await screen.findByRole("alert")).toHaveTextContent("at least one active owner");
    expect(screen.getByRole("button", { name: "Resend invite" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Deactivate" })).toHaveLength(1); // not for yourself
  });
});

describe("Guided set-up", () => {
  const items = (done: string[], skipped: string[] = []) =>
    ["agency_details", "areas", "reminder_settings", "import_subscribers", "import_bookings", "invite_team", "auto_top_up"].map(
      (key) => ({ key, done: done.includes(key), skipped: skipped.includes(key), can_skip: key === "auto_top_up", manual: ["agency_details", "reminder_settings", "auto_top_up"].includes(key) }),
    );
  const home = (checklist: unknown) => ({
    date: "", tomorrow: "", tomorrow_counts: {}, follow_up: { open: 0, oldest_minutes: null, by_ageing: {} }, no_date: 0,
    alerts: [], sent_today: 0, daily_send_cap: 5000, checklist, generated_at: "",
  });

  it("opens the first unfinished step and the owner can skip auto top-up", async () => {
    navigation.pathname = "/setup";
    const calls = mockApi([
      { method: "GET", path: "/api/portal/home", body: home({ complete: false, items: items(["agency_details", "areas", "reminder_settings", "import_subscribers", "import_bookings", "invite_team"]) }) },
      { method: "POST", path: "/api/portal/checklist", body: { complete: true, items: items([], ["auto_top_up"]) } },
    ]);
    renderWithQuery(<SetupWizard />);
    const step = await screen.findByRole("region", { name: "Set up auto top-up" });
    expect(within(step).getByRole("button", { name: "Set up auto top-up" })).toBeDisabled();
    await userEvent.click(within(step).getByRole("button", { name: "Skip for now" }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === "/api/portal/checklist")?.body).toEqual({ item: "auto_top_up", action: "skip" }),
    );
    const nav = screen.getByRole("navigation", { name: "Set-up steps" });
    expect(within(nav).getAllByRole("button").map((b) => b.dataset.state)).toEqual(["done", "done", "done", "done", "done", "done", "todo"]);
  });

  it("confirming agency details ticks the step and moves on", async () => {
    navigation.pathname = "/setup";
    const calls = mockApi([
      { method: "GET", path: "/api/portal/home", body: home({ complete: false, items: items([]) }) },
      {
        method: "GET", path: "/api/portal/agency",
        body: { id: "t1", name: "Kochi Gas", legal_name: "Kochi Gas LLP", gstin: "", address_line1: "MG Road", address_line2: "", city: "Kochi", state: "KL", pin_code: "682016", contact_name: "Asha", contact_phone: "+919847000001", contact_email: "o@k.test", default_language: "ml", daily_send_cap: 5000, status: "active" },
      },
      { method: "POST", path: "/api/portal/checklist", body: { complete: false, items: items(["agency_details"]) } },
    ]);
    renderWithQuery(<SetupWizard />);
    expect(await screen.findByText("Kochi Gas LLP")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "These details are correct" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/setup?step=areas"));
    expect(calls.find((c) => c.path === "/api/portal/checklist")?.body).toEqual({ item: "agency_details", action: "done" });
  });
});

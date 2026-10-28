import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import LoginPage from "@/app/(auth)/login/page";
import { authState, mockApi, navigation, portalConfig, renderWithQuery, router } from "@/test/utils";

import { HomeScreen } from "./home/home";
import { PortalShell } from "./portal-shell";

beforeEach(() => {
  navigation.pathname = "/home";
  navigation.search = new URLSearchParams();
});

function shell(role: string, configOverrides: Record<string, unknown> = {}, me: Record<string, unknown> = {}) {
  return mockApi([
    { method: "GET", path: "/api/auth/me", body: authState(me) },
    { method: "GET", path: "/api/portal/config", body: portalConfig({ role, ...configOverrides }) },
  ]);
}

async function menuLabels() {
  const nav = await screen.findByRole("navigation", { name: "Main navigation" });
  return within(nav).getAllByRole("link").map((link) => link.textContent);
}

describe("Portal shell", () => {
  it("office staff see only their screens", async () => {
    shell("office_staff");
    renderWithQuery(<PortalShell>page</PortalShell>);
    expect(await menuLabels()).toEqual([
      "Home", "Subscribers", "Bookings", "Deliveries", "Follow-up queue", "Messages and voice", "Communication log",
    ]);
    expect(screen.getByText("page")).toBeInTheDocument();
    expect(screen.getByText(/Office staff · manager@agency.test/)).toBeInTheDocument();
  });

  it("owners see every screen including Integrations and Audit log", async () => {
    shell("owner");
    renderWithQuery(<PortalShell>page</PortalShell>);
    const labels = await menuLabels();
    expect(labels).toHaveLength(14);
    expect(labels).toContain("Integrations");
    expect(labels).toContain("Audit log");
  });

  it("a screen the role can't use shows a refusal, not the page", async () => {
    navigation.pathname = "/reports";
    shell("office_staff");
    renderWithQuery(<PortalShell>secret page</PortalShell>);
    expect(await screen.findByText("Not available for your role")).toBeInTheDocument();
    expect(screen.queryByText("secret page")).not.toBeInTheDocument();
  });

  it("suspended agencies get the read-only banner", async () => {
    shell("manager", {
      tenant_status: "suspended", suspended_at: "2026-10-20T05:00:00Z", suspension_reason: "Unpaid invoice",
    });
    renderWithQuery(<PortalShell>page</PortalShell>);
    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent("Your agency's account is suspended");
    expect(banner).toHaveTextContent("Reason: Unpaid invoice");
  });

  it("platform support sees the support banner", async () => {
    shell("support", {}, { platform_role: "support", memberships: [] });
    renderWithQuery(<PortalShell>page</PortalShell>);
    expect(await screen.findByText(/Platform support view: read-only/)).toBeInTheDocument();
    expect(await menuLabels()).not.toContain("Integrations");
  });

  it("users with several agencies and none chosen go to the agency choice", async () => {
    shell("manager", {}, { active_tenant_id: null });
    renderWithQuery(<PortalShell>page</PortalShell>);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/select-agency?next=%2Fhome"));
  });

  it("signed-out visitors go to sign-in", async () => {
    mockApi([{ method: "GET", path: "/api/auth/me", status: 403, body: {} }]);
    renderWithQuery(<PortalShell>page</PortalShell>);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login?next=%2Fhome"));
  });
});

describe("Login", () => {
  it("refuses platform staff and signs them out again", async () => {
    const calls = mockApi([
      { method: "GET", path: "/api/auth/me", status: 403, body: {} },
      {
        method: "POST",
        path: "/api/auth/login",
        body: authState({ platform_role: "super_admin", memberships: [], active_tenant_id: null, otp_verified: true }),
      },
      { method: "POST", path: "/api/auth/logout", status: 204 },
    ]);
    renderWithQuery(<LoginPage />);
    await userEvent.type(screen.getByLabelText(/Email/), "admin@acube.test");
    await userEvent.type(screen.getByLabelText(/Password/), "super-secret-passphrase");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This portal is for client agencies");
    await waitFor(() => expect(calls.some((c) => c.path === "/api/auth/logout")).toBe(true));
  });

  it("sends an owner to two-factor set-up", async () => {
    mockApi([
      { method: "GET", path: "/api/auth/me", status: 403, body: {} },
      { method: "POST", path: "/api/auth/login", body: authState({ otp_setup_required: true }) },
    ]);
    renderWithQuery(<LoginPage />);
    await userEvent.type(screen.getByLabelText(/Email/), "owner@agency.test");
    await userEvent.type(screen.getByLabelText(/Password/), "owner-password-26");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/two-factor?next=%2Fhome"));
  });
});

function home(overrides: Record<string, unknown> = {}) {
  return {
    date: "2026-10-28",
    tomorrow: "2026-10-29",
    tomorrow_counts: {
      total: 95, confirmed: 61, reschedule: 4, not_available: 5, no_response: 11, awaiting_reply: 7,
      needs_review: 6, not_reminded_yet: 1,
    },
    follow_up: { open: 31, oldest_minutes: 2950, by_ageing: { amber: 0, red: 2 } },
    no_date: 47,
    alerts: [{ code: "no_live_template", severity: "warn" }],
    sent_today: 92,
    daily_send_cap: 5000,
    checklist: null,
    generated_at: "2026-10-28T09:00:00Z",
    ...overrides,
  };
}

function tile(label: string) {
  return screen.getAllByTestId("home-tile").find((el) => el.dataset.label === label)!;
}

describe("Home", () => {
  it("shows tomorrow's counts, the queue, bookings without a date and alerts", async () => {
    mockApi([
      { method: "GET", path: "/api/portal/home", body: home() },
      { method: "GET", path: "/api/portal/config", body: portalConfig() },
    ]);
    renderWithQuery(<HomeScreen />);
    await screen.findByText(/Tomorrow, 29 Oct 2026/);
    expect(screen.getByText("95 cylinder delivery bookings")).toBeInTheDocument();
    expect(tile("Confirmed")).toHaveTextContent("61");
    expect(tile("Confirmed")).toHaveAttribute("href", "/bookings?date=2026-10-29&outcome=confirmed");
    expect(tile("Awaiting reply")).toHaveTextContent("7");
    expect(tile("Needs review")).toHaveTextContent("6");
    expect(tile("Follow-up queue")).toHaveTextContent("31 open");
    expect(tile("Follow-up queue")).toHaveTextContent("Oldest waiting 2 d");
    expect(tile("No planned delivery date yet")).toHaveTextContent("47");
    expect(tile("Sending today")).toHaveTextContent("92 of 5,000");
    expect(screen.getByRole("status")).toHaveTextContent("No WhatsApp template is live yet");
    expect(screen.queryByRole("region", { name: "Get started" })).not.toBeInTheDocument();
  });

  it("owners get the checklist and can tick or skip items", async () => {
    const checklist = {
      complete: false,
      items: [
        { key: "agency_details", done: false, skipped: false, can_skip: false, manual: true },
        { key: "areas", done: true, skipped: false, can_skip: false, manual: false },
        { key: "reminder_settings", done: false, skipped: false, can_skip: false, manual: true },
        { key: "import_subscribers", done: true, skipped: false, can_skip: false, manual: false },
        { key: "import_bookings", done: false, skipped: false, can_skip: false, manual: false },
        { key: "invite_team", done: false, skipped: false, can_skip: false, manual: false },
        { key: "auto_top_up", done: false, skipped: false, can_skip: true, manual: true },
      ],
    };
    const calls = mockApi([
      { method: "GET", path: "/api/portal/home", body: home({ checklist }) },
      { method: "GET", path: "/api/portal/config", body: portalConfig({ role: "owner" }) },
      { method: "POST", path: "/api/portal/checklist", body: checklist },
    ]);
    renderWithQuery(<HomeScreen />);
    const region = await screen.findByRole("region", { name: "Get started" });
    expect(within(region).getByText("2 of 7 done")).toBeInTheDocument();
    const details = region.querySelector('[data-item="agency_details"]') as HTMLElement;
    await userEvent.click(within(details).getByRole("button", { name: "Mark done" }));
    const topUp = region.querySelector('[data-item="auto_top_up"]') as HTMLElement;
    expect(within(topUp).queryByRole("button", { name: "Mark done" })).not.toBeInTheDocument();
    await userEvent.click(within(topUp).getByRole("button", { name: "Skip" }));
    await waitFor(() =>
      expect(calls.filter((c) => c.path === "/api/portal/checklist").map((c) => c.body)).toEqual([
        { item: "agency_details", action: "done" },
        { item: "auto_top_up", action: "skip" },
      ]),
    );
  });

  it("hides the checklist once everything is done or skipped", async () => {
    mockApi([
      { method: "GET", path: "/api/portal/home", body: home({ checklist: { complete: true, items: [] } }) },
      { method: "GET", path: "/api/portal/config", body: portalConfig({ role: "owner" }) },
    ]);
    renderWithQuery(<HomeScreen />);
    await screen.findByText(/Tomorrow, 29 Oct 2026/);
    expect(screen.queryByRole("region", { name: "Get started" })).not.toBeInTheDocument();
  });
});

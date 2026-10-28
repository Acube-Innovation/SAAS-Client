import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockApi, navigation, portalConfig, renderWithQuery } from "@/test/utils";

import { CommunicationLog } from "./log/communication-log";
import { ReportsScreen } from "./reports/reports-screen";

beforeEach(() => {
  navigation.search = new URLSearchParams();
});
afterEach(() => {
  vi.useRealTimers();
});

const call = (overrides = {}) => ({
  id: "a1", channel: "voice", sent_at: "2026-10-28T08:00:00Z", delivery_status: "answered", failure_reason: "",
  cost_paise: 150, booking_id: "b1", booking_reference: "BK1", subscriber_id: "s1", customer_name: "Asha Menon",
  mobile_number: "+919847012345", area_name: "Edappally",
  responses: [{ id: "r1", received_at: "2026-10-28T08:00:40Z", raw_text: "", button_payload: "", transcript: "Agent: Will someone be home? Customer: Yes.",
    outcome: "confirmed", confidence: 0.95, has_recording: true, recording_expired: false }],
  ...overrides,
});
const message = call({
  id: "a2", channel: "whatsapp", delivery_status: "failed", failure_reason: "Number not on WhatsApp", cost_paise: 85, responses: [],
});
const page = (results: unknown[]) => ({ count: results.length, next: null, previous: null, results });

describe("Communication log", () => {
  it("lists messages and calls and plays a recording through a 5-minute link", async () => {
    navigation.pathname = "/communication-log";
    const expiresAt = new Date(Date.now() + 300_000).toISOString();
    const calls = mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig() },
      { method: "GET", path: "/api/portal/communication-log", body: page([call(), message]) },
      { method: "GET", path: "/api/portal/communication-log/a1/recording", body: { url: "http://localhost:8333/b/recordings/t1/a1.wav?X-Amz-Expires=300", expires_in: 300, expires_at: expiresAt } },
    ]);
    renderWithQuery(<CommunicationLog />);
    const failed = (await screen.findAllByRole("listitem")).find((li) => li.dataset.entry === "a2")!;
    expect(failed).toHaveTextContent("Number not on WhatsApp");
    expect(failed).toHaveTextContent("₹0.85");
    expect(screen.getByRole("link", { name: "Download CSV" })).toHaveAttribute("href", "/api/portal/reports/message-log/export?");

    await userEvent.click(screen.getByText("Transcript"));
    expect(screen.getByText(/Customer: Yes\./)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Play recording" }));
    const audio = await screen.findByLabelText("Call recording");
    expect(audio).toHaveAttribute("src", expect.stringContaining("X-Amz-Expires=300"));
    expect(screen.getByText(/Secure link, expires in (299|300) s/)).toBeInTheDocument();
    expect(calls.filter((c) => c.path.endsWith("/recording"))).toHaveLength(1);
  });

  it("drops the player when the link runs out; Play again fetches a new one", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    navigation.pathname = "/communication-log";
    const calls = mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig({ role: "owner" }) },
      { method: "GET", path: "/api/portal/communication-log", body: page([call()]) },
      { method: "GET", path: "/api/portal/communication-log/a1/recording", body: { url: "http://x/a1.wav", expires_in: 300, expires_at: new Date(Date.now() + 300_000).toISOString() } },
    ]);
    renderWithQuery(<CommunicationLog />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await screen.findByRole("button", { name: "Play recording" }));
    expect(await screen.findByLabelText("Call recording")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(301_000);
    });
    expect(screen.queryByLabelText("Call recording")).not.toBeInTheDocument();
    expect(screen.getByText("The 5-minute link has expired.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Play again" }));
    await waitFor(() => expect(calls.filter((c) => c.path.endsWith("/recording"))).toHaveLength(2));
  });

  it("office staff read transcripts but get no player; old recordings say they're deleted", async () => {
    navigation.pathname = "/communication-log";
    mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig({ role: "office_staff" }) },
      {
        method: "GET", path: "/api/portal/communication-log",
        body: page([call(), call({ id: "a3", responses: [{ ...call().responses[0], id: "r3", recording_expired: true }] })]),
      },
    ]);
    renderWithQuery(<CommunicationLog />);
    expect(await screen.findByText("Recordings: owner and managers only.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Play recording" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Download CSV" })).not.toBeInTheDocument();
    expect(screen.getByText("Recording deleted after 90 days.")).toBeInTheDocument();
  });

  it("sends the filters to the API", async () => {
    navigation.pathname = "/communication-log";
    navigation.search = new URLSearchParams("channel=voice&has_recording=true&date_from=2026-10-01");
    const calls = mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig() },
      { method: "GET", path: "/api/portal/communication-log", body: page([]) },
    ]);
    renderWithQuery(<CommunicationLog />);
    expect(await screen.findByText("No messages or calls match these filters.")).toBeInTheDocument();
    const query = new URLSearchParams(calls.find((c) => c.path === "/api/portal/communication-log")!.search);
    expect([query.get("channel"), query.get("has_recording"), query.get("date_from")]).toEqual(["voice", "true", "2026-10-01"]);
    expect(screen.getByRole("checkbox", { name: "Calls with recordings" })).toBeChecked();
  });
});

describe("Reports", () => {
  const results = {
    date_from: "2026-10-22", date_to: "2026-10-28", sent: 129, delivered: 123, failed: 6, replied: 87, calls: 28, calls_answered: 19,
    cost_paise: 4695, reminded: 129,
    outcomes: [
      { outcome: "confirmed", count: 74, share: 57.4 },
      { outcome: "no_response", count: 17, share: 13.2 },
      { outcome: "awaiting", count: 7, share: 5.4 },
    ],
  };

  it("shows reminder results with the last 7 days and a CSV link with the same filters", async () => {
    navigation.pathname = "/reports";
    navigation.search = new URLSearchParams("area=a1");
    const calls = mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig() },
      { method: "GET", path: "/api/portal/areas", body: [{ id: "a1", name: "Edappally" }] },
      { method: "GET", path: "/api/portal/reports/reminder-results", body: results },
    ]);
    renderWithQuery(<ReportsScreen />);
    const tile = async (label: string) => (await screen.findAllByTestId("report-tile")).find((el) => el.dataset.label === label)!;
    expect(await tile("Messages sent")).toHaveTextContent("129");
    expect(await tile("Delivered")).toHaveTextContent("95.3%");
    expect(await tile("Cost")).toHaveTextContent("₹46.95");
    const confirmed = document.querySelector("tr[data-outcome=confirmed]")!;
    expect(confirmed).toHaveTextContent("74");
    expect(confirmed).toHaveTextContent("57.4%");
    expect(document.querySelector("tr[data-outcome=awaiting]")).toHaveTextContent("No answer yet");
    const query = new URLSearchParams(calls.find((c) => c.path.endsWith("reminder-results"))!.search);
    expect(query.get("area")).toBe("a1");
    expect(query.get("date_from")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const csv = screen.getByRole("link", { name: "Download CSV" }).getAttribute("href")!;
    expect(csv).toMatch(/^\/api\/portal\/reports\/reminder-results\/export\?/);
    expect(new URLSearchParams(csv.split("?")[1]).get("area")).toBe("a1");
  });

  it("shows follow-up ageing per outcome and highlights items over 3 days", async () => {
    navigation.pathname = "/reports";
    navigation.search = new URLSearchParams("report=follow-up-ageing");
    mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig() },
      { method: "GET", path: "/api/portal/areas", body: [] },
      {
        method: "GET", path: "/api/portal/reports/follow-up-ageing",
        body: { total: 12, generated_at: "2026-10-28T12:00:00Z",
          buckets: [{ bucket: "under_4h", count: 2 }, { bucket: "4_to_24h", count: 7 }, { bucket: "1_to_3_days", count: 1 }, { bucket: "over_3_days", count: 2 }],
          by_outcome: [{ outcome: "no_response", total: 12, under_4h: 2, "4_to_24h": 7, "1_to_3_days": 1, over_3_days: 2 }] },
      },
    ]);
    renderWithQuery(<ReportsScreen />);
    const row = await waitFor(() => {
      const found = document.querySelector("tr[data-outcome=no_response]");
      expect(found).not.toBeNull();
      return found!;
    });
    const cells = within(row as HTMLElement).getAllByRole("cell");
    expect(cells.map((c) => c.textContent)).toEqual(["No response", "2", "7", "1", "2", "12"]);
    expect(cells[4]).toHaveClass("text-red-700");
  });

  it("shows subscriber health by area", async () => {
    navigation.pathname = "/reports";
    navigation.search = new URLSearchParams("report=subscriber-health");
    mockApi([
      { method: "GET", path: "/api/portal/config", body: portalConfig() },
      { method: "GET", path: "/api/portal/areas", body: [] },
      {
        method: "GET", path: "/api/portal/reports/subscriber-health",
        body: { total: 296, no_consent: 31, opted_out: 8, failed_numbers: 6, by_area: [
          { area: "Edappally", total: 53, no_consent: 4, opted_out: 1, failed_numbers: 1 },
          { area: null, total: 9, no_consent: 0, opted_out: 1, failed_numbers: 0 },
        ] },
      },
    ]);
    renderWithQuery(<ReportsScreen />);
    expect(await screen.findByText("Edappally")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "No area" })).toBeInTheDocument();
    expect(screen.getByText("10.5%")).toBeInTheDocument();
  });
});

import fs from "node:fs";

import { type FullConfig, request } from "@playwright/test";

import { AUTH_DIR, authFile, manage, PASSWORD, ROLES, totp, unique } from "./support";

const SEED_EMAIL = { owner: "owner", manager: "manager", office_staff: "staff" } as const;

/**
 * Seed a fresh demo gas agency for this run (seed_demo: subscribers, bookings, outcomes, jobs,
 * follow-ups) and sign in its owner (with real 2FA), manager and office staff through the portal.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]!.use.baseURL!;
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const name = `E2E Portal ${unique()}`;
  manage(`seed_demo --name "${name}" --subscribers 200 --email-domain e2e.test --password-stdin`, `${PASSWORD}\n`);
  const slug = name.toLowerCase().replaceAll(" ", "-");

  for (const role of ROLES) {
    const email = `${SEED_EMAIL[role]}@${slug}.e2e.test`;
    const api = await request.newContext({ baseURL });
    await api.get("/api/auth/csrf");
    const csrf = async () => ({
      "X-CSRFToken": (await api.storageState()).cookies.find((c) => c.name === "csrftoken")?.value ?? "",
    });
    const login = await api.post("/api/auth/login", { data: { email, password: PASSWORD }, headers: await csrf() });
    if (!login.ok()) throw new Error(`login ${email}: ${login.status()} ${await login.text()}`);
    if ((await login.json()).otp_setup_required) {
      const setup = await (await api.post("/api/auth/otp/setup", { headers: await csrf() })).json();
      const confirm = await api.post("/api/auth/otp/confirm", {
        data: { otp_code: totp(setup.secret) },
        headers: await csrf(),
      });
      if (!confirm.ok()) throw new Error(`2FA ${email}: ${confirm.status()} ${await confirm.text()}`);
    }
    await api.storageState({ path: authFile(role) });
    await api.dispose();
  }
  fs.writeFileSync(`${AUTH_DIR}/agency.txt`, name);
}

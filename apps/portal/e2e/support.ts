import { execSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const AUTH_DIR = path.join(HERE, ".auth");
export const PASSWORD = "e2e-portal-passphrase-2026";
export const ROLES = ["owner", "manager", "office_staff"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Run a Django management command in the backend (SAAS-Admin). Set E2E_MANAGE, e.g.
 * "docker compose exec -T api python manage.py" with E2E_MANAGE_CWD=<SAAS-Admin checkout>.
 */
export function manage(args: string, input?: string): string {
  const command = process.env.E2E_MANAGE ?? "docker compose exec -T api python manage.py";
  const cwd = process.env.E2E_MANAGE_CWD ?? path.resolve(HERE, "../../../../SAAS-Admin");
  return execSync(`${command} ${args}`, { cwd, input, encoding: "utf8" });
}

/** RFC 6238 TOTP for a hex key (django-otp's TOTPDevice.key, returned by /api/auth/otp/setup). */
export function totp(hexKey: string, offset = 0): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offset));
  const hmac = crypto.createHmac("sha1", Buffer.from(hexKey, "hex")).update(counter).digest();
  const at = hmac[hmac.length - 1]! & 0xf;
  return String((hmac.readUInt32BE(at) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

export const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

export const authFile = (role: Role) => path.join(AUTH_DIR, `${role}.json`);

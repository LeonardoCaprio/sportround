import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const SHARE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createHostToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashHostToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatches(token: string | undefined, expectedHash: string): boolean {
  if (!token) return false;
  const actual = Buffer.from(hashHostToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createShareCode(length = 10): string {
  const bytes = randomBytes(length);
  return [...bytes].map((byte) => SHARE_ALPHABET[byte % SHARE_ALPHABET.length]).join("");
}

export function hostCookieName(sessionId: string): string {
  return `sr_host_${sessionId.replaceAll("-", "")}`;
}

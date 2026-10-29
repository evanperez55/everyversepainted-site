import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeEmail, signToken, verifyToken } from "../src/index.js";

const SECRET = "test-secret-not-real";

test("normalizeEmail accepts real addresses and lowercases them", () => {
  assert.equal(normalizeEmail("  Evan@Example.COM "), "evan@example.com");
  assert.equal(normalizeEmail("not-an-email"), null);
  assert.equal(normalizeEmail("a@b"), null);
  assert.equal(normalizeEmail(""), null);
});

test("a signed token round-trips to its email before expiry", async () => {
  const t = await signToken("evan@example.com", Date.now() + 60_000, SECRET);
  assert.equal(await verifyToken(t, SECRET), "evan@example.com");
});

test("expired tokens are rejected", async () => {
  const t = await signToken("evan@example.com", Date.now() - 1, SECRET);
  assert.equal(await verifyToken(t, SECRET), null);
});

test("tampered or foreign-key tokens are rejected", async () => {
  const t = await signToken("evan@example.com", Date.now() + 60_000, SECRET);
  const [payload, sig] = t.split(".");
  const forged = Buffer.from(`attacker@example.com|${Date.now() + 60_000}`).toString("base64url");
  assert.equal(await verifyToken(`${forged}.${sig}`, SECRET), null);
  assert.equal(await verifyToken(t, "other-secret"), null);
  assert.equal(await verifyToken(`${payload}.`, SECRET), null);
  assert.equal(await verifyToken("garbage", SECRET), null);
});

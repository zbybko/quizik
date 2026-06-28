import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLAN_LIMITS, ANON_DAILY_LIMIT,
  upsertUser, setUserPlan, setUserPlanByStripeCustomer,
  getUserUsageToday, incrementUserUsage,
} from "../src/db.ts";

/**
 * Minimal in-memory fake of the D1 surface db.ts uses. It records every
 * run()/first() call's SQL + bound params so tests can assert on them, and
 * returns canned results from a queue for first().
 */
function makeDb(firstResults: unknown[] = []) {
  const runs: { sql: string; binds: unknown[] }[] = [];
  const firsts: { sql: string; binds: unknown[] }[] = [];
  const queue = [...firstResults];
  const db = {
    runs,
    firsts,
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt = {
        bind(...v: unknown[]) { binds = v; return stmt; },
        async run() { runs.push({ sql, binds }); return { success: true }; },
        async first() { firsts.push({ sql, binds }); return queue.shift() ?? null; },
        async all() { return { results: [] as unknown[] }; },
      };
      return stmt;
    },
  };
  return db;
}

test("plan limits: free is capped, pro is effectively unlimited", () => {
  assert.equal(PLAN_LIMITS.free, 20);
  assert.ok(PLAN_LIMITS.pro >= 99999);
  assert.equal(ANON_DAILY_LIMIT, 20);
});

test("upsertUser inserts with the given default plan and returns the user", async () => {
  const user = { id: "u1", email: "a@b.c", plan: "pro", stripe_customer_id: null, created_at: 0 };
  const db = makeDb([user]);
  const res = await upsertUser(db as never, "u1", "a@b.c", "pro");

  assert.deepEqual(res, user);
  assert.match(db.runs[0].sql, /INSERT INTO users/);
  assert.deepEqual(db.runs[0].binds, ["u1", "a@b.c", "pro"]); // defaultPlan flows into the insert
});

test("upsertUser defaults to free plan when not specified", async () => {
  const db = makeDb([{ id: "u1", email: "a@b.c", plan: "free", stripe_customer_id: null, created_at: 0 }]);
  await upsertUser(db as never, "u1", "a@b.c");
  assert.equal(db.runs[0].binds[2], "free");
});

test("setUserPlan binds plan, stripe customer (or null), and user id", async () => {
  const db = makeDb();
  await setUserPlan(db as never, "u1", "pro");
  assert.deepEqual(db.runs[0].binds, ["pro", null, "u1"]);

  const db2 = makeDb();
  await setUserPlan(db2 as never, "u1", "pro", "cus_123");
  assert.deepEqual(db2.runs[0].binds, ["pro", "cus_123", "u1"]);
});

test("setUserPlanByStripeCustomer downgrades by customer id", async () => {
  const db = makeDb();
  await setUserPlanByStripeCustomer(db as never, "cus_123", "free");
  assert.match(db.runs[0].sql, /WHERE stripe_customer_id = \?/);
  assert.deepEqual(db.runs[0].binds, ["free", "cus_123"]);
});

test("getUserUsageToday returns the stored count, or 0 when no row", async () => {
  assert.equal(await getUserUsageToday(makeDb([{ count: 7 }]) as never, "u1"), 7);
  assert.equal(await getUserUsageToday(makeDb([]) as never, "u1"), 0);
});

test("incrementUserUsage upserts usage for the user and today", async () => {
  const db = makeDb();
  await incrementUserUsage(db as never, "u1");
  const today = new Date().toISOString().slice(0, 10);
  assert.match(db.runs[0].sql, /INSERT INTO usage/);
  assert.equal(db.runs[0].binds[0], "u1");
  assert.equal(db.runs[0].binds[1], today);
});

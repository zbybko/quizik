/**
 * D1 database helpers — usage tracking and user management.
 */

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean }>;
}

export interface User {
  id: string;
  email: string;
  plan: "free" | "pro";
  stripe_customer_id: string | null;
  created_at: number;
}

export interface UsageRow {
  count: number;
}

// ── Plan limits ──────────────────────────────────────────────────────────────

export const PLAN_LIMITS: Record<string, number> = {
  free: 20,   // requests per day
  pro: 99999, // effectively unlimited
};

export const ANON_DAILY_LIMIT = 20; // anonymous device limit per day

// ── User helpers ─────────────────────────────────────────────────────────────

export async function getUser(db: D1Database, userId: string): Promise<User | null> {
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first<User>();
}

export async function upsertUser(
  db: D1Database,
  id: string,
  email: string,
  defaultPlan: "free" | "pro" = "free"
): Promise<User> {
  // `defaultPlan` only applies on first insert; existing users keep their plan
  // (so a manually-set dev plan survives re-syncs).
  await db
    .prepare(
      `INSERT INTO users (id, email, plan) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET email = excluded.email`
    )
    .bind(id, email, defaultPlan)
    .run();

  return (await getUser(db, id))!;
}

export async function setUserPlan(
  db: D1Database,
  userId: string,
  plan: "free" | "pro",
  stripeCustomerId?: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE users SET plan = ?, stripe_customer_id = COALESCE(?, stripe_customer_id) WHERE id = ?`
    )
    .bind(plan, stripeCustomerId ?? null, userId)
    .run();
}

export async function setUserPlanByStripeCustomer(
  db: D1Database,
  stripeCustomerId: string,
  plan: "free" | "pro"
): Promise<void> {
  await db
    .prepare(`UPDATE users SET plan = ? WHERE stripe_customer_id = ?`)
    .bind(plan, stripeCustomerId)
    .run();
}

// ── Usage helpers ─────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

export async function getUserUsageToday(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare("SELECT count FROM usage WHERE user_id = ? AND date = ?")
    .bind(userId, today())
    .first<UsageRow>();
  return row?.count ?? 0;
}

export async function incrementUserUsage(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO usage (user_id, date, count) VALUES (?, ?, 1)
       ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1`
    )
    .bind(userId, today())
    .run();
}

export async function getAnonUsageToday(db: D1Database, deviceId: string): Promise<number> {
  const row = await db
    .prepare("SELECT count FROM anon_usage WHERE device_id = ? AND date = ?")
    .bind(deviceId, today())
    .first<UsageRow>();
  return row?.count ?? 0;
}

export async function incrementAnonUsage(db: D1Database, deviceId: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO anon_usage (device_id, date, count) VALUES (?, ?, 1)
       ON CONFLICT(device_id, date) DO UPDATE SET count = count + 1`
    )
    .bind(deviceId, today())
    .run();
}

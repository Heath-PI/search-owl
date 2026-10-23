const COUNTER_KEY = "page-visits";

class PostgresVisitStore {
  constructor(pool) {
    this.pool = pool;
    this.ready = null;
  }

  async initialize() {
    if (!this.ready) {
      this.ready = this.pool.query(`
        CREATE TABLE IF NOT EXISTS public_visit_counters (
          counter_key TEXT PRIMARY KEY,
          visit_count BIGINT NOT NULL CHECK (visit_count >= 0)
        )
      `);
    }
    await this.ready;
  }

  async increment() {
    await this.initialize();
    const result = await this.pool.query(
      `INSERT INTO public_visit_counters (counter_key, visit_count)
       VALUES ($1, 1)
       ON CONFLICT (counter_key) DO UPDATE
       SET visit_count = public_visit_counters.visit_count + 1
       RETURNING visit_count::text`,
      [COUNTER_KEY],
    );
    return Number(result.rows[0].visit_count);
  }

  async current() {
    await this.initialize();
    const result = await this.pool.query(
      "SELECT visit_count::text FROM public_visit_counters WHERE counter_key = $1",
      [COUNTER_KEY],
    );
    return result.rowCount ? Number(result.rows[0].visit_count) : 0;
  }
}

class UnavailableVisitStore {
  async increment() {
    throw new Error("Durable visit storage is not configured");
  }

  async current() {
    throw new Error("Durable visit storage is not configured");
  }
}

function createVisitStore(env = process.env, PoolClass) {
  const connectionString = String(env.DATABASE_URL || "").trim();
  if (!connectionString) return new UnavailableVisitStore();
  const Pool = PoolClass || require("pg").Pool;
  return new PostgresVisitStore(
    new Pool({
      connectionString,
      ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
      max: 3,
    }),
  );
}

function countMessage(count) {
  return Number.isSafeInteger(count) && count >= 0
    ? `Search Owl has been visited ${count.toLocaleString("en-US")} times.`
    : "Search Owl's visit count is temporarily unavailable.";
}

module.exports = { PostgresVisitStore, UnavailableVisitStore, createVisitStore, countMessage };

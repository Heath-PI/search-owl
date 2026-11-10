const COUNTER_KEY = "page-visits";
const TIMEZONE = "America/New_York";
const UNKNOWN_COUNTRY = "Unknown";
const ISO_COUNTRIES = new Set((
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" "));

function dayInTimezone(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function previousDay(day) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function normalizeCountry(value) {
  const code = String(value || "").trim().toUpperCase();
  return ISO_COUNTRIES.has(code) ? code : UNKNOWN_COUNTRY;
}

class PostgresVisitStore {
  constructor(pool, now = () => new Date()) {
    this.pool = pool;
    this.now = now;
    this.ready = null;
  }

  async initialize() {
    if (!this.ready) this.ready = this.pool.query(`
      CREATE TABLE IF NOT EXISTS public_visit_counters (
        counter_key TEXT PRIMARY KEY,
        visit_count BIGINT NOT NULL CHECK (visit_count >= 0)
      );
      CREATE TABLE IF NOT EXISTS public_visit_days (
        visit_day DATE PRIMARY KEY,
        visit_count BIGINT NOT NULL CHECK (visit_count >= 0)
      );
      CREATE TABLE IF NOT EXISTS public_search_days (
        search_day DATE NOT NULL,
        country_code TEXT NOT NULL CHECK (country_code = 'Unknown' OR country_code ~ '^[A-Z]{2}$'),
        search_count BIGINT NOT NULL CHECK (search_count >= 0),
        PRIMARY KEY (search_day, country_code)
      )
    `);
    await this.ready;
  }

  async incrementVisit(day = dayInTimezone(this.now())) {
    await this.initialize();
    const result = await this.pool.query(
      `WITH total AS (
         INSERT INTO public_visit_counters (counter_key, visit_count) VALUES ($1, 1)
         ON CONFLICT (counter_key) DO UPDATE
         SET visit_count = public_visit_counters.visit_count + 1
         RETURNING visit_count
       ), daily AS (
         INSERT INTO public_visit_days (visit_day, visit_count) VALUES ($2::date, 1)
         ON CONFLICT (visit_day) DO UPDATE
         SET visit_count = public_visit_days.visit_count + 1
         RETURNING visit_count
       )
       SELECT total.visit_count::text AS total_count, daily.visit_count::text AS daily_count
       FROM total CROSS JOIN daily`,
      [COUNTER_KEY, day],
    );
    return { count: Number(result.rows[0].total_count), today: Number(result.rows[0].daily_count), day, timezone: TIMEZONE };
  }

  async increment() { return (await this.incrementVisit()).count; }

  async incrementSearch(country = UNKNOWN_COUNTRY, day = dayInTimezone(this.now())) {
    await this.initialize();
    const normalized = normalizeCountry(country);
    const result = await this.pool.query(
      `INSERT INTO public_search_days (search_day, country_code, search_count) VALUES ($1::date, $2, 1)
       ON CONFLICT (search_day, country_code) DO UPDATE
       SET search_count = public_search_days.search_count + 1
       RETURNING search_count::text`,
      [day, normalized],
    );
    return Number(result.rows[0].search_count);
  }

  async current() {
    await this.initialize();
    const result = await this.pool.query(
      "SELECT visit_count::text FROM public_visit_counters WHERE counter_key = $1", [COUNTER_KEY],
    );
    return result.rowCount ? Number(result.rows[0].visit_count) : 0;
  }

  async summary(day = dayInTimezone(this.now())) {
    await this.initialize();
    const yesterday = previousDay(day);
    const [totalResult, visitsResult, searchesResult] = await Promise.all([
      this.pool.query("SELECT visit_count::text FROM public_visit_counters WHERE counter_key = $1", [COUNTER_KEY]),
      this.pool.query(
        "SELECT visit_day::text AS day, visit_count::text AS count FROM public_visit_days WHERE visit_day IN ($1::date, $2::date)",
        [day, yesterday],
      ),
      this.pool.query(
        `SELECT search_day::text AS day, country_code AS country, search_count::text AS count
         FROM public_search_days WHERE search_day IN ($1::date, $2::date)
         ORDER BY search_day DESC, search_count DESC, country_code`,
        [day, yesterday],
      ),
    ]);
    const visits = Object.fromEntries(visitsResult.rows.map((row) => [row.day, Number(row.count)]));
    return {
      count: totalResult.rowCount ? Number(totalResult.rows[0].visit_count) : 0,
      timezone: TIMEZONE,
      visits: { today: visits[day] || 0, yesterday: visits[yesterday] || 0, dates: { today: day, yesterday } },
      searches: searchesResult.rows.map((row) => ({ day: row.day, country: row.country, count: Number(row.count) })),
      note: "Daily buckets begin when this feature is deployed; earlier lifetime visits are not backfilled.",
    };
  }
}

class UnavailableVisitStore {
  async increment() { throw new Error("Durable visit storage is not configured"); }
  async incrementVisit() { throw new Error("Durable visit storage is not configured"); }
  async incrementSearch() { throw new Error("Durable visit storage is not configured"); }
  async current() { throw new Error("Durable visit storage is not configured"); }
  async summary() { throw new Error("Durable visit storage is not configured"); }
}

function createVisitStore(env = process.env, PoolClass) {
  const connectionString = String(env.DATABASE_URL || "").trim();
  if (!connectionString) return new UnavailableVisitStore();
  const Pool = PoolClass || require("pg").Pool;
  return new PostgresVisitStore(new Pool({
    connectionString,
    ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    max: 3,
  }));
}

function countMessage(count) {
  return Number.isSafeInteger(count) && count >= 0
    ? `Search Owl has been visited ${count.toLocaleString("en-US")} times.`
    : "Search Owl's visit count is temporarily unavailable.";
}

module.exports = {
  PostgresVisitStore, UnavailableVisitStore, createVisitStore, countMessage,
  dayInTimezone, previousDay, normalizeCountry, TIMEZONE, UNKNOWN_COUNTRY,
};

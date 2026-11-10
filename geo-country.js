const fs = require("node:fs");
const path = require("node:path");
const maxmind = require("maxmind");
const { normalizeCountry, UNKNOWN_COUNTRY } = require("./visit-counter");

const DATABASE_PATH = path.join(__dirname, "geo-data", "user-country.mmdb");

class OfflineCountryResolver {
  constructor(databasePath = DATABASE_PATH) {
    this.reader = fs.existsSync(databasePath)
      ? new maxmind.Reader(fs.readFileSync(databasePath))
      : null;
  }

  lookup(ip) {
    if (!this.reader || !maxmind.validate(String(ip || ""))) return UNKNOWN_COUNTRY;
    const match = this.reader.get(String(ip));
    return normalizeCountry(match?.country_code || match?.country?.iso_code);
  }
}

function sourceCountry(req, resolver, renderEnvironment = process.env.RENDER) {
  if (String(renderEnvironment).toLowerCase() !== "true") return UNKNOWN_COUNTRY;
  if (!req.headers["cf-ray"] || !req.headers["cf-connecting-ip"]) return UNKNOWN_COUNTRY;
  return resolver.lookup(req.headers["cf-connecting-ip"]);
}

module.exports = { OfflineCountryResolver, sourceCountry, DATABASE_PATH };

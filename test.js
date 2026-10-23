const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { providers, capabilities, buildContext, sceneQueryAnchors, sceneImageMatches, photoOwlCatalog, renderHome, start } = require("./server");
const { PostgresVisitStore, UnavailableVisitStore, createVisitStore } = require("./visit-counter");

test("isolated package contains only approved deployable files", () => {
  const allowed = new Set([
    ".gitignore",
    "README.md",
    "farmers-markets-us.json",
    "favicon.ico",
    "icon-192.png",
    "icon-512.png",
    "index.html",
    "opensearch.xml",
    "owl-catalog.json",
    "package.json",
    "render.yaml",
    "search-owl-barn-owl-license.txt",
    "search-owl-barn-owl.jpg",
    "search-owl-icon.png",
    "server.js",
    "site.webmanifest",
    "scripts",
    "test.js",
    "visit-counter.js",
  ]);
  assert.deepEqual(
    fs.readdirSync(__dirname).filter((name) => ![".git", "node_modules"].includes(name)).sort(),
    [...allowed].sort(),
  );
});
test("page renders an aggregate visit message and a safe failure fallback", () => {
  assert.match(renderHome("<p>{{VISIT_COUNT_MESSAGE}}</p>", 1234), /1,234 times/);
  assert.match(renderHome("<p>{{VISIT_COUNT_MESSAGE}}</p>", null), /temporarily unavailable/);
});
test("PostgreSQL adapter initializes once and performs atomic aggregate increments", async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql: String(sql), params });
      if (/RETURNING/.test(sql)) return { rows: [{ visit_count: "42" }], rowCount: 1 };
      if (/SELECT/.test(sql)) return { rows: [{ visit_count: "42" }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
  const store = new PostgresVisitStore(pool);
  assert.equal(await store.increment(), 42);
  assert.equal(await store.current(), 42);
  assert.equal(calls.filter(({ sql }) => /CREATE TABLE/.test(sql)).length, 1);
  assert.match(calls.find(({ sql }) => /RETURNING/.test(sql)).sql, /ON CONFLICT[\s\S]*visit_count \+ 1/);
  assert.deepEqual(calls.find(({ sql }) => /RETURNING/.test(sql)).params, ["page-visits"]);
});
test("counter configuration and failure behavior do not collect visitor attributes", async () => {
  assert.ok(createVisitStore({}) instanceof UnavailableVisitStore);
  await assert.rejects(() => createVisitStore({}).increment(), /not configured/);
  const source = fs.readFileSync(path.join(__dirname, "visit-counter.js"), "utf8");
  assert.doesNotMatch(source, /user-agent|cookie|x-forwarded-for|remoteAddress|location/i);
});
test("homepage increments once while reads, health checks and icon assets do not", async (t) => {
  let count = 9;
  const store = { async increment() { return ++count; }, async current() { return count; } };
  const server = start({ visitStore: store, host: "127.0.0.1", port: 0 });
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Search Owl has been visited 10 times\./);
  assert.deepEqual(await (await fetch(`${base}/api/visits`)).json(), { count: 10 });
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.match((await fetch(`${base}/favicon.ico`)).headers.get("content-type"), /image\/x-icon/);
  assert.match((await fetch(`${base}/icon-192.png`)).headers.get("content-type"), /image\/png/);
  assert.match((await fetch(`${base}/site.webmanifest`)).headers.get("content-type"), /application\/manifest\+json/);
  assert.equal(count, 10);
});
test("manifest and page publish installable barn-owl icon references", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "site.webmanifest"), "utf8"));
  assert.match(html, /rel="manifest" href="\/site\.webmanifest"/);
  assert.match(html, /rel="icon" href="\/favicon\.ico"/);
  assert.match(html, /Add Search Owl to your desktop/);
  assert.deepEqual(manifest.icons.map(({ sizes }) => sizes), ["192x192", "512x512"]);
  for (const name of ["favicon.ico", "icon-192.png", "icon-512.png"])
    assert.ok(fs.statSync(path.join(__dirname, name)).size > 1000);
});
test("daily owl catalog contains distinct, attributed and classified species images", () => {
  const catalog = photoOwlCatalog();
  assert.equal(catalog.timezone, "America/New_York");
  assert.equal(catalog.count, catalog.owls.length);
  assert.equal(catalog.count, 235);
  assert.equal(catalog.owls.filter((owl) => owl.mediaType === "photograph").length, 196);
  assert.equal(catalog.owls.filter((owl) => owl.mediaType === "historical illustration").length, 39);
  const papuan = catalog.owls.find((owl) => owl.scientific === "Uroglaux dimorpha");
  assert.match(papuan.creator, /John Gould/);
  assert.equal(papuan.mediaType, "historical illustration");
  assert.equal(papuan.sourceDate, "1875");
  assert.match(papuan.sourceUrl, /Uroglaux_dimorpha\.jpg/);
  assert.equal(papuan.mediaNote, "Historical illustration shown for clarity; the freely reusable photograph we found is obscured by branches.");
  assert.equal(new Set(catalog.owls.map((owl) => owl.scientific)).size, catalog.count);
  assert.equal(new Set(catalog.owls.map((owl) => owl.fileName.toLowerCase())).size, catalog.count);
  for (const owl of catalog.owls) assert.ok(owl.name && owl.scientific && owl.imageUrl && owl.sourceUrl && owl.creator && owl.license && owl.mediaType);
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.match(html, /America\/New_York/);
  assert.match(html, /Choose an owl/);
  assert.match(html, /owl-catalog\.json/);
  assert.match(html, /no other species is silently substituted/);
  assert.match(html, /token !== owlLoadToken/);
  const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  assert.match(server, /https:\/\/thumb\.wikimedia\.org/);
});
test("context pictures reject document covers and require title relevance", () => {
  const anchors = sceneQueryAnchors("Vienna city landscape landmark");
  assert.deepEqual(anchors, ["vienna"]);
  assert.equal(sceneImageMatches({ title: "The American city.pdf", description: "Vienna bibliography" }, anchors), false);
  assert.equal(sceneImageMatches({ title: "Unrelated skyline.jpg", description: "generic city" }, anchors), false);
  assert.equal(sceneImageMatches({ title: "Porto bridge.jpg", categories: "Stockholm" }, anchors), false);
  assert.equal(sceneImageMatches({ title: "Vienna Ringstrasse.jpg", description: "Vienna, Austria" }, anchors), true);
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.match(html, /Context only · title match:/);
  assert.match(html, /source date/);
});
test("public page preserves approved identity and perched owl without the unwanted honorific", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.match(html, /Intensity is our priority/);
  assert.match(html, /featured owl image/);
  assert.match(html, /Created by Heath\./);
  assert.doesNotMatch(html, /Master Heath/i);
  assert.match(html, /We use Google Translate/);
  assert.doesNotMatch(
    html,
    /localhost page|C:\\Users|AppData|heathcore-manager/,
  );
});
test("public providers are bounded and credential-gated providers remain honest", () => {
  assert.equal(typeof providers.wikipedia, "function");
  assert.equal(typeof providers.duckduckgoInstantAnswers, "function");
  assert.equal(typeof providers.projectGutenberg, "function");
  assert.equal(typeof providers.internetArchive, "function");
  assert.equal(typeof providers.openLibrary, "function");
  assert.equal(typeof providers.crossref, "function");
  assert.equal(typeof providers.europePmc, "function");
  assert.equal(typeof providers.worldBankDocuments, "function");
  assert.equal(capabilities.openLibrary.mode, "anonymous-api");
  assert.equal(capabilities.crossref.mode, "anonymous-api");
  assert.equal(capabilities.europePmc.mode, "anonymous-api");
  assert.equal(capabilities.worldBankDocuments.mode, "anonymous-api");
  assert.equal(capabilities.europeana.mode, "credentials-required");
  assert.equal(capabilities.dpla.mode, "credentials-required");
  assert.equal(capabilities.troveAustralia.mode, "credentials-required");
  assert.equal(
    capabilities.googleTranslate.mode,
    "credential-ready-plus-handoff",
  );
});
test("browser integration and financial freshness claims remain honest", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const openSearch = fs.readFileSync(
    path.join(__dirname, "opensearch.xml"),
    "utf8",
  );
  assert.match(html, /application\/opensearchdescription\+xml/);
  assert.match(openSearch, /\?q=\{searchTerms\}/);
  assert.match(html, /does not redistribute NSE quotes/);
  assert.match(html, /no real-time feed is claimed/);
  assert.doesNotMatch(html, /every library|every exchange|all market data/i);
});
test("context follows math, space, government, economy and general queries", () => {
  assert.equal(buildContext("quadratic algebra").topic, "mathematics");
  assert.equal(buildContext("Mars space mission").topic, "space and astronomy");
  assert.equal(buildContext("NYC museums").topic, "cities and places");
  assert.equal(
    buildContext("Bangkok travel research").topic,
    "cities and places",
  );
  assert.equal(buildContext("Warsaw Poland museums").topic, "cities and places");
  assert.equal(buildContext("things to do in Reykjavík").topic, "cities and places");
  assert.equal(buildContext("Starfield gameplay").topic, "video games");
  assert.match(buildContext("Starfield gameplay").sceneQuery, /video game/);
  assert.equal(buildContext("designer clothing").topic, "clothing and fashion");
  assert.match(buildContext("designer clothing").visualNote, /does not imply endorsement/);
  const car = buildContext("2026 electric car prices and versions");
  assert.equal(car.topic, "automotive");
  assert.match(car.sceneQuery, /automobile vehicle road/);
  assert.match(car.visualNote, /does not identify a trim/);
  const property = buildContext("apartments for rent", [], "Berlin, Germany");
  assert.equal(property.topic, "real estate");
  assert.match(property.sceneQuery, /residential architecture/);
  assert.match(property.visualNote, /does not depict a listed property/);
  assert.equal(property.locationApplied, "Berlin, Germany");
  const hospital = buildContext("hospitals", [], "Madrid, Spain");
  assert.equal(hospital.topic, "hospitals");
  assert.match(hospital.sceneQuery, /hospital healthcare building/);
  assert.match(hospital.visualNote, /does not identify an actual facility/);
  assert.equal(hospital.locationApplied, "Madrid, Spain");
  const amenity = buildContext("movie theaters near me", [], "Warsaw, Poland");
  assert.equal(amenity.topic, "local places and amenities");
  assert.match(amenity.sceneQuery, /local shops exterior/);
  assert.equal(amenity.locationApplied, "Warsaw, Poland");
  assert.equal(buildContext("Paris protests today").topic, "news and current events");
  assert.equal(buildContext("Paris protests today").sceneQuery, null);
  assert.equal(
    buildContext("government public records").topic,
    "government and public policy",
  );
  assert.equal(
    buildContext("world economy inflation").topic,
    "economics and finance",
  );
  const general = buildContext("blue pottery", [
    { title: "Traditional Jaipur pottery museum collection" },
    { title: "Jaipur pottery techniques" },
  ]);
  assert.equal(general.topic, "general");
  assert.ok(general.evidenceTerms.includes("jaipur"));
  assert.match(general.basis, /retrieved result titles/);
});
test("location is opt-in and only applies to relevant service searches", () => {
  const local = buildContext("electrical utility providers", [], "28654, USA");
  assert.equal(local.topic, "local services");
  assert.equal(local.locationApplied, "28654, USA");
  assert.match(local.locationNote, /eligibility remains unverified/);
  assert.equal(
    buildContext("history of electricity", [], "28654").locationApplied,
    null,
  );
  const fuel = buildContext("gas prices near me", [], "Sydney, Australia");
  assert.equal(fuel.topic, "fuel prices");
  assert.equal(fuel.locationApplied, "Sydney, Australia");
  assert.match(fuel.sceneQuery, /fuel pump/);
  assert.equal(buildContext("XXX clothing", []).sceneQuery, null);
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.match(html, /Location is off by default/);
  assert.match(html, /Reset \/ change topic/);
  assert.doesNotMatch(html, /28654|Moravian Falls/);
});
test("context decoration stays outside the centered owl and remains useful on narrow screens", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  assert.match(html, /centered-owl/);
  assert.match(html, /body::before[\s\S]*body::after/);
  assert.match(html, /pointer-events:\s*none/);
  assert.match(html, /<body data-scene="general">/);
  assert.match(html, /@media \(max-width: 1180px\)[\s\S]*\.topic-wallpaper[\s\S]*position:\s*relative/);
  assert.match(html, /Cars, models & prices/);
  assert.match(html, /href="#autoHeading"/);
  assert.match(html, /Homes & real estate/);
  assert.match(html, /Hospitals worldwide/);
  assert.match(html, /Nearby places & amenities/);
  assert.match(html, /data-scene="city"/);
  assert.match(html, /topic-wallpaper left/);
  assert.match(server, /Wikimedia Commons/);
  assert.match(html, /GasBuddy — Local station search/);
  assert.match(html, /NSE India — Mumbai/);
  assert.match(html, /BSE India — Bombay Stock Exchange, Mumbai/);
  assert.match(html, /SET Thailand — Bangkok/);
  assert.match(html, /Beijing Stock Exchange — China/);
  assert.match(html, /Shanghai Stock Exchange — China/);
  assert.match(html, /Moscow Exchange — Russia/);
  assert.match(html, /Beijing BSE, distinct from Bombay BSE/);
  assert.match(html, /Official worldwide exchange directory/);
  assert.match(html, /48 major official securities exchanges/);
  assert.match(html, /Australian Securities Exchange \(ASX\)/);
  assert.match(html, /B3 — Brasil, Bolsa, Balcão/);
  assert.match(html, /Bolsa de Valores de Caracas/);
  assert.match(html, /Santiago Stock Exchange — nuam/);
  assert.match(html, /World Federation of Exchanges members and affiliates/);
  assert.match(html, /renderExchangeDirectory/);
  assert.match(html, /Agricultural and local-market price sources/);
  assert.match(html, /Explore local services by continent, country, and area/);
  assert.match(html, /Central America & Caribbean/);
  assert.match(html, /Middle East/);
  assert.match(html, /Hospitals & health facilities/);
  assert.match(html, /Local markets, farmers markets & bazaars/);
  assert.match(html, /public market produce market/);
  assert.match(html, /does not substitute[\s\S]*generic decoration for a facility photo/);
  assert.match(html, /Map, contributed photos when available, and directions/);
  assert.match(html, /renderExchangeDirectory\(country\)/);
  assert.match(html, /U\.S\. searches return actual USDA directory records/);
  assert.match(html, /AK:"Alaska"/);
  assert.match(html, /Quebec/);
  assert.match(html, /Mexico SNIIM wholesale market prices/);
  assert.match(html, /European Commission Agri-food Data Portal/);
  assert.match(html, /Open location search on OpenStreetMap/);
  assert.match(html, /Worldwide library and archive directory/);
  assert.match(html, /Bibliothèque nationale de France/);
  assert.match(html, /PARES — Portal de Archivos Españoles/);
  assert.match(html, /Thư viện Quốc gia Việt Nam/);
  assert.match(html, /Antarctica & Arctic collections/);
  assert.match(html, /Trove — National Library of Australia/);
  assert.match(html, /coverage gap, not evidence that no library or archive exists/);
  assert.match(html, /Official weather warnings & alerts/);
  assert.match(html, /WMO Severe Weather Information Centre/);
  assert.match(html, /Latest Listings cards reuse Nasdaq tower\/listing-event photographs/);
  assert.match(html, /city labels identify the listing market/);
  assert.match(html, /does not claim a global live alert feed/);
  assert.match(html, /Daily owl horoscope/);
  assert.match(html, /Light entertainment only—not science/);
  assert.match(html, /No birth date, name, or account is collected/);
  assert.match(server, /api\/farmers-markets/);
  assert.match(server, /farmers-markets-us\.json/);
  assert.match(server, /matches\.slice\(0, 100\)/);
  assert.match(html, /they are not one giant market/);
  assert.match(html, /nine no-cost official/);
  assert.match(html, /FAMA Agri Market Insight/);
  assert.match(html, /IPSARD agricultural price database/);
  assert.match(html, /FAO\/GIEWS Laos country coverage/);
  assert.match(html, /18,000 THB per metric tonne/);
  assert.match(html, /absent rather than filled in/);
  assert.match(html, /Official automotive model and price discovery/);
  assert.match(html, /Toyota Japan — new vehicle lineup/);
  assert.match(html, /Škoda Poland — models and configurator/);
  assert.match(html, /Carsales Australia — new and used vehicle listings/);
  assert.match(html, /advertised asking price is not a verified transaction price/);
  assert.match(html, /manufacturer configurator normally[\s\S]*list price/);
  assert.match(html, /body\[data-scene="automotive"\]/);
  assert.match(html, /Worldwide real-estate listing discovery/);
  assert.match(html, /Rightmove/);
  assert.match(html, /Trade Me Property/);
  assert.match(html, /asking[\s\S]*not proof of a completed transaction/);
  assert.match(html, /Official hospital and health-facility finders/);
  assert.match(html, /Medicare Care Compare/);
  assert.match(html, /NHS — Find a hospital/);
  assert.match(html, /Nearby places and amenities/);
  assert.match(html, /OpenStreetMap/);
  assert.match(html, /body\[data-scene="real-estate"\]/);
  assert.match(html, /body\[data-scene="hospitals"\]/);
  assert.match(html, /body\[data-scene="amenities"\]/);
  assert.match(html, /safeHref = \(value\)/);
  assert.match(html, /\["http:", "https:"\]/);
  assert.doesNotMatch(html, /https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)/i);
});

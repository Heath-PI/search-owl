const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { providers, capabilities, buildContext } = require("./server");

test("isolated package contains only approved deployable files", () => {
  const allowed = new Set([
    ".gitignore",
    "README.md",
    "index.html",
    "opensearch.xml",
    "package.json",
    "render.yaml",
    "search-owl-barn-owl-license.txt",
    "search-owl-barn-owl.jpg",
    "server.js",
    "test.js",
  ]);
  assert.deepEqual(fs.readdirSync(__dirname).sort(), [...allowed].sort());
});
test("public page preserves approved identity, attribution and perched owl", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.match(html, /Intensity is our priority/);
  assert.match(html, /perched barn owl photograph/);
  assert.match(
    html,
    /Created by Master Heath, with design and implementation assistance\s+from ChatGPT \(OpenAI\)/,
  );
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
test("context decoration stays outside the centered owl and hides on mobile", () => {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  assert.match(html, /centered-owl/);
  assert.match(html, /body::before[\s\S]*body::after/);
  assert.match(html, /pointer-events:\s*none/);
  assert.match(html, /@media \(max-width: 650px\)[\s\S]*body::before/);
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
  assert.match(html, /safeHref = \(value\)/);
  assert.match(html, /\["http:", "https:"\]/);
  assert.doesNotMatch(html, /https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)/i);
});

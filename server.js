const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const HOST = process.env.HOST || "0.0.0.0",
  PORT = Number(process.env.PORT || 31978),
  HTML = path.join(__dirname, "index.html");
async function fetchJson(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") error.timeoutMs = timeoutMs;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
async function fetchText(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    if (error.name === "AbortError") error.timeoutMs = timeoutMs;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
const decodeXml = (value) =>
  String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
function xmlValue(block, name) {
  const match = String(block).match(
    new RegExp(
      `<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`,
      "i",
    ),
  );
  return decodeXml(match?.[1]);
}
const providers = {
  wikipedia: async (query, { language = "en" } = {}) => {
    const lang = ["en", "fr", "es", "ru"].includes(language) ? language : "en";
    const data = await fetchJson(
      `https://${lang}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=5`,
      {
        headers: {
          "user-agent": "HUMM-Search-Engine-Hub/0.1 (local desktop tool)",
        },
      },
    );
    return (data.pages || []).map((item) => ({
      title: item.title,
      snippet: String(item.excerpt || "").replace(/<[^>]+>/g, ""),
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(item.key || item.title.replace(/ /g, "_"))}`,
    }));
  },
  libraryOfCongress: async (query) => {
    const data = await fetchJson(
      `https://www.loc.gov/search/?q=${encodeURIComponent(query)}&fo=json&c=5&at=results`,
      { headers: { "user-agent": "Search-Owl/0.1 (local desktop tool)" } },
      20000,
    );
    return (data.results || []).slice(0, 5).map((item) => ({
      title: item.title || "Library of Congress result",
      snippet: Array.isArray(item.description)
        ? item.description.join(" ")
        : String(item.description || item.date || ""),
      url:
        item.id ||
        item.url ||
        `https://www.loc.gov/search/?q=${encodeURIComponent(query)}`,
    }));
  },
  openLibrary: async (query, { language = "en" } = {}) => {
    const fields = "key,title,author_name,first_publish_year,language";
    const data = await fetchJson(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5&fields=${encodeURIComponent(fields)}&lang=${encodeURIComponent(language)}`,
      {
        headers: {
          "user-agent":
            "Search-Owl/1.1 (+https://github.com/Heath-PI/search-owl)",
        },
      },
      12000,
    );
    return (data.docs || []).map((item) => ({
      title: item.title || "Open Library book",
      snippet: [].concat(item.author_name || []).join(", "),
      url: `https://openlibrary.org${item.key}`,
      date: item.first_publish_year || "",
      language: []
        .concat(item.language || [])
        .slice(0, 4)
        .join(", "),
      institution: "Open Library / Internet Archive",
      country: "International",
    }));
  },
  crossref: async (query) => {
    const select = "DOI,title,author,published,URL,publisher";
    const data = await fetchJson(
      `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=5&select=${encodeURIComponent(select)}`,
      {
        headers: {
          "user-agent":
            "Search-Owl/1.1 (+https://github.com/Heath-PI/search-owl)",
        },
      },
      12000,
    );
    return (data.message?.items || []).map((item) => {
      const authors = (item.author || [])
        .slice(0, 4)
        .map(
          (author) =>
            author.name ||
            [author.given, author.family].filter(Boolean).join(" "),
        )
        .filter(Boolean);
      const date = item.published?.["date-parts"]?.[0]?.join("-") || "";
      return {
        title: [].concat(item.title || [])[0] || item.DOI || "Crossref work",
        snippet: [authors.join(", "), item.publisher]
          .filter(Boolean)
          .join(" — "),
        url: item.URL || `https://doi.org/${encodeURIComponent(item.DOI)}`,
        date,
        institution: "Crossref scholarly metadata",
        country: "International",
      };
    });
  },
  europePmc: async (query) => {
    const data = await fetchJson(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&pageSize=5&format=json`,
      {
        headers: {
          "user-agent":
            "Search-Owl/1.1 (+https://github.com/Heath-PI/search-owl)",
        },
      },
      12000,
    );
    return (data.resultList?.result || []).map((item) => ({
      title: item.title || item.id || "Europe PMC record",
      snippet: [item.authorString, item.journalTitle, item.pubType]
        .filter(Boolean)
        .join(" — "),
      url: item.doi
        ? `https://doi.org/${encodeURIComponent(item.doi)}`
        : `https://europepmc.org/article/${encodeURIComponent(item.source || "MED")}/${encodeURIComponent(item.id)}`,
      date: item.firstPublicationDate || item.pubYear || "",
      institution: "Europe PMC",
      country: "International / Europe",
    }));
  },
  worldBankDocuments: async (query) => {
    const data = await fetchJson(
      `https://search.worldbank.org/api/v2/wds?format=json&qterm=${encodeURIComponent(query)}&rows=5`,
      {
        headers: {
          "user-agent":
            "Search-Owl/1.1 (+https://github.com/Heath-PI/search-owl)",
        },
      },
      12000,
    );
    return Object.values(data.documents || {})
      .slice(0, 5)
      .map((item) => ({
        title:
          item.display_title || item.repnme?.repnme || "World Bank document",
        snippet: [
          item.authors &&
            Object.values(item.authors)
              .map((x) => x.author)
              .join(", "),
          item.subtopic,
          item.docty,
        ]
          .filter(Boolean)
          .join(" — ")
          .slice(0, 700),
        url: String(
          item.url ||
            item.url_friendly_title ||
            item.pdfurl ||
            "https://documents.worldbank.org/",
        ).replace(/^http:/, "https:"),
        date: item.ext_pub_date || item.docdt || "",
        language: item.available_in || item.lang || "",
        institution: "World Bank Documents & Reports",
        country: item.count || "International",
      }));
  },
  duckduckgoInstantAnswers: async (query) => {
    const data = await fetchJson(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&no_redirect=1&skip_disambig=1`,
      { headers: { "user-agent": "Search-Owl/0.1 (local desktop tool)" } },
    );
    const items = [];
    if (data.AbstractURL && (data.AbstractText || data.Heading))
      items.push({
        title: data.Heading || query,
        snippet: data.AbstractText || "",
        url: data.AbstractURL,
      });
    const flatten = (list) => {
      for (const item of list || []) {
        if (item.Topics) flatten(item.Topics);
        else if (item.FirstURL && item.Text)
          items.push({
            title: item.Text.split(" - ")[0],
            snippet: item.Text,
            url: item.FirstURL,
          });
      }
    };
    flatten(data.RelatedTopics);
    return items.slice(0, 5);
  },
  projectGutenberg: async (query) => {
    const xml = await fetchText(
      `https://www.gutenberg.org/ebooks/search.opds/?query=${encodeURIComponent(query)}`,
      {
        headers: {
          "user-agent": "Search-Owl/0.2 (+https://github.com/Heath-PI)",
        },
      },
    );
    return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)]
      .map((match) => {
        const block = match[1],
          id = xmlValue(block, "id"),
          rawHref =
            (block.match(/<link\b[^>]*type="text\/html"[^>]*href="([^"]+)"/i) ||
              block.match(
                /<link\b[^>]*href="([^"]+)"[^>]*type="text\/html"/i,
              ))?.[1] || id,
          href = rawHref.replace(/\.opds$/, "");
        return {
          title: xmlValue(block, "title") || "Project Gutenberg eBook",
          snippet: xmlValue(block, "content") || xmlValue(block, "summary"),
          url: href,
          date: xmlValue(block, "issued") || xmlValue(block, "updated"),
          language: xmlValue(block, "language"),
          institution: "Project Gutenberg",
          country: "International / United States",
        };
      })
      .filter((item) => /\/ebooks\/\d+/.test(item.url))
      .slice(0, 5);
  },
  internetArchive: async (query) => {
    const fields = [
      "identifier",
      "title",
      "date",
      "language",
      "description",
      "creator",
    ];
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(`(${query}) AND mediatype:texts`)}&${fields.map((field) => `fl%5B%5D=${field}`).join("&")}&rows=5&page=1&output=json`;
    const data = await fetchJson(
      url,
      {
        headers: {
          "user-agent": "Search-Owl/0.2 (historical-document research)",
        },
      },
      15000,
    );
    return (data.response?.docs || []).map((item) => ({
      title: item.title || item.identifier,
      snippet: []
        .concat(item.creator || [], item.description || [])
        .filter(Boolean)
        .join(" — ")
        .slice(0, 700),
      url: `https://archive.org/details/${encodeURIComponent(item.identifier)}`,
      date: item.date || "",
      language: [].concat(item.language || []).join(", "),
      institution: "Internet Archive",
      country: "International",
    }));
  },
  europeana: async (query) => {
    const key = process.env.EUROPEANA_API_KEY;
    if (!key) {
      const error = Error(
        "Europeana Search API requires a free EUROPEANA_API_KEY.",
      );
      error.code = "not-configured";
      throw error;
    }
    const data = await fetchJson(
      `https://api.europeana.eu/record/v2/search.json?wskey=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}&rows=5&profile=rich`,
    );
    return (data.items || []).map((item) => ({
      title: [].concat(item.title || [])[0] || "Europeana record",
      snippet: []
        .concat(item.dcCreator || [], item.dataProvider || [])
        .filter(Boolean)
        .join(" — "),
      url: item.guid || item.edmIsShownAt || item.link,
      date: [].concat(item.year || []).join(", "),
      language: [].concat(item.language || []).join(", "),
      institution: [].concat(item.dataProvider || [])[0] || "Europeana",
      country: [].concat(item.country || []).join(", ") || "Europe",
    }));
  },
  dpla: async (query) => {
    const key = process.env.DPLA_API_KEY;
    if (!key) {
      const error = Error(
        "Digital Public Library of America API requires DPLA_API_KEY.",
      );
      error.code = "not-configured";
      throw error;
    }
    const data = await fetchJson(
      `https://api.dp.la/v2/items?q=${encodeURIComponent(query)}&page_size=5&api_key=${encodeURIComponent(key)}`,
    );
    return (data.docs || []).map((item) => {
      const source = item.sourceResource || {};
      return {
        title: [].concat(source.title || [])[0] || "DPLA record",
        snippet: []
          .concat(source.description || [], source.creator || [])
          .filter(Boolean)
          .join(" — ")
          .slice(0, 700),
        url: item.isShownAt || item.object || `https://dp.la/item/${item.id}`,
        date: []
          .concat(source.date?.displayDate || source.date || [])
          .join(", "),
        language: []
          .concat(source.language || [])
          .map((x) => x.name || x)
          .join(", "),
        institution: item.dataProvider || item.provider?.name || "DPLA",
        country: "United States",
      };
    });
  },
  troveAustralia: async (query) => {
    const key = process.env.TROVE_API_KEY;
    if (!key) {
      const error = Error(
        "National Library of Australia Trove API v3 requires TROVE_API_KEY.",
      );
      error.code = "not-configured";
      throw error;
    }
    const data = await fetchJson(
      `https://api.trove.nla.gov.au/v3/result?key=${encodeURIComponent(key)}&category=all&q=${encodeURIComponent(query)}&n=5&encoding=json`,
    );
    const records = [];
    for (const category of data.category || [])
      for (const record of category.records?.work ||
        category.records?.article ||
        [])
        records.push({
          title: record.title || "Trove record",
          snippet: []
            .concat(record.contributor || [], record.type || [])
            .join(" — "),
          url:
            record.troveUrl ||
            record.url ||
            `https://trove.nla.gov.au/search?keyword=${encodeURIComponent(query)}`,
          date: record.issued || record.date || "",
          language: [].concat(record.language || []).join(", "),
          institution: "National Library of Australia — Trove",
          country: "Australia",
        });
    return records.slice(0, 5);
  },
  googleProgrammableSearch: async (query) => {
    const key = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY,
      cx = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
    if (!key || !cx) {
      const error = Error(
        "Google Programmable Search needs GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_CUSTOM_SEARCH_ENGINE_ID.",
      );
      error.code = "not-configured";
      throw error;
    }
    const data = await fetchJson(
      `https://customsearch.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&num=5`,
    );
    return (data.items || []).map((item) => ({
      title: item.title,
      snippet: item.snippet || "",
      url: item.link,
    }));
  },
  brave: async (query) => {
    const key = process.env.BRAVE_SEARCH_API_KEY;
    if (!key) {
      const error = Error("Brave Search API key is not configured.");
      error.code = "not-configured";
      throw error;
    }
    const data = await fetchJson(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
      { headers: { accept: "application/json", "x-subscription-token": key } },
    );
    return (data.web?.results || []).map((item) => ({
      title: item.title,
      snippet: item.description || "",
      url: item.url,
    }));
  },
  mojeek: async (query) => {
    const key = process.env.MOJEEK_SEARCH_API_KEY;
    if (!key) {
      const error = Error("Mojeek Search API key is not configured.");
      error.code = "not-configured";
      throw error;
    }
    const data = await fetchJson(
      `https://api.mojeek.com/search?q=${encodeURIComponent(query)}&fmt=json&t=5&api_key=${encodeURIComponent(key)}`,
    );
    const rows = data.response?.results || data.results || [];
    return rows.slice(0, 5).map((item) => ({
      title: item.title || item.url,
      snippet: item.desc || item.description || "",
      url: item.url,
    }));
  },
};
const capabilities = {
  wikipedia: {
    mode: "anonymous-api",
    detail: "Automatic anonymous Wikipedia REST search.",
  },
  libraryOfCongress: {
    mode: "anonymous-api",
    detail: "Automatic anonymous Library of Congress JSON search.",
  },
  duckduckgoInstantAnswers: {
    mode: "limited-anonymous-api",
    detail:
      "Automatic DuckDuckGo Instant Answers only; not organic web-result pages.",
  },
  openLibrary: {
    mode: "anonymous-api",
    detail:
      "Bounded Open Library book discovery through the official Search API.",
  },
  crossref: {
    mode: "anonymous-api",
    detail:
      "Bounded global scholarly-metadata search through the public Crossref REST API.",
  },
  europePmc: {
    mode: "anonymous-api",
    detail:
      "Bounded life-sciences literature search through the official Europe PMC REST service.",
  },
  worldBankDocuments: {
    mode: "anonymous-api",
    detail:
      "Bounded development, economic, and project-document metadata from World Bank Documents & Reports.",
  },
  googleProgrammableSearch: {
    mode: "credentials-required",
    detail:
      "Set GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_CUSTOM_SEARCH_ENGINE_ID for Google Programmable Search.",
  },
  brave: {
    mode: "credentials-required",
    detail: "Set BRAVE_SEARCH_API_KEY for Brave Web Search API.",
  },
  mojeek: {
    mode: "credentials-required",
    detail: "Set MOJEEK_SEARCH_API_KEY for Mojeek Web Search API.",
  },
  projectGutenberg: {
    mode: "anonymous-official-opds",
    detail: "One official Project Gutenberg OPDS result page per user search.",
  },
  internetArchive: {
    mode: "anonymous-api",
    detail: "Automatic Internet Archive advanced-search metadata.",
  },
  europeana: {
    mode: "credentials-required",
    detail: "Set EUROPEANA_API_KEY from Europeana to collect results.",
  },
  dpla: {
    mode: "credentials-required",
    detail:
      "Set DPLA_API_KEY to collect Digital Public Library of America results.",
  },
  troveAustralia: {
    mode: "credentials-required",
    detail: "Set TROVE_API_KEY for National Library of Australia Trove API v3.",
  },
  gallica: {
    mode: "interactive-only",
    detail:
      "Official Gallica catalogue link; automated SRU probe returned HTTP 403, so results are not claimed as collected.",
  },
  ndlJapan: {
    mode: "interactive-only",
    detail:
      "National Diet Library catalogue link; public deployment should complete the NDL API application before automatic collection.",
  },
  googleTranslate: {
    mode: "credential-ready-plus-handoff",
    detail:
      "Cloud Translation Basic works when GOOGLE_CLOUD_TRANSLATION_API_KEY is configured; otherwise text opens in Google Translate.",
  },
  bing: {
    mode: "interactive-only",
    detail: "Microsoft retired Bing Search APIs on August 11, 2025.",
  },
  startpage: {
    mode: "interactive-only",
    detail: "No supported public result API configured; no page scraping.",
  },
  ecosia: {
    mode: "interactive-only",
    detail: "No supported public result API configured; no page scraping.",
  },
  qwant: {
    mode: "interactive-only",
    detail:
      "No supported public result API configured; French display language is a Firefox/Qwant preference.",
  },
  pcmag: {
    mode: "interactive-only",
    detail: "Publication-site link only; no supported result API configured.",
  },
};
async function translateText(text, target) {
  const key = process.env.GOOGLE_CLOUD_TRANSLATION_API_KEY;
  if (!key) {
    const error = Error("Google Cloud Translation API key is not configured.");
    error.code = "not-configured";
    throw error;
  }
  const data = await fetchJson(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ q: text, target, format: "text" }),
    },
  );
  return data.data?.translations?.[0] || null;
}
function combinedFindings(arrivals) {
  const seen = new Set(),
    items = [];
  for (const group of arrivals.filter((item) => item.status === "results"))
    for (const result of group.results || []) {
      let key;
      try {
        const url = new URL(result.url);
        url.hash = "";
        url.searchParams.sort();
        key = url.toString().replace(/\/$/, "").toLowerCase();
      } catch {
        key = String(result.url || result.title).toLowerCase();
      }
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ ...result, provider: group.id });
    }
  return items;
}
const contextRules = [
  {
    id: "news and current events",
    match:
      /\b(news|current events?|breaking|latest|today|tonight|protest|demonstration|riot|election results?)\b/i,
    suffixes: [
      "latest dated reporting",
      "official statements",
      "local reporting",
      "background and timeline",
    ],
  },
  {
    id: "mathematics",
    match:
      /\b(math(?:ematics)?|algebra|geometry|calculus|statistics|equation|theorem|number theory)\b/i,
    suffixes: [
      "applications",
      "proofs and explanations",
      "history",
      "open textbooks",
    ],
  },
  {
    id: "space and astronomy",
    match:
      /\b(space|astronomy|planet|moon|mars|nasa|satellite|cosmos|galaxy|telescope|mission)\b/i,
    suffixes: ["missions", "current research", "open data", "history"],
  },
  {
    id: "cities and places",
    match:
      /\b(new york(?: city)?|nyc|los angeles|la|city|urban|london|delhi|mumbai|paris|tokyo|sydney|toronto|cairo|lagos|são paulo|bangkok|warsaw|poland|travel|tourism|museum|museums|landmark|landmarks|weather|map|maps)\b/i,
    suffixes: [
      "official information",
      "history and archives",
      "maps and public data",
      "current research",
    ],
  },
  {
    id: "video games",
    match:
      /\b(video games?|gaming|gamer|playstation|xbox|nintendo|steam|rpg|mmorpg|esports?|skyrim|starfield|cyberpunk|minecraft|fortnite|elden ring|grand theft auto|gta)\b/i,
    suffixes: [
      "official site",
      "gameplay and guides",
      "developer news",
      "community resources",
    ],
  },
  {
    id: "fuel prices",
    match:
      /\b(gas(?:oline)?|petrol|diesel|fuel)\b(?=.*\b(price|prices|cost|costs|station|stations|near me|local)\b)/i,
    suffixes: [
      "official retail fuel price update",
      "nearby station price timestamp",
      "state or regional average",
      "consumer fuel price report",
    ],
  },
  {
    id: "clothing and fashion",
    match:
      /\b(clothing|clothes|fashion|apparel|outfit|outfits|dress|dresses|designer|designers|streetwear|runway|textile|textiles)\b/i,
    suffixes: [
      "styles and history",
      "designers and collections",
      "materials and construction",
      "museum and archive sources",
    ],
  },
  {
    id: "government and public policy",
    match:
      /\b(government|policy|law|legislation|parliament|congress|court|election|regulation|public records)\b/i,
    suffixes: [
      "official sources",
      "laws and regulations",
      "public records",
      "historical documents",
    ],
  },
  {
    id: "economics and finance",
    match:
      /\b(economy|economic|finance|financial|stock|exchange|market|inflation|gdp|trade|bank|currency|company filing)\b/i,
    suffixes: [
      "economic indicators",
      "official reports",
      "trade and development",
      "company filings",
    ],
  },
  {
    id: "local services",
    match:
      /(?=.*\b(electric(?:al|ity)?|power|utility|internet|water|gas|plumb(?:er|ing)?)\b)(?=.*\b(provider|supplier|utility|service|near me|local)\b)/i,
    suffixes: [
      "official service area",
      "eligibility by address",
      "consumer regulator",
      "public utility commission",
    ],
  },
];
function isLocationRelevant(query) {
  const value = String(query || "");
  return (
    (/\b(electric(?:al|ity)?|power|utility|internet|water|gas|plumb(?:er|ing)?)\b/i.test(
      value,
    ) && /\b(provider|supplier|utility|service|near me|local)\b/i.test(value)) ||
    (/\b(gas(?:oline)?|petrol|diesel|fuel)\b/i.test(value) &&
      /\b(price|prices|cost|costs|station|stations|near me|local)\b/i.test(value))
  );
}
function buildContext(query, items = [], location = "") {
  const clean = String(query || "")
      .trim()
      .replace(/\s+/g, " "),
    matchedRule = contextRules.find((item) => item.match.test(clean)),
    looksGeographic =
      /\b(?:in|near|around|visit|visiting|from|at)\s+[\p{L}][\p{L}\p{M}.'-]*(?:\s+[\p{L}][\p{L}\p{M}.'-]*){0,3}\b/u.test(
        clean,
      ) ||
      /\b(?:travel|tourism|weather|map|maps|museum|museums|hotels?|restaurants?|landmarks?|population)\b/i.test(
        clean,
      ),
    rule =
      matchedRule ||
      (looksGeographic
        ? {
            id: "cities and places",
            suffixes: [
              "official information",
              "history and archives",
              "maps and public data",
              "current research",
            ],
          }
        : null),
    isCurrentEvent = rule?.id === "news and current events",
    visualUnsafe =
      /\b(porn|porno|pornographic|xxx|hentai|nsfw|nude|nudity|sex(?:ual|ually)?|erotic|fetish)\b/i.test(
        clean,
      );
  const stop = new Set(
    "about after before from into over that this with your their what when where which while have been were will would could should official report reports study studies search result results".split(
      " ",
    ),
  );
  const queryWords = new Set(
      clean.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [],
    ),
    counts = new Map();
  for (const item of items.slice(0, 20))
    for (const word of String(item.title || "")
      .toLowerCase()
      .match(/[\p{L}\p{N}]{4,}/gu) || [])
      if (!stop.has(word) && !queryWords.has(word))
        counts.set(word, (counts.get(word) || 0) + 1);
  const evidenceTerms = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([word]) => word);
  const safeLocation = isLocationRelevant(clean)
    ? String(location || "")
        .trim()
        .slice(0, 120)
    : "";
  const base = safeLocation ? `${clean} ${safeLocation}` : clean;
  const suffixes = rule?.suffixes || [
    "overview",
    "history",
    "current research",
  ];
  const suggestions = [
    ...suffixes.map((suffix) => `${base} ${suffix}`),
    ...evidenceTerms.map((term) => `${base} ${term}`),
  ]
    .filter(
      (value, index, array) =>
        value.length <= 300 && array.indexOf(value) === index,
    )
    .slice(0, 6);
  return {
    type: "rule-based-related-searches",
    topic: rule?.id || "general",
    basis: rule
      ? "Matched broad terms in the current query."
      : "Derived from the current query and recurring words in retrieved result titles.",
    locationApplied: safeLocation || null,
    locationNote: safeLocation
      ? "The location narrowed this search. Provider eligibility remains unverified until an official service-area or address checker confirms it."
      : null,
    visualTheme: isCurrentEvent
      ? "news"
      : rule?.id === "cities and places"
        ? "place"
        : rule?.id === "video games"
          ? "gaming"
          : rule?.id === "fuel prices"
            ? "fuel"
            : rule?.id === "clothing and fashion"
              ? "fashion"
          : rule?.id || "general",
    sceneQuery:
      isCurrentEvent ||
      visualUnsafe ||
      ![
        "cities and places",
        "video games",
        "fuel prices",
        "clothing and fashion",
      ].includes(rule?.id)
        ? null
        : `${clean} ${rule.id === "video games" ? "video game" : rule.id === "fuel prices" ? "gas station fuel pump" : rule.id === "clothing and fashion" ? "fashion clothing textile" : "landscape landmark"}`,
    visualNote: isCurrentEvent
      ? "Decorative imagery is kept generic for current-event searches and must not be treated as evidence of an incident. Check each result's publication date and the event date stated by its source."
      : visualUnsafe
        ? "Search results are unchanged, but contextual pictures are suppressed because a non-explicit decorative image could not be established safely."
        : rule?.id === "clothing and fashion"
          ? "Decorative fashion imagery is contextual only and does not imply endorsement by any designer or brand."
          : "Decorative imagery is contextual only and does not depict or verify the retrieved claims.",
    suggestions,
    evidenceTerms,
  };
}

async function commonsSceneImages(query) {
  const explicit =
    /\b(porn|porno|pornographic|xxx|hentai|nsfw|nude|nudity|sex(?:ual|ually)?|erotic|fetish|genital|breast)\b/i;
  if (explicit.test(String(query || ""))) return [];
  const data = await fetchJson(
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=6&gsrsearch=${encodeURIComponent(query)}&prop=imageinfo&iiprop=url%7Cextmetadata%7Ctimestamp&iiurlwidth=700&format=json&origin=*`,
    {
      headers: {
        "user-agent": "HUMM-Search-Engine-Hub/1.1 (public Search Owl service)",
      },
    },
  );
  const strip = (value) =>
    decodeXml(String(value?.value || value || "")).slice(0, 240);
  return Object.values(data.query?.pages || {})
    .map((page) => {
      const info = page.imageinfo?.[0],
        meta = info?.extmetadata || {};
      const screeningText = `${page.title || ""} ${strip(meta.ImageDescription)} ${strip(meta.Categories)}`;
      if (explicit.test(screeningText)) return null;
      return {
        title: String(page.title || "").replace(/^File:/, ""),
        imageUrl: info?.thumburl || info?.url || "",
        sourceUrl: info?.descriptionurl || "",
        creator: strip(meta.Artist) || "Creator listed on Wikimedia Commons",
        license: strip(meta.LicenseShortName) || "See source for license",
        licenseUrl: meta.LicenseUrl?.value || info?.descriptionurl || "",
        sourceDate: strip(meta.DateTimeOriginal) || info?.timestamp || null,
      };
    })
    .filter(
      (item) =>
        item &&
        /^https:\/\//.test(item.imageUrl) &&
        /^https:\/\//.test(item.sourceUrl),
    )
    .slice(0, 4);
}
async function runProviders(
  query,
  {
    selected = providers,
    clock = () => performance.now(),
    language = "en",
  } = {},
) {
  const start = clock(),
    arrivals = [];
  let sequence = 0;
  await Promise.all(
    Object.entries(selected).map(async ([id, search]) => {
      try {
        const results = await search(query, { language });
        arrivals.push({
          id,
          status: "results",
          results,
          elapsedMs: Math.max(0, Math.round(clock() - start)),
          sequence: sequence++,
        });
      } catch (error) {
        arrivals.push({
          id,
          status: error.code === "not-configured" ? "unavailable" : "error",
          error:
            error.name === "AbortError"
              ? `Timed out after ${Math.round((error.timeoutMs || 8000) / 1000)} seconds.`
              : String(error.message || error),
          results: [],
          elapsedMs: Math.max(0, Math.round(clock() - start)),
          sequence: sequence++,
        });
      }
    }),
  );
  return arrivals.sort(
    (a, b) => a.elapsedMs - b.elapsedMs || a.sequence - b.sequence,
  );
}
function send(res, status, type, body) {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": type.startsWith("image/")
      ? "public, max-age=86400"
      : "no-store",
    "content-security-policy":
      "default-src 'self'; img-src 'self' data: https://upload.wikimedia.org; connect-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  res.end(body);
}
const requestBuckets = new Map();
function allowed(req) {
  const key = String(
      req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown",
    )
      .split(",")[0]
      .trim(),
    now = Date.now(),
    bucket = requestBuckets.get(key);
  if (!bucket || now - bucket.start > 60000) {
    requestBuckets.set(key, { start: now, count: 1 });
    return true;
  }
  bucket.count++;
  return bucket.count <= 30;
}
const searchCache = new Map(),
  SEARCH_CACHE_MS = 120000;
function start() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/healthz")
      return send(
        res,
        200,
        "application/json",
        JSON.stringify({
          ok: true,
          version: "1.1.0",
          features: ["worldwide-metadata", "context-panels", "opensearch"],
        }),
      );
    if (url.pathname === "/")
      return send(res, 200, "text/html; charset=utf-8", fs.readFileSync(HTML));
    if (url.pathname === "/opensearch.xml")
      return send(
        res,
        200,
        "application/opensearchdescription+xml; charset=utf-8",
        fs.readFileSync(path.join(__dirname, "opensearch.xml")),
      );
    if (url.pathname === "/search-owl-barn-owl.jpg")
      return send(
        res,
        200,
        "image/jpeg",
        fs.readFileSync(path.join(__dirname, "search-owl-barn-owl.jpg")),
      );
    if (!allowed(req))
      return send(
        res,
        429,
        "application/json",
        JSON.stringify({ error: "Too many requests. Please wait a minute." }),
      );
    if (url.pathname === "/api/translate") {
      const text = String(url.searchParams.get("text") || "")
          .trim()
          .slice(0, 3000),
        target = String(url.searchParams.get("target") || "").trim();
      if (!text || !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(target))
        return send(
          res,
          400,
          "application/json",
          JSON.stringify({
            error: "Text and a valid target language are required.",
          }),
        );
      try {
        return send(
          res,
          200,
          "application/json",
          JSON.stringify({
            translation: await translateText(text, target),
            provider: "Google Cloud Translation",
          }),
        );
      } catch (error) {
        return send(
          res,
          error.code === "not-configured" ? 503 : 502,
          "application/json",
          JSON.stringify({
            error: String(error.message || error),
            code: error.code || "translation-error",
          }),
        );
      }
    }
    if (url.pathname === "/api/scene-images") {
      const query = String(url.searchParams.get("q") || "")
        .trim()
        .slice(0, 180);
      if (!query)
        return send(
          res,
          400,
          "application/json",
          JSON.stringify({ error: "A visual subject is required." }),
        );
      try {
        return send(
          res,
          200,
          "application/json",
          JSON.stringify({
            images: await commonsSceneImages(query),
            provider: "Wikimedia Commons",
            note: "Non-explicit contextual decoration only. Source, creator, date when available, and license are shown with each image.",
          }),
        );
      } catch {
        return send(
          res,
          200,
          "application/json",
          JSON.stringify({
            images: [],
            provider: "Wikimedia Commons",
            note: "No suitable safely attributed image was available; Search Owl kept its generated fallback.",
          }),
        );
      }
    }
    if (url.pathname === "/api/search") {
      const query = String(url.searchParams.get("q") || "")
          .trim()
          .slice(0, 300),
        location = String(url.searchParams.get("location") || "")
          .trim()
          .slice(0, 120),
        requested = url.searchParams.get("lang"),
        language = ["en", "fr", "es", "ru"].includes(requested)
          ? requested
          : "en";
      if (!query)
        return send(
          res,
          400,
          "application/json",
          JSON.stringify({ error: "Enter a search query." }),
        );
      const appliedLocation = isLocationRelevant(query) ? location : "",
        searchedQuery = appliedLocation ? `${query} ${appliedLocation}` : query,
        key = `${language}:${searchedQuery.toLocaleLowerCase()}`,
        cached = searchCache.get(key),
        now = Date.now();
      if (cached && now - cached.at < SEARCH_CACHE_MS)
        return send(
          res,
          200,
          "application/json",
          JSON.stringify({
            ...cached.payload,
            cache: { hit: true, maxAgeSeconds: SEARCH_CACHE_MS / 1000 },
          }),
        );
      const arrivals = await runProviders(searchedQuery, { language }),
        combined = combinedFindings(arrivals),
        payload = {
          query,
          searchedQuery,
          locationApplied: appliedLocation || null,
          language,
          fetchedAt: new Date().toISOString(),
          freshness:
            "Providers are fetched on demand. Results may reflect source publication or indexing delays; no market quote is represented as real-time.",
          timing:
            "Elapsed time is measured locally from concurrent request dispatch until each API response body is fully parsed. It does not measure global engine speed.",
          firstResponder:
            arrivals.find((x) => x.status === "results" && x.results?.length)
              ?.id || null,
          arrivals,
          combined,
          context: buildContext(query, combined, appliedLocation),
          capabilities,
        };
      searchCache.set(key, { at: now, payload });
      if (searchCache.size > 100)
        searchCache.delete(searchCache.keys().next().value);
      return send(
        res,
        200,
        "application/json",
        JSON.stringify({
          ...payload,
          cache: { hit: false, maxAgeSeconds: SEARCH_CACHE_MS / 1000 },
        }),
      );
    }
    return send(res, 404, "text/plain; charset=utf-8", "Not found");
  });
  server.listen(PORT, HOST, () =>
    console.log(`Search Owl listening on ${HOST}:${PORT}`),
  );
  return server;
}
if (require.main === module) start();
module.exports = {
  runProviders,
  combinedFindings,
  buildContext,
  start,
  providers,
  capabilities,
  translateText,
  commonsSceneImages,
};

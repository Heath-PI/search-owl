import fs from "node:fs/promises";

const userAgent = "SearchOwlCatalog/1.0 (https://github.com/Heath-PI/search-owl)";
const sparql = `
SELECT DISTINCT ?taxon ?taxonLabel ?scientific ?image WHERE {
  ?taxon wdt:P31 wd:Q16521;
         wdt:P171* wd:Q25222;
         wdt:P105 wd:Q7432;
         wdt:P225 ?scientific;
         wdt:P18 ?image.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 600`;

const stripHtml = (value = "") =>
  value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const historicalArtworkTaxa = new Set("Bubo bouvieri|Bubo milesi|Bubo poensis|Bubo shelleyi|Glaucidium castaneum|Glaucidium cobanense|Glaucidium gnoma|Glaucidium griseiceps|Glaucidium sjostedti|Jubula lettii|Megascops barbarus|Megascops guatemalae|Ninox forbesi|Ninox fusca|Ninox hantu|Ninox hypogramma|Ninox jacquinoti|Ninox natalis|Ninox ochracea|Ninox rudolfi|Ninox squamipila|Ninox variegata|Otus alfredi|Otus balli|Otus brucei|Otus gurneyi|Otus icterorhynchus|Otus insularis|Otus magicus|Otus manadensis|Otus silvicola|Otus socotranus|Pyrroglaux podargina|Scotopelia ussheri|Strix bartelsi|Strix davidi|Tyto aurantia|Tyto detorta|Uroglaux dimorpha".split("|"));
const photoOverrides = new Map();

const response = await fetch(
  `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`,
  { headers: { "user-agent": userAgent } },
);
if (!response.ok) throw new Error(`Wikidata query failed: ${response.status}`);
const rows = (await response.json()).results.bindings;

const candidates = [];
const seenSpecies = new Set();
const seenFiles = new Set();
for (const row of rows.sort((a, b) => a.scientific.value.localeCompare(b.scientific.value))) {
  const scientific = row.scientific.value.trim();
  if (!/^[A-Z][a-z-]+ [a-z][a-z-]+$/.test(scientific)) continue;
  const fileName = decodeURIComponent(row.image.value.split("/").pop()).replace(/_/g, " ");
  const fileKey = fileName.toLocaleLowerCase("en");
  if (seenSpecies.has(scientific) || seenFiles.has(fileKey) || /\.(svg|gif|tif|tiff)$/i.test(fileName)) continue;
  seenSpecies.add(scientific);
  seenFiles.add(fileKey);
  candidates.push({
    name: row.taxonLabel.value.startsWith("Q") ? scientific : row.taxonLabel.value,
    scientific,
    wikidata: row.taxon.value,
    fileName,
  });
}

const metadataByFile = new Map();
for (let index = 0; index < candidates.length; index += 50) {
  const batch = candidates.slice(index, index + 50);
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "url|extmetadata|mime|timestamp",
    iiurlwidth: "1600",
    titles: batch.map((item) => `File:${item.fileName}`).join("|"),
  });
  const api = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
    headers: { "user-agent": userAgent },
  });
  if (!api.ok) throw new Error(`Commons metadata failed: ${api.status}`);
  const pages = (await api.json()).query.pages;
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info || !/^image\/(jpeg|png|webp)$/i.test(info.mime || "")) continue;
    const metadata = info.extmetadata || {};
    metadataByFile.set(page.title.replace(/^File:/, "").toLocaleLowerCase("en"), {
      imageUrl: info.thumburl || info.url,
      sourceUrl: info.descriptionurl,
      creator: stripHtml(metadata.Artist?.value) || "Wikimedia Commons contributor",
      license: stripHtml(metadata.LicenseShortName?.value) || "See source for license",
      licenseUrl: metadata.LicenseUrl?.value || info.descriptionurl,
      sourceDate: stripHtml(metadata.DateTimeOriginal?.value || ""),
    });
  }
}

const catalog = candidates
  .map((candidate) => {
    const owl = { ...candidate, ...metadataByFile.get(candidate.fileName.toLocaleLowerCase("en")), ...photoOverrides.get(candidate.scientific) };
    owl.mediaType = historicalArtworkTaxa.has(candidate.scientific) ? "historical illustration" : (owl.mediaType || "photograph");
    if (owl.mediaType === "historical illustration") {
      owl.mediaNote = candidate.scientific === "Uroglaux dimorpha"
        ? "Historical illustration shown for clarity; the freely reusable photograph we found is obscured by branches."
        : "Historical illustration — we haven’t found a freely reusable photograph for this species.";
    }
    return owl;
  })
  .filter((item) => item.imageUrl && item.sourceUrl && item.creator && item.license)
  .slice(0, 250);

if (catalog.length < 230) throw new Error(`Only ${catalog.length} validated owl species images were available`);
await fs.writeFile("owl-catalog.json", `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: "Wikidata owl taxa (Strigiformes) with licensed Wikimedia Commons photographs and clearly labeled historical illustrations",
  timezone: "America/New_York",
  epoch: "2026-10-22",
  count: catalog.length,
  owls: catalog,
}, null, 2)}\n`);
console.log(`Wrote ${catalog.length} distinct owl species with licensed, classified image files.`);

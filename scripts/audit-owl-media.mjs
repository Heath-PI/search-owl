import fs from "node:fs/promises";

const catalog = JSON.parse(await fs.readFile("owl-catalog.json", "utf8"));
const userAgent = "SearchOwlCatalogAudit/1.0 (https://github.com/Heath-PI/search-owl)";
const nonPhoto = /\b(illustrat(?:ion|or|ed)|painting|painted|drawing|engraving|lithograph|plate|artwork|watercolou?r|print|book scan|natural history|john gould|keulemans)\b/i;
const suspicious = [];

for (let index = 0; index < catalog.owls.length; index += 50) {
  const batch = catalog.owls.slice(index, index + 50);
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "extmetadata|timestamp",
    titles: batch.map((owl) => `File:${owl.fileName}`).join("|"),
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { "user-agent": userAgent } });
  if (!response.ok) throw new Error(`Commons metadata failed: ${response.status}`);
  for (const page of (await response.json()).query.pages) {
    const owl = batch.find((item) => item.fileName.toLocaleLowerCase("en") === page.title.replace(/^File:/, "").toLocaleLowerCase("en"));
    const info = page.imageinfo?.[0];
    if (!owl || !info) continue;
    const meta = info.extmetadata || {};
    const fields = {
      title: page.title,
      description: meta.ImageDescription?.value || "",
      categories: meta.Categories?.value || "",
      date: meta.DateTimeOriginal?.value || "",
      artist: meta.Artist?.value || "",
      credit: meta.Credit?.value || "",
      source: meta.Credit?.value || meta.Source?.value || "",
    };
    const evidence = Object.entries(fields).filter(([, value]) => nonPhoto.test(String(value))).map(([key]) => key);
    const year = Number(String(fields.date).match(/\b(1[0-8]\d{2})\b/)?.[1] || 0);
    if (evidence.length || year) suspicious.push({ name: owl.name, scientific: owl.scientific, fileName: owl.fileName, sourceUrl: owl.sourceUrl, evidence, year: year || null, fields });
  }
}

console.log(JSON.stringify({ catalogCount: catalog.count, suspiciousCount: suspicious.length, suspicious }, null, 2));

import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, "geo-data");
const target = path.join(directory, "user-country.mmdb");
const databaseUrl = "https://github.com/sapics/ip-location-db/releases/download/latest/user-country.mmdb";
const checksumUrl = "https://github.com/sapics/ip-location-db/releases/download/checksum/user-country.mmdb.sha256";

try {
  const checksumResponse = await fetch(checksumUrl);
  const databaseResponse = await fetch(databaseUrl);
  if (!databaseResponse.ok || !checksumResponse.ok)
    throw new Error(`download failed (${databaseResponse.status}/${checksumResponse.status})`);
  const bytes = Buffer.from(await databaseResponse.arrayBuffer());
  const expected = (await checksumResponse.text()).trim().split(/\s+/)[0].toLowerCase();
  const actual = crypto.createHash("sha256").update(bytes).digest("hex");
  if (!/^[a-f0-9]{64}$/.test(expected) || actual !== expected)
    throw new Error("checksum did not match the published SHA-256 value");
  await fs.mkdir(directory, { recursive: true });
  const temporaryDirectory = fsSync.mkdtempSync(path.join(os.tmpdir(), "search-owl-geo-"));
  const temporary = path.join(temporaryDirectory, "country.mmdb");
  try {
    fsSync.writeFileSync(temporary, bytes);
    fsSync.copyFileSync(temporary, target);
  } finally {
    fsSync.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
  console.log(`Updated offline country database (${bytes.length.toLocaleString("en-US")} bytes, SHA-256 ${actual.slice(0, 12)}…).`);
} catch (error) {
  try {
    await fs.access(target);
    console.warn(`Country database refresh skipped; using the bundled snapshot (${error.message}).`);
  } catch {
    throw error;
  }
}

// Fetches the Mongol Empire's territorial-extent time-slices from
// Cliopatria (Seshat Global History Databank, CC BY 4.0 — see
// LICENSES.md) and writes them as entries in this app's format to
// web-client/public/data/cliopatria-boundaries.json, for db/seed.mjs to
// load. See plans/import-mongol-empire-boundaries-cliopatria.md.
//
// Cliopatria ships as a single static GeoJSON file (no rate limits, no
// pagination needed, unlike the QLever endpoint fetch-wikidata-persons.mjs
// talks to) — one HTTP fetch, unzipped via the system `unzip` binary
// (same shell-out-over-dependency precedent as bzip2-cli.ts), then a
// line-based filter (the file is one Feature per line; loading the full
// ~165MB/13,772-feature document into memory isn't needed for a
// 12-feature result).

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(REPO_ROOT, 'web-client', 'public', 'data', 'cliopatria-boundaries.json');

const CLIOPATRIA_ZIP_URL = 'https://raw.githubusercontent.com/Seshat-Global-History-Databank/cliopatria/main/cliopatria.geojson.zip';
const CITATION_URL = 'https://github.com/Seshat-Global-History-Databank/cliopatria';
const CITATION_LABEL = 'Cliopatria (Seshat Global History Databank)';
const POLITY_NAME = 'Mongol Empire';

function formatYear(y) {
  return y < 0 ? `${-y} BCE` : `${y} CE`;
}

function slugForRange(fromYear, toYear) {
  const s = fromYear < 0 ? `bce${-fromYear}` : String(fromYear);
  const e = toYear < 0 ? `bce${-toYear}` : String(toYear);
  return `mongol-empire-${s}-${e}`;
}

function featureToEntry(feature) {
  const p = feature.properties;
  const fromYear = Math.trunc(p.FromYear);
  const toYear = Math.trunc(p.ToYear);
  const areaKm2 = Math.round(p.Area);

  if (feature.geometry.type !== 'MultiPolygon' && feature.geometry.type !== 'Polygon') {
    throw new Error(`unexpected geometry type for ${p.Name} ${fromYear}-${toYear}: ${feature.geometry.type}`);
  }
  const polygons = feature.geometry.type === 'MultiPolygon'
    ? feature.geometry.coordinates
    : [feature.geometry.coordinates];

  const description = `The Mongol Empire's territorial extent from ${formatYear(fromYear)} to ` +
    `${formatYear(toYear)}, reconstructed by the Cliopatria historical-polity boundaries dataset ` +
    `(Seshat Global History Databank). Approximate area: ${areaKm2.toLocaleString('en-US')} km².` +
    (p.Wikipedia ? ` See also Wikipedia: "${p.Wikipedia}".` : '');

  return {
    slug: slugForRange(fromYear, toYear),
    title: `${p.Name} (${fromYear}–${toYear})`,
    startYear: fromYear, startMonth: 0, startDay: 0,
    endYear: toYear, endMonth: 0, endDay: 0,
    startExpr: formatYear(fromYear), endExpr: formatYear(toYear),
    calendar: 'gregorian',
    uncertaintyYears: 0,
    category: 'pol_mil_organization',
    infoboxType: '',
    description,
    tags: ['cliopatria'],
    citationUrl: CITATION_URL,
    citationLabel: CITATION_LABEL,
    locations: [{ type: 'multipolygon', polygons }],
  };
}

async function main() {
  const workDir = await mkdtemp(path.join(tmpdir(), 'cliopatria-'));
  try {
    const zipPath = path.join(workDir, 'cliopatria.geojson.zip');
    console.log(`==> Downloading ${CLIOPATRIA_ZIP_URL}`);
    const res = await fetch(CLIOPATRIA_ZIP_URL);
    if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath));

    console.log('==> Extracting');
    execFileSync('unzip', ['-o', '-q', zipPath, '-d', workDir]);

    const geojsonPath = path.join(workDir, 'cliopatria_polities_only.geojson');
    const text = await readFile(geojsonPath, 'utf8');

    const entries = [];
    for (const line of text.split('\n')) {
      const trimmed = line.trim().replace(/,$/, '');
      if (!trimmed.startsWith('{ "type": "Feature"')) continue;
      const feature = JSON.parse(trimmed);
      if (feature.properties.Name !== POLITY_NAME) continue;
      entries.push(featureToEntry(feature));
    }
    entries.sort((a, b) => a.startYear - b.startYear);

    if (entries.length === 0) {
      throw new Error(`no features found for "${POLITY_NAME}" — did the source file's schema change?`);
    }

    await writeFile(OUTPUT_PATH, JSON.stringify(entries, null, 2) + '\n', 'utf8');
    console.log(`==> Wrote ${entries.length} entries to ${path.relative(REPO_ROOT, OUTPUT_PATH)}`);
    for (const e of entries) console.log(`    ${e.slug}: ${e.locations[0].polygons.length} polygon(s)`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

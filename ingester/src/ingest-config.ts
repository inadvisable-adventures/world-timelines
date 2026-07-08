import fs from 'node:fs';

export interface IngestConfig {
  // Path overrides (null = use CLI flag or hardcoded default)
  outputPath:    string | null;
  partialPath:   string | null;
  statusLogPath: string | null;
  runsLogPath:   string | null;
  catalogPath:   string | null;
  catalogInput:  string | null; // existing catalog to read include_in_future flags from
  offsetCache:   string | null; // binary stream-offset cache path (null = default)
  // Filters
  streamStride:         number;        // process every Nth stream (default: 1 = all)
  maxRestarts:          number;        // halve stride and retry this many times if under-collected (default: 2)
  stopAfterConsidering: number | null;
  stopAfterCollecting:  number | null;
  excludeCategories:    Set<string>;
  dateAfter:            number | null; // inclusive: startYear >= dateAfter
  dateBefore:           number | null; // inclusive: startYear <= dateBefore
  excludeNoCoords:      boolean;       // reject entries with no coordinates
  maxBirthYearByType:   Map<string, number>; // per-infobox-type: reject if startYear > cap
}

export function parseIngestConfig(configPath: string): IngestConfig {
  const config: IngestConfig = {
    outputPath:    null,
    partialPath:   null,
    statusLogPath: null,
    runsLogPath:   null,
    catalogPath:   null,
    catalogInput:  null,
    offsetCache:   null,
    streamStride:         1,
    maxRestarts:          2,
    stopAfterConsidering: null,
    stopAfterCollecting:  null,
    excludeCategories:    new Set(),
    dateAfter:            null,
    dateBefore:           null,
    excludeNoCoords:      false,
    maxBirthYearByType:   new Map(),
  };

  if (!fs.existsSync(configPath)) return config;

  for (const rawLine of fs.readFileSync(configPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const key = line.slice(0, tab).trim();
    const val = line.slice(tab + 1).trim();

    switch (key) {
      case 'output':                 config.outputPath    = val;                      break;
      case 'partial':                config.partialPath   = val;                      break;
      case 'status_log':             config.statusLogPath = val;                      break;
      case 'runs_log':               config.runsLogPath   = val;                      break;
      case 'catalog':                config.catalogPath   = val;                      break;
      case 'catalog_input':          config.catalogInput  = val;                      break;
      case 'offset_cache':           config.offsetCache   = val;                      break;
      case 'stream_stride':          config.streamStride         = Math.max(1, parseInt(val, 10)); break;
      case 'max_restarts':           config.maxRestarts          = Math.max(0, parseInt(val, 10)); break;
      case 'stop_after_considering': config.stopAfterConsidering = parseInt(val, 10); break;
      case 'stop_after_collecting':  config.stopAfterCollecting  = parseInt(val, 10); break;
      case 'exclude_category':       config.excludeCategories.add(val);              break;
      case 'date_after':             config.dateAfter  = parseInt(val, 10);          break;
      case 'date_before':            config.dateBefore = parseInt(val, 10);          break;
      case 'exclude_no_coords':      config.excludeNoCoords = val === '1' || val.toLowerCase() === 'true'; break;
      case 'max_birth_year': {
        // Value form: "<infobox_type><whitespace><year>", e.g. "person\t1899".
        const m = /^(\S+)\s+(-?\d+)$/.exec(val);
        if (m) config.maxBirthYearByType.set(m[1], parseInt(m[2], 10));
        else process.stderr.write(`[config] max_birth_year: expected "<type> <year>", got: ${val}\n`);
        break;
      }
      default:
        process.stderr.write(`[config] Unknown key: ${key}\n`);
    }
  }

  return config;
}

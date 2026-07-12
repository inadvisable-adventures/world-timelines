// Talks to the local Postgres database by shelling out to the `psql` CLI
// (rather than adding a driver dependency — see
// plans/indexeddb-cache-and-server-rewrite.md). User-supplied values are
// never concatenated into SQL text directly by callers — they write `:'name'`
// placeholders (mirroring psql's own quoted-variable syntax) and pass values
// via `vars`; runQuery substitutes them here with standard SQL-literal
// escaping (''-doubling), the same approach db/seed.mjs uses. (psql's own
// `-v`/`:'name'` substitution turns out not to apply to `-c` command
// strings, only to `-f` files/interactive input — confirmed empirically —
// so this project does the substitution itself rather than shelling out via
// a temp file per query.)

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const PGHOST = process.env['PGHOST'] ?? path.join(REPO_ROOT, 'db', '.pgdata');
const PGDATABASE = process.env['PGDATABASE'] ?? 'world_timelines';

// postgresql@18 is Homebrew keg-only (see plans/install-local-postgres.md),
// so `psql` is not on PATH by default. Mirror db/init-db.sh's resolution: an
// explicit PSQL_BIN wins, then the well-known keg-only path if it exists,
// then fall back to bare `psql` on PATH.
function resolvePsqlBin(): string {
  if (process.env['PSQL_BIN']) return process.env['PSQL_BIN'];
  const kegOnly = '/opt/homebrew/opt/postgresql@18/bin/psql';
  if (fs.existsSync(kegOnly)) return kegOnly;
  return 'psql';
}

const PSQL = resolvePsqlBin();

export class BadRequestError extends Error {}
export class QueryError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUuidList(ids: unknown): string[] {
  if (!Array.isArray(ids)) throw new BadRequestError('ids must be an array');
  for (const id of ids) {
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      throw new BadRequestError(`invalid id: ${JSON.stringify(id)}`);
    }
  }
  return ids as string[];
}

function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

// Replaces `:'name'` placeholders with a safely-escaped SQL string literal
// for vars[name]. Throws if `inner` references a name not present in vars,
// so a missing value fails loudly instead of silently leaving `:'name'`
// (invalid SQL) in the query.
function interpolate(inner: string, vars: Record<string, string>): string {
  return inner.replace(/:'(\w+)'/g, (match, name: string) => {
    if (!(name in vars)) throw new QueryError(`missing SQL variable: ${name}`);
    return sqlString(vars[name]);
  });
}

// Runs `inner` (a SELECT, no trailing semicolon, may reference `:'name'`
// placeholders for anything in `vars`) wrapped so Postgres returns exactly
// one JSON array on stdout.
export function runQuery<T = unknown>(inner: string, vars: Record<string, string> = {}): Promise<T[]> {
  const substituted = interpolate(inner, vars);
  const sql = `SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) FROM (${substituted}) t;`;
  const args = ['-h', PGHOST, '-d', PGDATABASE, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-A', '-t', '-c', sql];

  return new Promise((resolve, reject) => {
    execFile(PSQL, args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new QueryError(
            `could not find psql at "${PSQL}". Install it (see plans/install-local-postgres.md: ` +
            `brew install postgresql@18 postgis) or set PSQL_BIN to its full path.`,
          ));
          return;
        }
        reject(new QueryError(stderr.trim() || err.message));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim() || '[]') as T[]);
      } catch (parseErr) {
        reject(new QueryError(`failed to parse psql output: ${(parseErr as Error).message}`));
      }
    });
  });
}

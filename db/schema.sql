-- World timelines PostgreSQL + PostGIS schema.
--
-- Holds everything the app currently serves from static TSV/JSON files:
-- entries (including historical eras, which share the same row shape),
-- lanesets, and lanes. See plans/db-schema.md for the full design rationale.
--
-- Idempotent: safe to re-run against an existing database.

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- Lanesets / lanes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lanesets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE,       -- e.g. 'continents' (today's Laneset.id)
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lanes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laneset_id   UUID NOT NULL REFERENCES lanesets(id) ON DELETE CASCADE,
  slug         TEXT NOT NULL,              -- e.g. 'africa' (today's Lane.id)
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  geometry     geometry(MultiPolygon, 4326) NOT NULL,
  bbox_min_lng DOUBLE PRECISION NOT NULL,
  bbox_min_lat DOUBLE PRECISION NOT NULL,
  bbox_max_lng DOUBLE PRECISION NOT NULL,
  bbox_max_lat DOUBLE PRECISION NOT NULL,
  era_sources  TEXT[] NOT NULL DEFAULT '{}',
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laneset_id, slug)
);

CREATE INDEX IF NOT EXISTS lanes_geometry_gix ON lanes USING GIST (geometry);
CREATE INDEX IF NOT EXISTS lanes_laneset_id_idx ON lanes (laneset_id);

-- ---------------------------------------------------------------------------
-- Entries (also holds historical eras — see plans/db-schema.md: the source
-- historical_eras.tsv is byte-for-byte the same 17-column shape as
-- collected_entries.sample.tsv; an "era" is an entry with
-- category = 'historical_period' and a tag ending in '-history').
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,   -- content-derived id today, e.g. 'great-pyramid-giza'
  title             TEXT NOT NULL,
  start_year        INTEGER NOT NULL,
  start_month       SMALLINT NOT NULL,
  start_day         SMALLINT NOT NULL,
  end_year          INTEGER NOT NULL,
  end_month         SMALLINT NOT NULL,
  end_day           SMALLINT NOT NULL,
  start_expr        TEXT NOT NULL,
  end_expr          TEXT NOT NULL,
  calendar          TEXT NOT NULL DEFAULT 'gregorian'
                      CHECK (calendar IN ('gregorian', 'julian', 'islamic', 'hebrew', 'unknown')),
  uncertainty_years DOUBLE PRECISION NOT NULL DEFAULT 0,
  category          TEXT NOT NULL
                      CHECK (category IN ('person', 'event', 'place', 'artifact',
                        'pol_mil_organization', 'business', 'historical_period',
                        'concepts', 'other')),
  infobox_type      TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  tags              TEXT[] NOT NULL DEFAULT '{}',
  last_updated      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entries_start_end_year_idx ON entries (start_year, end_year);
CREATE INDEX IF NOT EXISTS entries_category_idx ON entries (category);
CREATE INDEX IF NOT EXISTS entries_tags_gin ON entries USING GIN (tags);

-- ---------------------------------------------------------------------------
-- Entry locations (0..n per entry; first ordinal = primary anchor).
--
-- geometry holds a Point for 'point'/'circle' (circle center), a Polygon for
-- 'polygon', or a MultiPolygon for 'multipolygon'; NULL for 'path' (path
-- waypoints carry an optional per-point fractional-progress `t` that doesn't
-- fit a plain PostGIS geometry, so they're preserved as JSONB instead).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS entry_locations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id     UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  ordinal      SMALLINT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('point', 'polygon', 'multipolygon', 'path', 'circle')),
  geometry     geometry(Geometry, 4326),
  radius_km    DOUBLE PRECISION,   -- only for kind='circle'
  waypoints    JSONB,              -- only for kind='path': [{lat,lng,t?}, ...]
  uncertain    BOOLEAN NOT NULL DEFAULT false,
  label        TEXT,
  UNIQUE (entry_id, ordinal)
);

CREATE INDEX IF NOT EXISTS entry_locations_geometry_gix ON entry_locations USING GIST (geometry);
CREATE INDEX IF NOT EXISTS entry_locations_entry_id_idx ON entry_locations (entry_id);

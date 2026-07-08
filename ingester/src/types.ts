export type EventCategory = 'person' | 'event' | 'place' | 'artifact' | 'pol_mil_organization' | 'business' | 'historical_period' | 'concepts' | 'other';

export interface PointLocation {
  type: 'point';
  lat: number;
  lng: number;
  uncertain?: boolean;
  label?: string;
}

export interface PolygonLocation {
  type: 'polygon';
  rings: Array<Array<[number, number]>>; // [lng, lat]; rings[0] = exterior, rings[1+] = holes
  uncertain?: boolean;
  label?: string;
}

export interface MultiPolygonLocation {
  type: 'multipolygon';
  polygons: Array<Array<Array<[number, number]>>>; // array of (rings), for non-contiguous territories
  uncertain?: boolean;
  label?: string;
}

export interface PathLocation {
  type: 'path';
  waypoints: Array<{ lat: number; lng: number; t?: number; label?: string }>;
  label?: string;
}

export interface CircleLocation {
  type: 'circle';
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  uncertain?: boolean;
  label?: string;
}

export type EventLocation =
  | PointLocation
  | PolygonLocation
  | MultiPolygonLocation
  | PathLocation
  | CircleLocation;

export interface EventDate {
  originalExpression: string;
  detectedCalendar: string;
  startYear: number;
  startMonth: number;   // 0 = unknown
  startDay: number;     // 0 = unknown
  endYear: number;
  endMonth: number;
  endDay: number;
  uncertaintyYears: number;
}

export interface ExtractedEvent {
  id: string;
  title: string;
  locations: EventLocation[];
  startDate: EventDate;
  endDate: EventDate | null;
  category: EventCategory;
  infoboxType: string;
  description: string;
  tags: string[];
}

export interface ArticleStream {
  byteOffset: number;
  articles: Array<{ articleId: number; title: string }>;
}

export interface IngestOptions {
  dumpPath: string;
  indexPath: string;
  catalogOutputPath: string;
  includeCategories: Set<string>; // infobox type names to include
}

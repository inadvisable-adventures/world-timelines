import type { ExtractedEvent } from './types.js';

export const TSV_HEADER = [
  'id', 'title', 'locations',
  'start_year', 'start_month', 'start_day',
  'end_year', 'end_month', 'end_day',
  'start_expr', 'end_expr', 'calendar', 'uncertainty_years',
  'category', 'infobox_type', 'description', 'tags',
].join('\t');

function esc(s: string): string {
  return s.replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '');
}

export function tsvRow(ev: ExtractedEvent): string {
  const sd = ev.startDate;
  const ed = ev.endDate;
  const locJson = JSON.stringify(ev.locations);

  // When there is no separate endDate, use startDate's own end fields —
  // preserves range expressions like "1337–1453" encoded in one EventDate.
  const endYear  = ed ? ed.startYear  : sd.endYear;
  const endMonth = ed ? ed.startMonth : sd.endMonth;
  const endDay   = ed ? ed.startDay   : sd.endDay;
  const endExpr  = ed ? ed.originalExpression : sd.originalExpression;

  return [
    esc(ev.id),
    esc(ev.title),
    esc(locJson),
    sd.startYear, sd.startMonth, sd.startDay,
    endYear, endMonth, endDay,
    esc(sd.originalExpression),
    esc(endExpr),
    esc(sd.detectedCalendar),
    sd.uncertaintyYears,
    ev.category,
    esc(ev.infoboxType),
    esc(ev.description),
    esc(JSON.stringify(ev.tags)),
  ].join('\t');
}

// Legacy stream-writing helpers kept for any scripts that pass an explicit stream.
export function writeTsvHeader(out: NodeJS.WritableStream = process.stdout): void {
  out.write(TSV_HEADER + '\n');
}

export function writeTsvRow(ev: ExtractedEvent, out: NodeJS.WritableStream = process.stdout): void {
  out.write(tsvRow(ev) + '\n');
}

import type { EventCategory, EventDate, EventLocation, HistoricalEvent } from '../types/index.js';

const VALID_CATEGORIES = new Set<string>(['person', 'event', 'place', 'artifact', 'pol_mil_organization', 'business', 'historical_period', 'concepts', 'other']);

function toCategory(raw: string): EventCategory {
  return VALID_CATEGORIES.has(raw) ? (raw as EventCategory) : 'other';
}

function unescape(s: string): string {
  return s.replace(/\\t/g, '\t').replace(/\\n/g, '\n');
}

function makeDate(
  year: number, month: number, day: number,
  endYear: number, endMonth: number, endDay: number,
  expr: string, calendar: string, uncertainty: number,
): EventDate {
  return {
    originalExpression: expr,
    detectedCalendar: calendar || 'gregorian',
    startYear: year,
    startMonth: month,
    startDay: day,
    endYear,
    endMonth,
    endDay,
    uncertaintyYears: uncertainty,
  };
}

export function parseTsv(text: string): HistoricalEvent[] {
  const lines = text.split('\n');
  const events: HistoricalEvent[] = [];

  // Skip header (index 0)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split('\t');
    if (cols.length < 16) continue;

    const [
      id, title, locationsRaw,
      startYearStr, startMonthStr, startDayStr,
      endYearStr, endMonthStr, endDayStr,
      startExpr, endExpr, calendar, uncertaintyStr,
      categoryRaw, infoboxType, description,
    ] = cols;

    const startYear = parseInt(startYearStr, 10);
    const startMonth = parseInt(startMonthStr, 10);
    const startDay = parseInt(startDayStr, 10);
    const endYear = parseInt(endYearStr, 10);
    const endMonth = parseInt(endMonthStr, 10);
    const endDay = parseInt(endDayStr, 10);
    const uncertainty = parseInt(uncertaintyStr, 10) || 0;

    if (isNaN(startYear) || isNaN(endYear)) continue;

    let locations: EventLocation[];
    try {
      locations = JSON.parse(locationsRaw) as EventLocation[];
    } catch {
      continue;
    }
    if (!Array.isArray(locations)) continue;

    let tags: string[] = [];
    const tagsRaw = cols[16];
    if (tagsRaw) {
      try { tags = JSON.parse(unescape(tagsRaw)) as string[]; } catch { /* leave empty */ }
    }

    const startDate = makeDate(
      startYear, startMonth, startDay,
      endYear, endMonth, endDay,
      unescape(startExpr), calendar, uncertainty,
    );

    // endDate is null if start and end are the same year (point events)
    const endDate =
      endYear !== startYear
        ? makeDate(
          endYear, endMonth, endDay,
          endYear, endMonth, endDay,
          unescape(endExpr), calendar, uncertainty,
        )
        : null;

    events.push({
      id: unescape(id),
      title: unescape(title),
      locations,
      startDate,
      endDate,
      category: toCategory(categoryRaw),
      infoboxType: unescape(infoboxType ?? ''),
      description: unescape(description ?? ''),
      tags,
    });
  }

  return events;
}

import type { EventDate } from './types.js';
import { detectStyle, estimateUncertainty } from './uncertainty-lut.js';

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// Detects calendar from expression heuristics.
function detectCalendar(expr: string): string {
  const s = expr.toLowerCase();
  if (/hijri|ah\b|هـ/.test(s)) return 'islamic';
  if (/julian|os\b/.test(s)) return 'julian';
  if (/hebrew|am\b/.test(s)) return 'hebrew';
  return 'gregorian';
}

function parseYear(yearStr: string, era: string): number {
  const y = parseInt(yearStr.replace(/,/g, ''), 10);
  if (isNaN(y)) return 0;
  return (era.toUpperCase() === 'BC' || era.toUpperCase() === 'BCE') ? -y : y;
}

function makeDate(
  year: number, month: number, day: number,
  endYear: number, endMonth: number, endDay: number,
  expr: string,
): EventDate {
  const calendar = detectCalendar(expr);
  const style = detectStyle(expr);
  const uncertainty = estimateUncertainty(year, style);
  return {
    originalExpression: expr,
    detectedCalendar: calendar,
    startYear: year,
    startMonth: month,
    startDay: day,
    endYear,
    endMonth,
    endDay,
    uncertaintyYears: uncertainty,
  };
}

// Parse a single date expression into an EventDate.
// Returns null if unparseable.
export function parseDate(raw: string): EventDate | null {
  const expr = raw.trim();
  if (!expr) return null;

  // Strip wiki template wrappers like {{birth date|1564|4|23}}
  const birthDateM = /\{\{birth\s*date(?:\s*and\s*age)?\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i.exec(expr);
  if (birthDateM) {
    const y = parseInt(birthDateM[1], 10);
    const m = parseInt(birthDateM[2], 10);
    const d = parseInt(birthDateM[3], 10);
    return makeDate(y, m, d, y, m, d, expr);
  }

  const deathDateM = /\{\{death\s*date(?:\s*and\s*age)?\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i.exec(expr);
  if (deathDateM) {
    const y = parseInt(deathDateM[1], 10);
    const m = parseInt(deathDateM[2], 10);
    const d = parseInt(deathDateM[3], 10);
    return makeDate(y, m, d, y, m, d, expr);
  }

  // Strip remaining {{ }} templates
  const clean = expr.replace(/\{\{[^}]*\}\}/g, '').replace(/\[\[[^\]]*\]\]/g, '').trim();

  // "circa YYYY BC/CE" or "c. YYYY BC"
  const circaM = /c\.?\s*(\d{1,4})\s*(BC|BCE|AD|CE)?/i.exec(clean);

  // "DD Month YYYY" or "Month DD, YYYY"
  const fullDateM =
    /(\d{1,2})\s+([A-Za-z]+)\s+(-?\d{1,4})\s*(BC|BCE|AD|CE)?/i.exec(clean) ||
    /([A-Za-z]+)\s+(\d{1,2}),?\s+(-?\d{1,4})\s*(BC|BCE|AD|CE)?/i.exec(clean);

  // "YYYY–YYYY" range
  const rangeM = /(-?\d{1,4})\s*[-–—]\s*(-?\d{1,4})\s*(BC|BCE|AD|CE)?/i.exec(clean);

  // "YYYY BC/CE"
  const yearM = /(-?\d{1,4})\s*(BC|BCE|AD|CE)?/i.exec(clean);

  // "Nth century BC/CE"
  const centuryM = /(\d{1,2})(?:st|nd|rd|th)\s+century\s*(BC|BCE|AD|CE)?/i.exec(clean);

  if (fullDateM) {
    const [, p1, p2, p3, eraStr = ''] = fullDateM;
    let day: number, monthStr: string, yearStr: string;
    if (/^\d/.test(p1)) {
      day = parseInt(p1, 10); monthStr = p2; yearStr = p3;
    } else {
      monthStr = p1; day = parseInt(p2, 10); yearStr = p3;
    }
    const month = MONTH_NAMES[monthStr.toLowerCase()] ?? 0;
    const year = parseYear(yearStr, eraStr);
    return makeDate(year, month, day, year, month, day, expr);
  }

  if (rangeM) {
    const [, y1str, y2str, eraStr = ''] = rangeM;
    const y1 = parseYear(y1str, eraStr);
    const y2 = parseYear(y2str, eraStr);
    return makeDate(Math.min(y1, y2), 0, 0, Math.max(y1, y2), 0, 0, expr);
  }

  if (centuryM) {
    const [, centStr, eraStr = ''] = centuryM;
    const cent = parseInt(centStr, 10);
    const endYear = (eraStr.toUpperCase().startsWith('B')) ? -(cent - 1) * 100 : cent * 100;
    const startYear = (eraStr.toUpperCase().startsWith('B')) ? -cent * 100 : (cent - 1) * 100;
    return makeDate(Math.min(startYear, endYear), 0, 0, Math.max(startYear, endYear), 0, 0, expr);
  }

  if (circaM) {
    const [, yearStr, eraStr = ''] = circaM;
    const year = parseYear(yearStr, eraStr);
    return makeDate(year, 0, 0, year, 0, 0, expr);
  }

  if (yearM) {
    const [, yearStr, eraStr = ''] = yearM;
    const year = parseYear(yearStr, eraStr);
    if (year === 0 && !clean.includes('0')) return null;
    return makeDate(year, 0, 0, year, 0, 0, expr);
  }

  return null;
}

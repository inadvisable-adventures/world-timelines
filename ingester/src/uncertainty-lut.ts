// LUT-based uncertainty estimation for dates per A2.e.
// Factors: historical era, expression style (exact/circa/century/range).

export type ExpressionStyle = 'exact' | 'circa' | 'century' | 'range' | 'unknown';

interface LutEntry {
  yearThreshold: number; // abs(year) >= this value → apply this row
  exact: number;
  circa: number;
  century: number;
  range: number;
  unknown: number;
}

// Rows ordered from most-ancient to most-recent; first matching row wins.
const LUT: LutEntry[] = [
  { yearThreshold: 50000, exact: 10000, circa: 20000, century: 25000, range: 15000, unknown: 20000 },
  { yearThreshold: 10000, exact: 2000,  circa: 5000,  century: 5000,  range: 3000,  unknown: 5000  },
  { yearThreshold: 3000,  exact: 200,   circa: 500,   century: 500,   range: 300,   unknown: 500   },
  { yearThreshold: 1000,  exact: 20,    circa: 100,   century: 100,   range: 50,    unknown: 100   },
  { yearThreshold: 500,   exact: 5,     circa: 50,    century: 50,    range: 20,    unknown: 50    },
  { yearThreshold: 0,     exact: 1,     circa: 20,    century: 50,    range: 10,    unknown: 20    },
];

export function estimateUncertainty(year: number, style: ExpressionStyle): number {
  const abs = Math.abs(year);
  for (const row of LUT) {
    if (abs >= row.yearThreshold) return row[style];
  }
  return LUT[LUT.length - 1][style];
}

export function detectStyle(expression: string): ExpressionStyle {
  const s = expression.toLowerCase();
  if (/\bc\.?\s*\d|\bcirca\b|\bapprox/.test(s)) return 'circa';
  if (/century|millennium/.test(s)) return 'century';
  if (/\d\s*[-–—to]\s*\d/.test(s)) return 'range';
  if (/\d{3,4}/.test(s)) return 'exact';
  return 'unknown';
}

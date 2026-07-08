export interface WikiPage {
  title: string;
  wikitext: string;
  namespace: number;
}

const PAGE_RE = /<page>([\s\S]*?)<\/page>/g;
const TITLE_RE = /<title>([^<]*)<\/title>/;
const NS_RE = /<ns>(\d+)<\/ns>/;
const TEXT_RE = /<text[^>]*>([\s\S]*?)<\/text>/;

// Decode the common XML entities that appear in Wikipedia wikitext.
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// Extract all <page> blocks from an XML chunk (a decompressed bz2 stream).
export function extractPages(xmlChunk: string): WikiPage[] {
  const pages: WikiPage[] = [];
  let m: RegExpExecArray | null;
  PAGE_RE.lastIndex = 0;

  while ((m = PAGE_RE.exec(xmlChunk)) !== null) {
    const pageXml = m[1];
    const titleM = TITLE_RE.exec(pageXml);
    const nsM = NS_RE.exec(pageXml);
    const textM = TEXT_RE.exec(pageXml);

    if (!titleM || !textM) continue;

    const namespace = nsM ? parseInt(nsM[1], 10) : 0;
    if (namespace !== 0) continue; // article namespace only

    pages.push({
      title: decodeXmlEntities(titleM[1]),
      wikitext: decodeXmlEntities(textM[1]),
      namespace,
    });
  }

  return pages;
}

export const PERFORMANCE_MODE_CHARACTER_THRESHOLD = 100_000;
export const PERFORMANCE_MODE_LINE_THRESHOLD = 1_500;

/**
 * Large Mermaid sources need a different presentation strategy. Counting is
 * deliberately allocation-free: splitting a multi-megabyte source just to
 * classify it creates another large array before rendering has even started.
 */
export function shouldUseDiagramPerformanceMode(source: string): boolean {
  if (source.length >= PERFORMANCE_MODE_CHARACTER_THRESHOLD) return true;
  if (source.length < PERFORMANCE_MODE_LINE_THRESHOLD) return false;

  let lines = 1;
  for (let index = 0; index < source.length; index++) {
    if (source.charCodeAt(index) === 10 && ++lines >= PERFORMANCE_MODE_LINE_THRESHOLD) return true;
  }
  return false;
}

/** Read Mermaid's root viewBox without constructing a second SVG DOM tree. */
export function readSvgViewBox(svg: string): { width: number; height: number } | null {
  const rootStart = svg.search(/<svg\b/i);
  if (rootStart < 0) return null;
  const rootEnd = svg.indexOf(">", rootStart);
  if (rootEnd < 0) return null;
  const match = svg.slice(rootStart, rootEnd + 1).match(/\bviewBox=["']([^"']+)["']/i);
  if (!match) return null;
  const values = match[1]
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return null;
  const [, , width, height] = values;
  return width > 0 && height > 0 ? { width, height } : null;
}

/** Hint that visual precision is less important than paint speed for this SVG. */
export function optimizeSvgForImageRendering(svg: string): string {
  return svg.replace(
    /<svg\b/i,
    '<svg shape-rendering="optimizeSpeed" text-rendering="optimizeSpeed" color-rendering="optimizeSpeed"',
  );
}

// Mermaid defaults to 50,000 characters and 500 edges, which is too small for
// imported schema diagrams. Keep a generous, finite ceiling so 10k-12k-line
// ERDs work without making malformed input completely unbounded.
export const LARGE_DIAGRAM_MAX_TEXT_SIZE = 10_000_000;
export const LARGE_DIAGRAM_MAX_EDGES = 20_000;

/** Return a fresh object because Mermaid may normalize its configuration. */
export function largeDiagramMermaidConfig() {
  return {
    securityLevel: "loose",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    maxTextSize: LARGE_DIAGRAM_MAX_TEXT_SIZE,
    maxEdges: LARGE_DIAGRAM_MAX_EDGES,
  } as const;
}

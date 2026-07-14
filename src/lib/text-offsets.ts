// Character-offset helpers for the CSS Custom Highlight API.
//
// Highlights are stored as [start,end] character offsets within a page's
// rendered content container. This survives re-renders (no DOM mutation) and
// handles selections that span multiple elements — the text-match approach
// could only wrap text inside a single node.

function textNodes(container: HTMLElement): Text[] {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n as Text);
  return nodes;
}

/** Offset of (node, nodeOffset) measured in characters from the start of container. */
function pointToOffset(container: HTMLElement, node: Node, nodeOffset: number): number | null {
  let acc = 0;
  for (const t of textNodes(container)) {
    if (t === node) return acc + nodeOffset;
    acc += t.textContent?.length ?? 0;
  }
  // The point may sit on an element node (e.g. between children); approximate by
  // summing text length of everything before it.
  if (node.nodeType === Node.ELEMENT_NODE) {
    const range = document.createRange();
    range.selectNodeContents(container);
    try {
      range.setEnd(node, nodeOffset);
      return range.toString().length;
    } catch {
      return null;
    }
  }
  return null;
}

/** Selection start/end as character offsets within container, or null. */
export function getSelectionOffsets(
  container: HTMLElement,
): { start: number; end: number; text: string } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const start = pointToOffset(container, range.startContainer, range.startOffset);
  const end = pointToOffset(container, range.endContainer, range.endOffset);
  if (start == null || end == null || start === end) return null;
  return { start: Math.min(start, end), end: Math.max(start, end), text: sel.toString() };
}

/** Rebuild a DOM Range for the given character offsets within container. */
export function buildRange(container: HTMLElement, start: number, end: number): Range | null {
  const nodes = textNodes(container);
  let acc = 0;
  let startNode: Text | null = null;
  let startLocal = 0;
  let endNode: Text | null = null;
  let endLocal = 0;
  for (const t of nodes) {
    const len = t.textContent?.length ?? 0;
    if (!startNode && start <= acc + len) {
      startNode = t;
      startLocal = start - acc;
    }
    if (end <= acc + len) {
      endNode = t;
      endLocal = end - acc;
      break;
    }
    acc += len;
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  try {
    range.setStart(startNode, Math.max(0, Math.min(startLocal, startNode.length)));
    range.setEnd(endNode, Math.max(0, Math.min(endLocal, endNode.length)));
    return range;
  } catch {
    return null;
  }
}

/** Character offset under a screen point (for click-to-edit hit testing). */
export function offsetFromPoint(container: HTMLElement, x: number, y: number): number | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(x, y);
    if (!r) return null;
    return pointToOffset(container, r.startContainer, r.startOffset);
  }
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    if (!p) return null;
    return pointToOffset(container, p.offsetNode, p.offset);
  }
  return null;
}

/** Fallback range for legacy highlights that only stored text (no offsets). */
export function firstTextRange(container: HTMLElement, text: string): Range | null {
  const needle = text.trim();
  if (!needle) return null;
  const full = container.textContent ?? "";
  const idx = full.toLowerCase().indexOf(needle.toLowerCase());
  if (idx === -1) return null;
  return buildRange(container, idx, idx + needle.length);
}

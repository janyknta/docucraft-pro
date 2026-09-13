/**
 * Reads a rendered Mermaid SVG back into a graph we can animate.
 *
 * Mermaid already did the hard part twice over: it laid the diagram out, and it
 * left the topology in the DOM. A flowchart edge is a `path.flowchart-link`
 * carrying `data-id="L_<source>_<target>_<index>"`, so source and target come
 * straight off the element and we never parse the Mermaid text ourselves. That
 * matters: a second parser would be a second dialect to keep in sync with
 * upstream, and it would disagree with the layout the reader is looking at.
 *
 * Everything here is read-only. Nothing in this module mutates the SVG.
 */

import { isSequenceDiagram, readSequence } from "./sequence";

/** A node as laid out by Mermaid. */
export interface ExplainerNode {
  /** The mermaid-assigned element id; unique within one render. */
  id: string;
  /** The author's own identifier (`React`), recovered from the element id. */
  key: string;
  /** Visible text, used for step descriptions. */
  label: string;
  el: SVGGElement;
  /** Centre in diagram (viewBox) coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An edge, with the geometry the player needs to draw it. */
export interface ExplainerEdge {
  id: string;
  /** Author-level endpoints, as encoded in `data-id`. */
  sourceKey: string;
  targetKey: string;
  /** Resolved element ids, once endpoints are matched to nodes. */
  source: string;
  target: string;
  path: SVGPathElement;
  /** The label group riding on this edge, when it has one. */
  label: SVGGElement | null;
  /** Path length in user units; drives draw duration. */
  length: number;
}

export interface ExplainerGraph {
  nodes: Map<string, ExplainerNode>;
  edges: ExplainerEdge[];
  /** Subgraph boxes, for camera framing. */
  clusters: { el: SVGGElement; x: number; y: number; width: number; height: number }[];
  svg: SVGSVGElement;
  /** The untouched viewBox: the camera's home framing. */
  baseView: { x: number; y: number; width: number; height: number };
}

/** `translate(12.5, 40)` -> `{x, y}`, accumulated up to the svg root. */
function absoluteTranslate(el: Element): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let current: Element | null = el;
  while (current && current.tagName !== "svg") {
    const transform = current.getAttribute("transform");
    const match = transform?.match(/translate\(\s*([\d.eE+-]+)[,\s]+([\d.eE+-]+)\s*\)/);
    if (match) {
      x += parseFloat(match[1]);
      y += parseFloat(match[2]);
    }
    current = current.parentElement;
  }
  return { x, y };
}

/**
 * Recover the author's node name from a Mermaid element id.
 *
 * Mermaid builds these as `<graphId>-flowchart-<key>-<counter>`. The key itself
 * can contain hyphens, so we strip the known prefix and the trailing counter
 * rather than splitting on "-" and hoping.
 */
function nodeKeyFromId(id: string): string {
  const withoutCounter = id.replace(/-\d+$/, "");
  const marker = withoutCounter.match(/-(?:flowchart|state|entity|classId|node)-(.+)$/);
  if (marker) return marker[1];
  // Other diagram families don't use a prefix; the id is the key.
  return withoutCounter;
}

/**
 * Split `L_source_target_0` into its endpoints.
 *
 * Node names may themselves contain underscores, which makes this ambiguous in
 * general. We resolve it against the set of names we actually found, trying the
 * longest plausible source first, so `L_my_api_gateway_0` binds to a real
 * `my_api` before it invents one.
 */
/**
 * Every edge shape we know how to draw.
 *
 * Mermaid gives each diagram family its own edge class, but they are all a
 * single `<path>` with a start and an end, which is the only thing the player
 * needs. Sequence, timeline, xychart and journey are deliberately absent: they
 * have no node graph to walk, so the caller falls back rather than inventing an
 * order for something that has none.
 */
const EDGE_SELECTOR = [
  "path.flowchart-link", // flowchart
  "path.transition", // stateDiagram
  "path.relation", // classDiagram
  "path.relationshipLine", // erDiagram
].join(", ");

/**
 * Resolve an edge's endpoints from where it starts and ends.
 *
 * State diagrams number their edges (`edge0`) instead of naming the states they
 * join, so the id tells us nothing. The drawn path does: its first and last
 * points touch the boundary of the two nodes, so the nearest node to each end
 * is the answer. Distance is measured to the node's box rather than its centre,
 * so a wide node is not beaten by a narrow one that happens to sit closer to
 * the middle.
 */
function endpointsByGeometry(
  path: SVGPathElement,
  nodes: ExplainerNode[],
): { source: ExplainerNode; target: ExplainerNode } | null {
  if (nodes.length === 0) return null;
  let start: DOMPoint;
  let end: DOMPoint;
  try {
    const length = path.getTotalLength();
    if (!length) return null;
    start = path.getPointAtLength(0);
    end = path.getPointAtLength(length);
  } catch {
    return null;
  }
  const nearest = (point: { x: number; y: number }) => {
    let best: ExplainerNode | null = null;
    let bestDistance = Infinity;
    for (const node of nodes) {
      const dx = Math.max(Math.abs(point.x - node.x) - node.width / 2, 0);
      const dy = Math.max(Math.abs(point.y - node.y) - node.height / 2, 0);
      const distance = Math.hypot(dx, dy);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = node;
      }
    }
    return best;
  };
  const source = nearest(start);
  const target = nearest(end);
  if (!source || !target || source === target) return null;
  return { source, target };
}

function splitEdgeId(dataId: string, keys: Set<string>): { source: string; target: string } | null {
  const body = dataId.replace(/^L_/, "").replace(/_\d+$/, "");
  const parts = body.split("_");
  for (let cut = parts.length - 1; cut >= 1; cut--) {
    const source = parts.slice(0, cut).join("_");
    const target = parts.slice(cut).join("_");
    if (keys.has(source) && keys.has(target)) return { source, target };
  }
  return null;
}

/**
 * Build the animatable graph from a freshly rendered SVG.
 *
 * Returns `null` when the diagram has no edges we can sequence — a pie chart, a
 * mindmap, a gantt. Those still render perfectly well statically; they just
 * aren't a walk through a system, so the caller falls back rather than
 * inventing an order for something that has none.
 */
export function readGraph(svg: SVGSVGElement): ExplainerGraph | null {
  // A sequence diagram has no node graph at all — participants and messages
  // instead — so it gets its own reader rather than being forced through the
  // node/edge selectors below.
  if (isSequenceDiagram(svg)) return readSequence(svg);

  const view = svg.viewBox.baseVal;
  const baseView = { x: view.x, y: view.y, width: view.width, height: view.height };

  const nodes = new Map<string, ExplainerNode>();
  const byKey = new Map<string, ExplainerNode>();
  for (const el of svg.querySelectorAll<SVGGElement>("g.node")) {
    const position = absoluteTranslate(el);
    let width = 0;
    let height = 0;
    try {
      const box = el.getBBox();
      width = box.width;
      height = box.height;
    } catch {
      // getBBox throws on a detached or display:none subtree. A zero box only
      // costs the camera some padding, so it is not worth failing the render.
    }
    const node: ExplainerNode = {
      id: el.id,
      key: nodeKeyFromId(el.id),
      label: el.textContent?.trim() ?? "",
      el,
      x: position.x,
      y: position.y,
      width,
      height,
    };
    nodes.set(node.id, node);
    // First writer wins: with duplicate labels the earlier node keeps the key,
    // which matches the order Mermaid numbers them in.
    if (!byKey.has(node.key)) byKey.set(node.key, node);
  }

  const keys = new Set(byKey.keys());
  const paths = [...svg.querySelectorAll<SVGPathElement>(EDGE_SELECTOR)];
  // Mermaid emits one `g.edgeLabel` per edge, in path order, whether or not the
  // edge is labelled. Index-pairing is therefore exact, and cheaper (and more
  // stable) than matching a label box against a path midpoint.
  const labelGroups = [...svg.querySelectorAll<SVGGElement>("g.edgeLabels > g.edgeLabel")];

  const edges: ExplainerEdge[] = [];
  const nodeList = [...nodes.values()];
  paths.forEach((path, index) => {
    const dataId = path.getAttribute("data-id") ?? path.id;
    // Flowchart, class and ER diagrams name their endpoints in the edge id.
    // State diagrams do not (`edge0`, `edge1`, …), so fall back to geometry:
    // an edge's first and last point sit on the boundary of the nodes it
    // joins, which resolves them exactly.
    const named = splitEdgeId(dataId, keys);
    let source = named ? byKey.get(named.source) : undefined;
    let target = named ? byKey.get(named.target) : undefined;
    if (!source || !target) {
      const ends = endpointsByGeometry(path, nodeList);
      source = source ?? ends?.source;
      target = target ?? ends?.target;
    }
    if (!source || !target || source === target) return;
    let length = 0;
    try {
      length = path.getTotalLength();
    } catch {
      // Same reasoning as getBBox above; a zero-length edge just draws at the
      // floor duration instead of being scaled by its length.
    }
    edges.push({
      id: path.id || dataId,
      sourceKey: source.key,
      targetKey: target.key,
      source: source.id,
      target: target.id,
      path,
      label: labelGroups[index] ?? null,
      length,
    });
  });

  if (edges.length === 0) return null;

  const clusters = [...svg.querySelectorAll<SVGGElement>("g.cluster")].map((el) => {
    const rect = el.querySelector("rect");
    return {
      el,
      x: parseFloat(rect?.getAttribute("x") ?? "0"),
      y: parseFloat(rect?.getAttribute("y") ?? "0"),
      width: parseFloat(rect?.getAttribute("width") ?? "0"),
      height: parseFloat(rect?.getAttribute("height") ?? "0"),
    };
  });

  return { nodes, edges, clusters, svg, baseView };
}

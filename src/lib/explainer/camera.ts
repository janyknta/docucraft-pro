/**
 * Automatic camera.
 *
 * The camera exists to keep the active part of a large diagram legible, not to
 * be noticed. Two rules follow from that:
 *
 *  - A diagram that already fits stays still. Drifting around a five-node
 *    flowchart that was perfectly readable to begin with is motion for its own
 *    sake, and it makes the result feel like a screensaver.
 *  - When it does move, it moves to a framing that still contains context, not
 *    a tight crop on one node. You should always be able to see where you came
 *    from.
 *
 * Framing is expressed as a viewBox, so "camera" costs one attribute write per
 * frame and nothing re-renders.
 */

import type { ExplainerGraph } from "./graph";
import { TALL_STAGE_RATIO } from "@/components/docs/stage-ratio";

export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Below this, the whole diagram is framed for the entire run.
 *
 * The threshold is in diagram units relative to the home view: a graph whose
 * content is under ~1.6 screenfuls is readable whole at any sane display size,
 * so it gets no camera at all.
 */
/**
 * Only a genuinely large diagram gets a camera.
 *
 * The first cut of this followed anything over eight nodes and zoomed to fill
 * just over half the view, which cropped most of the picture for the entire
 * run — you could not see the blocks. Following is now the rare case: the
 * diagram has to be big enough that showing it whole would make the labels
 * unreadable before the camera earns its keep.
 */
const FOLLOW_MIN_NODES = 18;
/** Diagram units past which the whole graph stops being legible at once. */
const FOLLOW_MIN_EXTENT = 2600;
/**
 * How much of the view the active region fills when followed.
 *
 * Low, deliberately: the active nodes should sit in a wide pocket of context,
 * so you always see where you came from and where you are going.
 */
const FOCUS_FILL = 0.3;
/** Never zoom past this. A two-node hop must not fill the screen. */
const MAX_ZOOM = 1.6;

export function shouldFollow(graph: ExplainerGraph): boolean {
  const { baseView, nodes } = graph;
  if (nodes.size < FOLLOW_MIN_NODES) return false;
  // A very tall diagram is rendered at full height and scrolled by the page, so
  // every node is already on screen at natural size as the reader arrives at
  // it. Panning a viewBox underneath that would fight the page's own scroll.
  if (baseView.height / baseView.width > TALL_STAGE_RATIO) return false;
  // Extent, not node count: twenty nodes in a tight grid still read fine whole.
  return Math.max(baseView.width, baseView.height) > FOLLOW_MIN_EXTENT;
}

/** The whole diagram, with a small margin so nothing touches the edge. */
export function homeFrame(graph: ExplainerGraph): Frame {
  const { baseView } = graph;
  const pad = Math.max(baseView.width, baseView.height) * 0.02;
  return {
    x: baseView.x - pad,
    y: baseView.y - pad,
    width: baseView.width + pad * 2,
    height: baseView.height + pad * 2,
  };
}

/**
 * Frame the region spanned by the given nodes, keeping the home aspect ratio.
 *
 * The result is clamped inside the home frame: the camera never shows empty
 * space beyond the diagram, which would read as the picture sliding off.
 */
export function frameFor(graph: ExplainerGraph, nodeIds: string[]): Frame {
  const home = homeFrame(graph);
  const points = nodeIds
    .map((id) => graph.nodes.get(id))
    .filter((node): node is NonNullable<typeof node> => Boolean(node));
  if (points.length === 0) return home;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of points) {
    minX = Math.min(minX, node.x - node.width / 2);
    maxX = Math.max(maxX, node.x + node.width / 2);
    minY = Math.min(minY, node.y - node.height / 2);
    maxY = Math.max(maxY, node.y + node.height / 2);
  }

  const aspect = home.width / home.height;
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;

  // Grow the region to the target fill, then to the home aspect ratio, so the
  // SVG never letterboxes and the active nodes sit in a pocket of context.
  let width = (maxX - minX) / FOCUS_FILL;
  let height = (maxY - minY) / FOCUS_FILL;
  if (width / height > aspect) height = width / aspect;
  else width = height * aspect;

  // Respect the zoom ceiling and never exceed the home framing.
  width = Math.max(width, home.width / MAX_ZOOM);
  height = Math.max(height, home.height / MAX_ZOOM);
  width = Math.min(width, home.width);
  height = Math.min(height, home.height);

  const x = Math.min(Math.max(centreX - width / 2, home.x), home.x + home.width - width);
  const y = Math.min(Math.max(centreY - height / 2, home.y), home.y + home.height - height);
  return { x, y, width, height };
}

/** Linear blend between two framings; the caller supplies the easing. */
export function lerpFrame(from: Frame, to: Frame, t: number): Frame {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    width: from.width + (to.width - from.width) * t,
    height: from.height + (to.height - from.height) * t,
  };
}

export function applyFrame(svg: SVGSVGElement, frame: Frame): void {
  svg.setAttribute("viewBox", `${frame.x} ${frame.y} ${frame.width} ${frame.height}`);
}

export function framesEqual(a: Frame, b: Frame): boolean {
  const epsilon = 0.5;
  return (
    Math.abs(a.x - b.x) < epsilon &&
    Math.abs(a.y - b.y) < epsilon &&
    Math.abs(a.width - b.width) < epsilon &&
    Math.abs(a.height - b.height) < epsilon
  );
}

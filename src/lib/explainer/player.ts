/**
 * Plays an explainer plan against a rendered SVG.
 *
 * The player is a pure function of one number: elapsed time. Every frame it
 * renders the plan *from scratch* at time `t` rather than accumulating state,
 * which is what makes stepping, scrubbing and reversing work — going backwards
 * is just a smaller `t`, not an undo log. It also means a dropped frame can
 * never desynchronise the diagram from the timeline.
 *
 * The synchronisation rule the brief cares about falls straight out of this: a
 * node's reveal step *begins* at the timestamp where its incoming edge's draw
 * step ends. Arrival isn't a delay that happens to line up, it is the same
 * instant expressed once.
 */

import type { ExplainerGraph } from "./graph";
import { REVEAL_MS, SETTLE_MS, edgeDuration, stepDuration } from "./plan";
import type { ExplainerPlan, ExplainerStep } from "./plan";
import { applyFrame, frameFor, framesEqual, homeFrame, lerpFrame, shouldFollow } from "./camera";
import type { Frame } from "./camera";

/** A step placed on the timeline. */
interface ScheduledStep {
  step: ExplainerStep;
  start: number;
  end: number;
}

export interface PlayerState {
  time: number;
  duration: number;
  playing: boolean;
  /** Index of the step currently under the playhead. */
  index: number;
  stepCount: number;
}

const CAMERA_EASE_MS = 620;
/** How long a revisit target keeps pulsing after its edge lands. */
const PULSE_TAIL_MS = 420;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

export class ExplainerPlayer {
  private readonly schedule: ScheduledStep[] = [];
  private readonly follow: boolean;
  private readonly home: Frame;
  /** Camera framing per step index, precomputed so a frame costs no layout. */
  private readonly frames: Frame[] = [];
  /**
   * Edges by id.
   *
   * `render` used to resolve each edge step with `edges.find(...)`, a linear
   * scan, inside a loop over every step — which made drawing one frame
   * quadratic in the size of the diagram. A 2,000-edge ERD spent millions of
   * array probes per frame and took the tab with it. The map turns that into a
   * hash lookup.
   */
  private readonly edgesById = new Map<string, ExplainerGraph["edges"][number]>();
  /**
   * Which elements the last painted frame actually touched.
   *
   * Repainting every node on every tick is the other half of the old cost: a
   * node whose opacity is already 1 does not need its style rewritten sixty
   * times a second, and each redundant write invalidates style for the whole
   * subtree. Tracking what is currently non-default lets a frame touch only
   * what changed between the previous `t` and this one.
   */
  private readonly paintedNodes = new Set<string>();
  private readonly paintedEdges = new Set<string>();
  private readonly pulsingNodes = new Set<string>();
  /**
   * How far the "everything before this is finished" pass has already run.
   *
   * Without it, settling walks every completed step on every frame — which is
   * cheap per step but linear in the diagram, so a long run drifts back into
   * exactly the per-frame cost this rewrite removed. Forward playback only
   * settles what newly passed the playhead; a backwards seek rewinds it.
   */
  private settledThrough = 0;
  private raf = 0;
  private lastTick = 0;
  private time = 0;
  private playing = false;
  private speed = 1;
  private appliedFrame: Frame | null = null;

  constructor(
    private readonly graph: ExplainerGraph,
    private readonly plan: ExplainerPlan,
    private readonly onState: (state: PlayerState) => void,
  ) {
    let cursor = 0;
    for (const step of plan.steps) {
      const length = stepDuration(step);
      this.schedule.push({ step, start: cursor, end: cursor + length });
      cursor += length;
    }
    for (const edge of graph.edges) this.edgesById.set(edge.id, edge);
    this.follow = shouldFollow(graph);
    this.home = homeFrame(graph);
    this.frames = this.buildFrames();
    this.prepare();
  }

  /**
   * Precompute the framing for each step.
   *
   * A step's frame spans the nodes in play — for an edge, both endpoints — so
   * the camera is already holding the destination as the arrow arrives, rather
   * than chasing it afterwards.
   */
  private buildFrames(): Frame[] {
    if (!this.follow) return this.schedule.map(() => this.home);
    return this.schedule.map(({ step }) => {
      const ids = step.type === "reveal-node" ? [step.nodeId] : [step.from, step.to];
      return frameFor(this.graph, ids);
    });
  }

  /** The full run length at 1x, in milliseconds. */
  get duration(): number {
    return this.schedule.length === 0 ? 0 : this.schedule[this.schedule.length - 1].end;
  }

  /**
   * Put the diagram into its pre-roll state and take ownership of visibility.
   *
   * Setting `data-explainer` here rather than at mount is deliberate: until
   * this runs, the CSS that hides things does not apply, so a diagram that
   * never reaches the player is never left blank.
   */
  private prepare(): void {
    const { svg } = this.graph;
    svg.parentElement?.setAttribute("data-explainer", "");

    for (const node of this.graph.nodes.values()) {
      node.el.classList.add("explainer-node", "explainer-hidden");
    }

    for (const edge of this.graph.edges) {
      const { path } = edge;
      // Stash the arrowhead: a marker renders at full size regardless of how
      // little of the path is drawn, so an undrawn edge would show its arrow
      // hanging in space at the destination.
      const marker = path.getAttribute("marker-end");
      if (marker) path.dataset.explainerMarker = marker;
      path.style.strokeDasharray = `${edge.length} ${edge.length}`;
      path.style.strokeDashoffset = `${edge.length}`;
      path.removeAttribute("marker-end");
      edge.label?.classList.add("explainer-label", "explainer-hidden");
    }

    this.render(0);
  }

  /** Restore the SVG to a plain static diagram and drop the clock. */
  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.playing = false;
    this.paintedNodes.clear();
    this.paintedEdges.clear();
    this.pulsingNodes.clear();
    this.settledThrough = 0;
    const { svg } = this.graph;
    svg.parentElement?.removeAttribute("data-explainer");
    for (const node of this.graph.nodes.values()) {
      node.el.classList.remove(
        "explainer-node",
        "explainer-hidden",
        "explainer-shown",
        "explainer-pulse",
      );
      node.el.style.opacity = "";
    }
    for (const edge of this.graph.edges) {
      const { path } = edge;
      path.style.strokeDasharray = "";
      path.style.strokeDashoffset = "";
      const marker = path.dataset.explainerMarker;
      if (marker) {
        path.setAttribute("marker-end", marker);
        delete path.dataset.explainerMarker;
      }
      edge.label?.classList.remove("explainer-label", "explainer-hidden");
      if (edge.label) edge.label.style.opacity = "";
    }
    applyFrame(svg, this.home);
  }

  /**
   * Draw the diagram as it stands at time `t`.
   *
   * Every element's state is derived from `t` alone. Steps before the playhead
   * are complete, the step under it is interpolated, everything after is in its
   * pre-roll state.
   */
  private render(t: number): void {
    // Everything before the playhead is finished, everything after is still in
    // its pre-roll state, and only the steps *straddling* `t` are in motion.
    // Finding that window by binary search means a frame costs O(log n + k) in
    // the number of steps actually animating, rather than O(steps × edges).
    const active = this.activeRange(t);

    const shown = new Set<string>();
    const pulsing = new Set<string>();

    for (let index = active.first; index <= active.last; index++) {
      const entry = this.schedule[index];
      if (!entry) continue;
      const { step, start, end } = entry;
      const span = end - start;
      const progress = span <= 0 ? 1 : (t - start) / span;

      if (step.type === "reveal-node") {
        // The settle beat is padding after the fade, so the node is fully
        // opaque before the next edge starts moving.
        const fade = span <= 0 ? 1 : (t - start) / REVEAL_MS;
        if (fade > 0) shown.add(step.nodeId);
        this.paintNode(step.nodeId, Math.min(1, Math.max(0, fade)));
        continue;
      }

      const edge = this.edgesById.get(step.edgeId);
      if (!edge) continue;
      const clamped = Math.min(1, Math.max(0, progress));
      this.paintEdge(edge, easeOut(clamped));
      if (step.type === "draw-edge-revisit" && clamped >= 1 && t < end + 420) {
        pulsing.add(step.to);
      }
    }

    // Steps wholly behind the playhead are complete. Painting them once as
    // they pass — and then leaving them alone — is what removes the per-frame
    // walk over the whole diagram.
    this.settleCompleted(active.first, shown);
    // Anything still ahead of the playhead must be returned to its pre-roll
    // state, but only if this frame moved backwards past it (a seek or a step
    // back); forward playback never needs it.
    this.resetPending(active.last, t);
    this.syncPulse(pulsing);

    this.paintCamera(t);
  }

  /**
   * The span of steps overlapping `t`, plus the short pulse tail after a
   * revisit edge lands.
   *
   * The schedule is sorted and contiguous, so the first step whose `end`
   * exceeds `t` is a binary search; from there we walk forward only while
   * steps are still in flight, which is a handful even on a huge diagram.
   */
  private activeRange(t: number): { first: number; last: number } {
    if (this.schedule.length === 0) return { first: 0, last: -1 };

    let low = 0;
    let high = this.schedule.length - 1;
    let first = this.schedule.length;
    while (low <= high) {
      const mid = (low + high) >> 1;
      // The pulse tail keeps a finished revisit "active" a little longer, so
      // it is included in the search rather than handled as a special case.
      if (this.schedule[mid].end + PULSE_TAIL_MS > t) {
        first = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    if (first >= this.schedule.length) {
      return { first: this.schedule.length, last: this.schedule.length - 1 };
    }

    let last = first;
    while (last + 1 < this.schedule.length && this.schedule[last + 1].start <= t) last++;
    return { first, last };
  }

  /**
   * Bring everything before the active window to its finished state.
   *
   * Only the elements not already marked as painted are touched, so a step
   * that completed twenty frames ago costs nothing now.
   */
  private settleCompleted(activeFirst: number, shown: Set<string>): void {
    // A seek backwards leaves the cursor ahead of the playhead; drop it back so
    // the steps between are settled again on the way forward.
    if (activeFirst < this.settledThrough) this.settledThrough = activeFirst;
    for (let index = this.settledThrough; index < activeFirst; index++) {
      const { step } = this.schedule[index];
      if (step.type === "reveal-node") {
        shown.add(step.nodeId);
        if (!this.paintedNodes.has(step.nodeId)) this.paintNode(step.nodeId, 1);
        continue;
      }
      const edge = this.edgesById.get(step.edgeId);
      if (edge && !this.paintedEdges.has(edge.id)) this.paintEdge(edge, 1);
    }
    this.settledThrough = Math.max(this.settledThrough, activeFirst);
  }

  /**
   * Return steps ahead of the playhead to pre-roll, for a backwards seek.
   *
   * Forward playback leaves nothing to undo, so the common case exits without
   * touching the DOM at all.
   */
  private resetPending(activeLast: number, t: number): void {
    if (this.paintedNodes.size === 0 && this.paintedEdges.size === 0) return;
    for (let index = activeLast + 1; index < this.schedule.length; index++) {
      const { step, start } = this.schedule[index];
      if (start > t + PULSE_TAIL_MS && !this.hasPainted(step)) break;
      if (step.type === "reveal-node") {
        if (this.paintedNodes.has(step.nodeId)) this.paintNode(step.nodeId, 0);
        continue;
      }
      const edge = this.edgesById.get(step.edgeId);
      if (edge && this.paintedEdges.has(edge.id)) this.paintEdge(edge, 0);
    }
  }

  private hasPainted(step: ExplainerStep): boolean {
    return step.type === "reveal-node"
      ? this.paintedNodes.has(step.nodeId)
      : this.paintedEdges.has(step.edgeId);
  }

  /** Move the pulse class to exactly the nodes that should carry it. */
  private syncPulse(pulsing: Set<string>): void {
    for (const nodeId of this.pulsingNodes) {
      if (pulsing.has(nodeId)) continue;
      this.graph.nodes.get(nodeId)?.el.classList.remove("explainer-pulse");
    }
    for (const nodeId of pulsing) {
      if (this.pulsingNodes.has(nodeId)) continue;
      this.graph.nodes.get(nodeId)?.el.classList.add("explainer-pulse");
    }
    this.pulsingNodes.clear();
    for (const nodeId of pulsing) this.pulsingNodes.add(nodeId);
  }

  /**
   * Reveal is opacity only, deliberately.
   *
   * An earlier version also scaled the node up from 0.94, which needed
   * `transform-box: view-box` to scale about the node's own centre. That was a
   * trap: `view-box` re-anchors the element's transform reference box to the
   * SVG viewport and stops honouring the `transform` *attribute* Mermaid uses
   * to position each node — every node collapsed onto the same origin, leaving
   * one pile of overlapping boxes and a row of orphaned arrows. A fade alone
   * carries the sequence perfectly well and cannot move anything.
   */
  private paintNode(nodeId: string, amount: number): void {
    const node = this.graph.nodes.get(nodeId);
    if (!node) return;
    node.el.style.opacity = `${easeOut(amount)}`;
    node.el.classList.toggle("explainer-hidden", amount <= 0);
    node.el.classList.toggle("explainer-shown", amount >= 1);
    // Track only what is off its pre-roll default, so `resetPending` knows
    // exactly which elements still need undoing after a backwards seek.
    if (amount <= 0) this.paintedNodes.delete(nodeId);
    else this.paintedNodes.add(nodeId);
  }

  private paintEdge(edge: ExplainerGraph["edges"][number], amount: number): void {
    const { path } = edge;
    path.style.strokeDashoffset = `${edge.length * (1 - amount)}`;
    if (amount <= 0) this.paintedEdges.delete(edge.id);
    else this.paintedEdges.add(edge.id);
    // The arrowhead comes back only once the stroke has actually landed, so
    // the arrow appears to arrive rather than to have been waiting.
    const marker = path.dataset.explainerMarker;
    if (marker) {
      if (amount >= 0.999) path.setAttribute("marker-end", marker);
      else path.removeAttribute("marker-end");
    }
    if (edge.label) {
      // Labels fade in over the back half of the draw, so they don't announce
      // an edge that hasn't been made yet.
      const labelAmount = Math.min(1, Math.max(0, (amount - 0.5) * 2));
      edge.label.style.opacity = `${labelAmount}`;
      edge.label.classList.toggle("explainer-hidden", labelAmount <= 0);
    }
  }

  /**
   * Ease the viewBox toward the active step's framing.
   *
   * The camera leads slightly: it starts moving at the beginning of a step and
   * settles well before the step ends, so the motion is over by the time the
   * thing you're meant to look at happens.
   */
  private paintCamera(t: number): void {
    if (!this.follow) {
      if (!this.appliedFrame) {
        applyFrame(this.graph.svg, this.home);
        this.appliedFrame = this.home;
      }
      return;
    }
    const index = this.indexAt(t);
    if (index < 0) return;
    const target = this.frames[index] ?? this.home;
    const previous = index > 0 ? (this.frames[index - 1] ?? this.home) : this.home;
    const { start } = this.schedule[index];
    const blend = Math.min(1, Math.max(0, (t - start) / CAMERA_EASE_MS));
    const frame = lerpFrame(previous, target, easeInOut(blend));
    if (this.appliedFrame && framesEqual(this.appliedFrame, frame)) return;
    applyFrame(this.graph.svg, frame);
    this.appliedFrame = frame;
  }

  private indexAt(t: number): number {
    for (let i = 0; i < this.schedule.length; i++) {
      if (t < this.schedule[i].end) return i;
    }
    return this.schedule.length - 1;
  }

  private emit(): void {
    this.onState({
      time: this.time,
      duration: this.duration,
      playing: this.playing,
      index: this.indexAt(this.time),
      stepCount: this.schedule.length,
    });
  }

  private tick = (now: number): void => {
    if (!this.playing) return;
    const delta = this.lastTick === 0 ? 16 : now - this.lastTick;
    this.lastTick = now;
    this.time = Math.min(this.duration, this.time + delta * this.speed);
    this.render(this.time);
    if (this.time >= this.duration) {
      this.playing = false;
      this.emit();
      return;
    }
    this.emit();
    this.raf = requestAnimationFrame(this.tick);
  };

  play(): void {
    if (this.playing) return;
    // Replay from the top rather than sitting at the end.
    if (this.time >= this.duration) this.time = 0;
    this.playing = true;
    this.lastTick = 0;
    this.raf = requestAnimationFrame(this.tick);
    this.emit();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.emit();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(time: number): void {
    this.time = Math.min(this.duration, Math.max(0, time));
    this.lastTick = 0;
    this.render(this.time);
    this.emit();
  }

  restart(): void {
    this.seek(0);
    this.play();
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  /**
   * Move exactly one meaningful event.
   *
   * Forward lands on the *end* of the current step, so one press completes
   * whatever is in flight; the next press completes the one after. Back lands
   * on the start of the previous step, so you can re-watch a hop.
   */
  step(direction: 1 | -1): void {
    this.pause();
    const index = this.indexAt(this.time);
    if (direction === 1) {
      const current = this.schedule[index];
      if (!current) return;
      // Already sitting on this step's end: advance to the next one's end.
      const target = this.time >= current.end - 1 ? this.schedule[index + 1] : current;
      this.seek(target ? target.end : this.duration);
    } else {
      const current = this.schedule[index];
      if (!current) return;
      const target = this.time <= current.start + 1 ? this.schedule[index - 1] : current;
      this.seek(target ? target.start : 0);
    }
  }

  /** A short human description of the step at the playhead, for the caption. */
  describe(index: number): string {
    const entry = this.schedule[index];
    if (!entry) return "";
    const { step } = entry;
    if (step.type === "reveal-node") return step.label || "Node";
    const from = this.graph.nodes.get(step.from)?.label ?? "";
    const to = this.graph.nodes.get(step.to)?.label ?? "";
    return `${from} → ${to}`;
  }
}

export { edgeDuration, SETTLE_MS };

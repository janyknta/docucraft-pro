import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Expand, LoaderCircle, Minus, Plus, Star, X } from "lucide-react";
import { toast } from "sonner";
import { MermaidAnimator, type MermaidAnimator as MermaidAnimatorInstance } from "mermaid-animator";
import { useSaveAction } from "./save-action";
import { applySemantics } from "@/lib/explainer/semantics";
import { clearRenderArtifacts, describeRenderError } from "./render-error";
import { largeDiagramMermaidConfig } from "./mermaid-config";
import {
  MAX_STAGE_RATIO,
  MIN_STAGE_RATIO,
  clampStageRatio,
  isTallStage,
  stageBoxStyle,
  stageWidthCap,
  type DiagramSize,
} from "./stage-ratio";

/** A tall stage takes the full column, so it gets no width cap at all. */
function widthCap(ratio: number): string | undefined {
  const cap = stageWidthCap(ratio);
  return cap ? `calc(${cap})` : undefined;
}

/**
 * Explainer mode renders through plain `mermaid` rather than the animator, so
 * it is a separate chunk. Splitting it keeps a reader who never switches modes
 * from downloading the planner and player at all.
 */
const MermaidExplainer = lazy(() =>
  import("./MermaidExplainer").then((m) => ({ default: m.MermaidExplainer })),
);

/**
 * How a diagram is presented.
 *
 * `raw` is Mermaid exactly as it renders, with no motion. `stepped` walks the
 * graph one edge at a time, revealing each node as the arrow reaches it — the
 * explainer. `flow` is the continuous animation: packets travelling every edge
 * at once, plus the `flow:` choreography and WebM export that belong to it.
 *
 * Ordered as the reader would escalate: the picture, then the walk through it,
 * then the thing in motion.
 */
export type MermaidMode = "raw" | "stepped" | "flow";

const MODE_ORDER: MermaidMode[] = ["raw", "stepped", "flow"];
const MODE_LABEL: Record<MermaidMode, string> = {
  raw: "Raw",
  stepped: "Stepped",
  flow: "Flow",
};
const MODE_HINT: Record<MermaidMode, string> = {
  raw: "The diagram, no animation",
  stepped: "Walk the graph one step at a time",
  flow: "Continuous flow along every edge",
};

/**
 * The three presentations, as one segmented control.
 *
 * A tablist rather than a cycling button: the modes are siblings, and a reader
 * should be able to see all three and pick one, not discover them by pressing
 * the same key repeatedly. Labels are words because "Raw" and "Stepped" have no
 * icon anyone would read correctly.
 */
function ModeTabs({
  mode,
  onChange,
  unavailable,
}: {
  mode: MermaidMode;
  onChange: (next: MermaidMode) => void;
  /** Modes this diagram cannot offer, with the reason, shown disabled. */
  unavailable?: Partial<Record<MermaidMode, string>>;
}) {
  const blocked = (option: MermaidMode) => Boolean(unavailable?.[option]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    // Step over anything disabled rather than landing on it, so the arrow keys
    // can only reach a tab that will actually do something.
    let index = MODE_ORDER.indexOf(mode);
    for (let hops = 0; hops < MODE_ORDER.length; hops++) {
      index = (index + delta + MODE_ORDER.length) % MODE_ORDER.length;
      if (!blocked(MODE_ORDER[index])) {
        onChange(MODE_ORDER[index]);
        return;
      }
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Diagram presentation"
      onKeyDown={onKeyDown}
      className="pointer-events-auto flex items-center overflow-hidden rounded-lg border border-border/70 bg-background/85 p-0.5 shadow-sm ring-1 ring-black/2 backdrop-blur-md"
    >
      {MODE_ORDER.map((option) => {
        const selected = option === mode;
        const reason = unavailable?.[option];
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={selected}
            // `aria-disabled` rather than `disabled`: the tab stays focusable
            // and keeps its tooltip, so a reader can find out *why* it is off
            // instead of meeting a control that ignores them silently.
            aria-disabled={reason ? true : undefined}
            // Only the active tab is in the tab order; arrow keys move between
            // them, which is how a tablist is meant to behave.
            tabIndex={selected ? 0 : -1}
            title={reason ?? MODE_HINT[option]}
            onClick={() => !reason && onChange(option)}
            className={`inline-flex h-7 items-center rounded-md px-2.5 text-[11px] font-medium transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
              reason
                ? "cursor-not-allowed text-muted-foreground/40"
                : selected
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {MODE_LABEL[option]}
          </button>
        );
      })}
    </div>
  );
}

// mermaid's erDiagram lexer reserves words like CLASS. Keep the existing
// compatibility fallback, but only apply it after the unmodified source fails.
function quoteErEntities(src: string): string {
  const q = (token: string) => (/^".*"$/.test(token) ? token : `"${token}"`);
  return src
    .split("\n")
    .map((line) => {
      const rel = line.match(/^(\s*)([\w".:-]+)(\s+)(\S*--\S*)(\s+)([\w".:-]+)(\s*:\s*.*)$/);
      if (!rel) return line;
      return rel[1] + q(rel[2]) + rel[3] + rel[4] + rel[5] + q(rel[6]) + rel[7];
    })
    .join("\n");
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function baseName(name: string) {
  return name.replace(/\.(mmd|mermaid|md|markdown)$/i, "") || "diagram";
}

export function Mermaid({
  code,
  name = "diagram",
  mode: initialMode = "raw",
}: {
  code: string;
  name?: string;
  /** Starting presentation. Readers can switch from the tray. */
  mode?: MermaidMode;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [mode, setMode] = useState<MermaidMode>(initialMode);
  const [dark, setDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  // Semantic colouring is a reader preference, published on <html> the same way
  // theme and font are. A diagram lives deep inside rendered markdown with no
  // props reaching it, so the attribute is the channel.
  const [colored, setColored] = useState(
    () =>
      typeof document === "undefined" ||
      document.documentElement.getAttribute("data-diagram-colors") !== "off",
  );
  const [renderError, setRenderError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  // Measured by the inline stage; the frame needs it too, to narrow with a tall
  // diagram instead of drawing a full-width border around empty space.
  const [stageRatio, setStageRatio] = useState<number | null>(null);
  // Present when the markdown viewer has delegated its save star to this tray.
  const saveAction = useSaveAction();
  const source = code.trim();
  const frameCap = stageRatio ? (widthCap(stageRatio) ?? null) : null;

  /**
   * A diagram with no sequence to walk — a sequence diagram, a timeline, an
   * xychart — has nothing for stepped mode to do.
   *
   * The tab is disabled rather than the mode being switched out from under the
   * reader. Silently flipping to Raw made the Stepped tab look broken (you
   * pressed it and it bounced back, unexplained), and because the report
   * arrives from the stage's own async render, calling `setMode` there updated
   * the parent while the child was still mounting.
   */
  const [steppedUnavailable, setSteppedUnavailable] = useState(false);
  const handleUnsupported = useCallback(() => setSteppedUnavailable(true), []);
  // A new diagram deserves a fresh verdict; the old one's may not apply.
  useEffect(() => setSteppedUnavailable(false), [source]);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setDark(root.classList.contains("dark"));
      setColored(root.getAttribute("data-diagram-colors") !== "off");
    });
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class", "data-diagram-colors"],
    });
    return () => observer.disconnect();
  }, []);

  // A syntax error removes the stage. Clear it when the source, theme or mode
  // changes so editing the diagram — or switching renderer — immediately gets a
  // fresh render attempt rather than staying stuck on the previous failure.
  useEffect(() => setRenderError(null), [source, dark, mode]);

  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  // One download, one format. The animation *is* the artifact, and WebM is the
  // only export that carries it; GIF and a still SVG were each a lossy answer to
  // a question nobody asked at the download button.
  const exportDiagram = useCallback(async () => {
    if (!source || exporting) return;
    setExporting(true);
    try {
      const exporter = await import("mermaid-animator/export");
      const blob = await exporter.exportVideo(source, {
        theme: dark ? "dark" : "light",
        width: 1200,
        height: 800,
        mermaid: largeDiagramMermaidConfig(),
      });
      download(blob, `${baseName(name)}.webm`);
      toast.success("Downloaded animated Mermaid as WebM");
    } catch (error) {
      toast.error("Could not export WebM", {
        description: error instanceof Error ? error.message : "The browser could not encode it.",
      });
    } finally {
      setExporting(false);
    }
  }, [dark, exporting, name, source]);

  if (!source) {
    return (
      <div className="my-6 flex min-h-40 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
        Add Mermaid source to preview the animation.
      </div>
    );
  }

  const downloadControl = (
    <TrayButton onClick={() => void exportDiagram()} label="Download WebM video" busy={exporting}>
      {exporting ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
    </TrayButton>
  );

  // Saving is something you do *to* this diagram, like downloading it, so it
  // joins that segment rather than floating in the corner as its own surface.
  const saveControl = saveAction ? (
    <TrayButton
      onClick={saveAction.toggle}
      label={saveAction.label}
      title={saveAction.title}
      active={saveAction.saved}
    >
      <Star className={`h-3.5 w-3.5 ${saveAction.saved ? "fill-gold text-gold" : ""}`} />
    </TrayButton>
  ) : null;

  const unavailable = steppedUnavailable
    ? { stepped: "This diagram has no sequence to step through" }
    : undefined;

  const modeControl = <ModeTabs mode={mode} onChange={setMode} unavailable={unavailable} />;

  // An unsupported diagram still has to show something: render it raw while
  // leaving the reader's chosen tab alone.
  const effectiveMode: MermaidMode = mode === "stepped" && steppedUnavailable ? "raw" : mode;

  /**
   * The bar above the diagram: what mode you are in, and what you can do to the
   * diagram as an object.
   *
   * Deliberately fixed rather than hover-revealed. Switching presentation is
   * navigation, and navigation you cannot see is navigation nobody finds — the
   * previous floating tray hid the tabs until the pointer happened to land on
   * the picture. Playback stays down on the artwork, next to the thing it
   * drives; this row is chrome.
   *
   * The WebM export appears in `flow` alone: it encodes the travelling-packet
   * animation, so offering it beside a still picture or a step-through would
   * hand back a file of something the reader is not looking at.
   */
  const header = (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-background/40 px-2 py-1.5">
      {modeControl}
      {/* Plain icons rather than an overflow menu. There are only ever two or
          three of these, and a menu made the reader open something to find out
          it held almost nothing. Each one appears only where it applies, so
          nothing needs hiding. */}
      <Tray>
        {saveControl}
        {effectiveMode === "flow" ? downloadControl : null}
        <TrayButton onClick={() => setFullscreen(true)} label="Fullscreen">
          <Expand className="h-3.5 w-3.5" />
        </TrayButton>
      </Tray>
    </div>
  );

  const stageFor = (stageFill: boolean) => {
    // Nothing is passed down any more: the surrounding controls live in the
    // header, and each stage renders only its own playback.
    const controls = undefined;
    if (effectiveMode === "stepped") {
      return (
        <Suspense fallback={<StageSpinner label="Loading explainer…" />}>
          <MermaidExplainer
            code={source}
            dark={dark}
            colored={colored}
            fill={stageFill}
            controls={controls}
            onError={setRenderError}
            onRatio={stageFill ? undefined : setStageRatio}
            onUnsupported={handleUnsupported}
          />
        </Suspense>
      );
    }
    if (effectiveMode === "raw") {
      return (
        <StaticStage
          code={source}
          dark={dark}
          colored={colored}
          fill={stageFill}
          controls={controls}
          onError={setRenderError}
          onRatio={stageFill ? undefined : setStageRatio}
        />
      );
    }
    return (
      <AnimatorStage
        code={source}
        dark={dark}
        fill={stageFill}
        controls={controls}
        onError={setRenderError}
        onRatio={stageFill ? undefined : setStageRatio}
      />
    );
  };

  return (
    <>
      {/* The frame hugs the stage rather than the column: a tall diagram is
          capped to a screenful and narrower than the text, and a full-width card
          around it would just re-draw the dead space the sizing removed. The cap
          is the stage's, mirrored here, because `w-fit` would instead collapse a
          wide diagram to its intrinsic width and shrink the picture. */}
      <div
        className="mermaid-frame my-6 overflow-hidden rounded-xl border border-border bg-muted/30 mx-auto"
        style={frameCap ? { maxWidth: frameCap } : undefined}
      >
        {header}
        {renderError ? <MermaidError error={renderError} /> : stageFor(false)}
      </div>

      {fullscreen &&
        createPortal(
          <div className="fixed inset-0 z-(--z-overlay) flex items-center justify-center p-0 sm:p-4">
            <div
              className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
              onClick={() => setFullscreen(false)}
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Animated Mermaid diagram"
              className="relative flex h-full w-full flex-col overflow-hidden border-border bg-card shadow-2xl sm:h-[92vh] sm:max-w-[min(1600px,95vw)] sm:rounded-2xl sm:border"
            >
              <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-6">
                <div>
                  <h1 className="text-sm font-semibold text-foreground">{baseName(name)}</h1>
                  <p className="text-[11px] text-muted-foreground">{MODE_HINT[mode]}</p>
                </div>
                <div className="flex items-center gap-2">
                  {modeControl}
                  <Tray>
                    {saveControl}
                    {effectiveMode === "flow" ? downloadControl : null}
                  </Tray>
                  <Tray key="close">
                    <TrayButton onClick={() => setFullscreen(false)} label="Close diagram">
                      <X className="h-4 w-4" />
                    </TrayButton>
                  </Tray>
                </div>
              </header>
              <div className="min-h-0 flex-1">{stageFor(true)}</div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

// The animator stretches its SVG to the full box and lets preserveAspectRatio
// letterbox the remainder, so a wide diagram in a tall frame is read as a band
// of art floating in dead space. Measuring the rendered viewBox lets the inline
// stage take the diagram's own proportions instead, within bounds that keep a
// very wide or very tall graph from collapsing or running off the screen.
//
// The floor is low deliberately: a left-to-right flow of four or five nodes is
// genuinely around 0.3, and clamping it to something squarer reintroduces the
// exact dead band this measurement exists to remove.
// The ratio band every stage sizes itself by lives in its own module, so all
// three stages share one definition. See stage-ratio.ts for why it is clamped.
// The control row floats over the diagram's bottom edge. Adding its height to
// the stage keeps it off the artwork instead of parked on the last node.
const TRAY_GUTTER = 56;

const ZOOM_LIMIT = { min: 0.2, max: 8 };

/** Zoom through the animator's own PanZoom handler.
 *
 *  Writing the SVG viewBox directly looks equivalent but desynchronises the
 *  package: PanZoomHandler seeds a private `viewBox` field once at construction
 *  and never re-reads the DOM, so its pan handler would resume from the
 *  pre-zoom framing and overwrite the attribute on the first drag — the zoom
 *  visibly snapped back. That instance is private, but the package's own
 *  KeyboardHandler is wired to it and listens on the container, so "+"/"-"
 *  reach zoomIn()/zoomOut() and keep cache and DOM in step. */
function zoomStage(container: HTMLElement | null, direction: "in" | "out") {
  if (!container) return;
  container.dispatchEvent(
    new KeyboardEvent("keydown", { key: direction === "in" ? "+" : "-", bubbles: false }),
  );
}

function AnimatorStage({
  code,
  dark,
  fill,
  controls,
  onError,
  onRatio,
}: {
  code: string;
  dark: boolean;
  fill?: boolean;
  controls?: React.ReactNode;
  onError: (message: string | null) => void;
  /** Reports the diagram's measured aspect ratio so the frame can match it. */
  onRatio?: (ratio: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animatorRef = useRef<MermaidAnimatorInstance | null>(null);
  const renderChainRef = useRef<Promise<void>>(Promise.resolve());
  const renderGenerationRef = useRef(0);
  const ownerGenerationRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [ratio, setRatio] = useState<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const generation = ++renderGenerationRef.current;
    let disposed = false;
    setLoading(true);
    onError(null);
    const create = async () => {
      const options = {
        theme: dark ? "dark" : "light",
        pan: true,
        // Wheel zoom hijacked the page scroll: scrolling past a diagram zoomed it
        // instead of moving on. Zoom is deliberate now — the tray's + and −.
        zoom: false,
        inspect: true,
        minZoom: ZOOM_LIMIT.min,
        maxZoom: ZOOM_LIMIT.max,
        mermaid: largeDiagramMermaidConfig(),
      } as const;
      try {
        let animator: MermaidAnimatorInstance;
        try {
          animator = await MermaidAnimator.create(container, code, options);
        } catch (error) {
          const alternative = /^\s*(?:---[\s\S]*?---\s*)?erDiagram\b/.test(code)
            ? quoteErEntities(code)
            : code;
          if (alternative === code) throw error;
          animator = await MermaidAnimator.create(container, alternative, options);
        }
        if (disposed || generation !== renderGenerationRef.current) {
          animator.destroy();
          return;
        }
        animatorRef.current = animator;
        ownerGenerationRef.current = generation;
        // The untouched viewBox is the diagram's natural frame: it is both the
        // aspect ratio the inline stage should take and the zoom baseline.
        const svg = container.querySelector("svg");
        const view = svg?.viewBox.baseVal;
        if (svg && view?.width && view.height) {
          svg.dataset.maBaseView = `${view.x} ${view.y} ${view.width} ${view.height}`;
          const measured = Math.min(
            MAX_STAGE_RATIO,
            Math.max(MIN_STAGE_RATIO, view.height / view.width),
          );
          setRatio(measured);
          onRatio?.(measured);
        }
        if (fill) requestAnimationFrame(() => animator.fitToView());
        setLoading(false);
      } catch (error) {
        if (!disposed) {
          setLoading(false);
          onError(error instanceof Error ? error.message : "Failed to render diagram");
        }
      }
    };
    // React Strict Mode mounts effects twice in development. MermaidAnimator
    // mutates and clears its container, so two overlapping create() calls can
    // let the stale instance erase the live one. Serialize renders per stage;
    // a superseded generation is cleaned up before the next one starts.
    renderChainRef.current = renderChainRef.current
      .catch(() => undefined)
      .then(async () => {
        if (!disposed) await create();
      });
    return () => {
      disposed = true;
      if (ownerGenerationRef.current === generation) {
        animatorRef.current?.destroy();
        animatorRef.current = null;
        ownerGenerationRef.current = 0;
      }
    };
  }, [code, dark, fill, onError, onRatio]);

  return (
    <div
      className="group/stage relative h-full w-full"
      // A tall diagram is capped to a screenful and so ends up narrower than the
      // column. The wrapper narrows with it, so the control row stays anchored
      // to the picture's own corner rather than floating out in the margin.
      style={fill || !ratio ? undefined : { maxWidth: widthCap(ratio), marginInline: "auto" }}
    >
      {/* Flow runs continuously and frames itself; zoom is the only thing left
          worth reaching for, so it is all this tray carries. */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 p-3 ${
          fill
            ? ""
            : "opacity-0 transition-opacity duration-150 group-hover/stage:opacity-100 group-focus-within/stage:opacity-100 [@media(hover:none)]:opacity-100"
        }`}
      >
        <Tray>
          <TrayButton onClick={() => zoomStage(containerRef.current, "out")} label="Zoom out">
            <Minus className="h-3.5 w-3.5" />
          </TrayButton>
          <TrayButton onClick={() => zoomStage(containerRef.current, "in")} label="Zoom in">
            <Plus className="h-3.5 w-3.5" />
          </TrayButton>
        </Tray>
        {controls}
      </div>
      {loading && (
        <div className="absolute inset-0 z-1 flex items-center justify-center text-sm text-muted-foreground">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Rendering animation…
        </div>
      )}
      <div
        ref={containerRef}
        tabIndex={0}
        aria-label="Animated Mermaid diagram"
        // Keep the package class in React's declared className. The animator
        // also adds it imperatively, but a later loading-state render would
        // otherwise make React restore only the utility classes.
        className={fill ? "ma-container h-full min-h-0 w-full" : "ma-container w-full box-content"}
        // Inline: hold the diagram's own proportions so there is no letterboxed
        // dead band above and below it, with the control row's gutter added as
        // padding rather than taken out of the picture (hence `box-content`, so
        // the ratio still describes the diagram alone). Before the first
        // measurement a neutral ratio reserves roughly the right room, so the
        // surrounding text does not jump when the diagram appears.
        style={
          fill
            ? undefined
            : {
                aspectRatio: `1 / ${ratio ?? 0.42}`,
                paddingBottom: TRAY_GUTTER,
                // A tall diagram would otherwise grow past a screenful. The
                // wrapper caps the width in the same proportion, so this height
                // cap is only a backstop and never letterboxes the picture.
                maxHeight: "min(32rem, 70vh)",
                minHeight: "9rem",
              }
        }
      />
    </div>
  );
}

/** Shared placeholder while a stage's chunk or render is in flight. */
function StageSpinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

/**
 * Plain Mermaid, no motion.
 *
 * Worth having as its own mode rather than "explainer, paused": some diagrams
 * (a pie chart, a gantt, an ER diagram) aren't a walk through anything, and a
 * reader skimming a long document may simply not want things moving. It shares
 * the sizing behaviour of the animated stages so switching modes doesn't make
 * the surrounding text jump.
 */
function StaticStage({
  code,
  dark,
  colored,
  fill,
  controls,
  onError,
  onRatio,
}: {
  code: string;
  dark: boolean;
  /** Colour nodes and edges by meaning; see lib/explainer/semantics.ts. */
  colored?: boolean;
  fill?: boolean;
  controls?: React.ReactNode;
  onError: (message: string | null) => void;
  onRatio?: (ratio: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [ratio, setRatio] = useState<number | null>(null);
  const [size, setSize] = useState<DiagramSize | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    setLoading(true);
    onError(null);
    // Declared out here so the failure path can clean up after the same id.
    const id = `static-${Math.random().toString(36).slice(2, 10)}`;
    const run = async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          theme: dark ? "dark" : "default",
          ...largeDiagramMermaidConfig(),
        });
        const { svg } = await mermaid.render(id, code);
        if (disposed) return;
        host.innerHTML = svg;
        const svgEl = host.querySelector("svg");
        if (svgEl) {
          // Mermaid pins max-width to the intrinsic width, which stops the
          // diagram growing to fill the stage the way the animated modes do.
          svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
          if (colored) applySemantics(svgEl as SVGSVGElement);
          svgEl.style.maxWidth = "100%";
          svgEl.style.width = "100%";
          svgEl.style.height = "100%";
          const view = svgEl.viewBox.baseVal;
          if (view?.width && view.height) {
            // Clamped for the same reason the animated stages clamp: a tall
            // diagram measured raw builds a box taller than the screen, which
            // maxHeight then crushes into a sliver.
            const measured = clampStageRatio(view.height / view.width);
            setRatio(measured);
            setSize({ width: view.width, height: view.height });
            onRatio?.(measured);
          }
        }
        setLoading(false);
      } catch (error) {
        clearRenderArtifacts(id);
        if (disposed) return;
        setLoading(false);
        onError(describeRenderError(error));
      }
    };
    void run();
    return () => {
      disposed = true;
      host.innerHTML = "";
    };
  }, [code, dark, colored, onError, onRatio]);

  return (
    <div
      className="group/stage relative h-full w-full"
      style={fill || !ratio ? undefined : { maxWidth: widthCap(ratio), marginInline: "auto" }}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 p-3 ${
          fill
            ? ""
            : "opacity-0 transition-opacity duration-150 group-hover/stage:opacity-100 group-focus-within/stage:opacity-100 [@media(hover:none)]:opacity-100"
        }`}
      >
        {/* Passed already grouped: the caller decides what shares a surface,
            because only it knows which controls belong to the live mode. */}
        {controls}
      </div>
      {loading && (
        <div className="absolute inset-0 z-1 flex items-center justify-center text-sm text-muted-foreground">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Rendering diagram…
        </div>
      )}
      <div
        ref={hostRef}
        data-tall={!fill && ratio && isTallStage(ratio) ? "" : undefined}
        className={`${fill ? "h-full min-h-0 w-full" : "w-full box-content"}${
          colored ? " diagram-colored" : ""
        }`}
        style={fill ? undefined : stageBoxStyle(ratio ?? 0.42, TRAY_GUTTER, size ?? undefined)}
      />
    </div>
  );
}

function MermaidError({ error }: { error: string }) {
  return (
    <div className="min-h-40 overflow-auto p-4 text-sm">
      <div className="mb-2 font-semibold text-destructive">Mermaid animation error</div>
      <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{error}</pre>
    </div>
  );
}

/**
 * A segmented control: one rounded surface, hairline dividers between its
 * buttons, no gaps for the diagram to show through. Grouping by meaning — and
 * spacing the groups — is what tells the eye which buttons belong together,
 * so no group needs a label to explain itself.
 *
 * Exported so the star affordance the markdown viewer overlays on a diagram can
 * join the same row instead of being positioned next to it by guesswork.
 */
export function Tray({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-auto flex items-center overflow-hidden rounded-lg border border-border/70 bg-background/85 shadow-sm ring-1 ring-black/2 backdrop-blur-md [&>*+*]:border-l [&>*+*]:border-border/60">
      {children}
    </div>
  );
}

export function TrayButton({
  onClick,
  label,
  title,
  busy,
  active,
  children,
}: {
  onClick: (event: React.MouseEvent) => void;
  label: string;
  /** Tooltip, when it should differ from the accessible name. */
  title?: string;
  busy?: boolean;
  /** Renders the pressed state for a button that toggles something on. */
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      aria-pressed={active}
      title={title ?? label}
      className={`inline-flex h-8 w-8 items-center justify-center transition-colors duration-100 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-accent/80 disabled:pointer-events-none disabled:opacity-60 ${
        active ? "text-foreground" : "text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

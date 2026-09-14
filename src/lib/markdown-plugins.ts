// Demand-driven remark/rehype plugin sets for the markdown viewer.
//
// `rehype-katex` pulls in KaTeX (~252 kB) and `rehype-highlight` pulls in
// highlight.js (~279 kB). Listing both statically meant every reader downloaded
// both before the first document could paint, whether or not it contained a
// single equation or code fence. They are imported here on demand instead:
// each document declares what it needs, the modules resolve once and are then
// cached for every document after it.
//
// Content renders immediately with whatever is already loaded; a late-arriving
// plugin re-renders the tree once. Unhighlighted code is still correctly laid
// out monospace in the meantime, so the upgrade reads as syntax colour
// arriving, not as a reflow.

import { useEffect, useMemo, useState } from "react";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeSlug from "rehype-slug";
import { loadKatexStyles, loadMonoFont } from "./fonts";

type Plugin = unknown;

/** Fenced or indented code, or an inline span — anything highlight.js styles. */
const CODE_RE = /(^|\n)\s*(```|~~~)|`[^`\n]+`/;
/** `$…$`, `$$…$$`, and the LaTeX bracket forms remark-math understands. */
const MATH_RE = /\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\(|\\\[/;

export interface MarkdownNeeds {
  code: boolean;
  math: boolean;
}

/** What a chunk of markdown source needs beyond the always-on plugins. */
export function detectMarkdownNeeds(source: string): MarkdownNeeds {
  return { code: CODE_RE.test(source), math: MATH_RE.test(source) };
}

// Module-level caches: the import promise (so concurrent callers share one
// request) and the resolved plugin (so later documents skip the async hop and
// render highlighted on their very first paint).
let highlightPromise: Promise<Plugin> | null = null;
let highlightPlugin: Plugin | null = null;
let katexPromise: Promise<Plugin> | null = null;
let katexPlugin: Plugin | null = null;

function loadHighlight(): Promise<Plugin> {
  highlightPromise ??= import("rehype-highlight")
    .then((m) => {
      highlightPlugin = m.default;
      return highlightPlugin;
    })
    .catch((error) => {
      highlightPromise = null;
      throw error;
    });
  return highlightPromise;
}

function loadKatex(): Promise<Plugin> {
  katexPromise ??= import("rehype-katex")
    .then((m) => {
      katexPlugin = m.default;
      return katexPlugin;
    })
    .catch((error) => {
      katexPromise = null;
      throw error;
    });
  return katexPromise;
}

// Always-on plugins. Frozen module-level arrays: react-markdown re-parses when
// a plugin array changes identity, so these must never be rebuilt per render.
const BASE_REMARK = [remarkGfm, remarkMath] as const;
const BASE_REHYPE = [rehypeSlug] as const;

/**
 * Plugin arrays for one document's source, plus the extra remark plugins the
 * caller wants merged in (the viewer supplies its interactive-block pass).
 */
export function useMarkdownPlugins(source: string, extraRemark: readonly Plugin[] = []) {
  const needs = useMemo(() => detectMarkdownNeeds(source), [source]);

  // Re-render when a needed plugin lands. Seeded from the module cache so a
  // second document renders complete on its first pass.
  const [, setLoadedAt] = useState(0);

  useEffect(() => {
    let alive = true;
    const bump = () => alive && setLoadedAt(Date.now());

    if (needs.code) {
      loadMonoFont();
      if (!highlightPlugin)
        void loadHighlight()
          .then(bump)
          .catch(() => {});
    }
    if (needs.math) {
      loadKatexStyles();
      if (!katexPlugin)
        void loadKatex()
          .then(bump)
          .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [needs.code, needs.math]);

  const remarkPlugins = useMemo(
    () => [...BASE_REMARK, ...extraRemark],
    // `extraRemark` is expected to be a stable module-level array; spreading it
    // into the dep list keeps a caller that passes a literal from thrashing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [...extraRemark],
  );

  const rehypePlugins = useMemo(() => {
    const list: Plugin[] = [...BASE_REHYPE];
    if (needs.math && katexPlugin) list.push(katexPlugin);
    if (needs.code && highlightPlugin) {
      // Unlabelled fences stay plain; trying every language on each block is
      // expensive on long documents. Explicit language fences retain colours.
      list.push([highlightPlugin, { detect: false, ignoreMissing: true }]);
    }
    return list;
    // `katexPlugin`/`highlightPlugin` are module state, not reactive values —
    // the effect above forces the re-render that re-reads them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needs.code, needs.math, highlightPlugin, katexPlugin]);

  // react-markdown's `PluggableList` is structurally what both arrays are, but
  // importing unified's types here just to satisfy the cast is not worth it.
  return { remarkPlugins, rehypePlugins } as {
    remarkPlugins: never[];
    rehypePlugins: never[];
  };
}

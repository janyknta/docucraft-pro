import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  Check,
  Copy,
  Link2,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Clock,
  Pencil,
  Eye,
  Bookmark,
  Info,
  AlertTriangle,
  Lightbulb,
  AlertOctagon,
  StickyNote,
} from "lucide-react";
import type { MdFile } from "@/lib/markdown-utils";
import { slugify } from "@/lib/markdown-utils";
import { Mermaid } from "./Mermaid";
import { detectEmbed, EmbedFrame, isVideoUrl, VideoPlayer } from "@/lib/media-embeds";
import { Lightbox } from "./Lightbox";
import { applyHighlightsToDOM, type Highlight } from "@/lib/dom-highlighter";
import { splitIntoSubtopics } from "@/lib/markdown-utils";

interface Props {
  file: MdFile;
  prevFile: MdFile | null;
  nextFile: MdFile | null;
  onNav: (fileId: string, subtopicId: string | null) => void;
  activeSubtopicId: string | null;
  highlightQuery: string | null;
  onContentChange: (fileId: string, content: string) => void;
  chapterNumber: number;
  totalChapters: number;
  isComplete: boolean;
  allComplete: boolean;
  nextReadingMin: number | null;
  onReadProgress: (fraction: number) => void;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  highlights: Highlight[];
  onAddHighlight: (text: string, color: string) => void;
  onRemoveHighlight: (id: string) => void;
}

const stripExt = (name: string) => name.replace(/\.(md|markdown|mdx|txt)$/i, "");

export function MarkdownViewer({
  file,
  prevFile,
  nextFile,
  onNav,
  activeSubtopicId,
  highlightQuery,
  onContentChange,
  chapterNumber,
  totalChapters,
  isComplete,
  allComplete,
  nextReadingMin,
  onReadProgress,
  isBookmarked,
  onToggleBookmark,
  highlights,
  onAddHighlight,
  onRemoveHighlight,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState(file.content);
  
  const allChunks = useMemo(() => file.subtopics || splitIntoSubtopics(file.content, file.name), [file.subtopics, file.content, file.name]);
  
  const activeChunk = useMemo(() => {
    return allChunks.find(s => s.id === activeSubtopicId) || allChunks[0] || { id: 'preamble', title: stripExt(file.name), content: file.content };
  }, [allChunks, activeSubtopicId, file.content, file.name]);

  const chunkIndex = allChunks.findIndex(s => s.id === activeChunk.id);
  const isLastChunk = chunkIndex === allChunks.length - 1;
  const prevChunk = chunkIndex > 0 ? allChunks[chunkIndex - 1] : null;
  const nextChunk = chunkIndex >= 0 && chunkIndex < allChunks.length - 1 ? allChunks[chunkIndex + 1] : null;

  const [lightbox, setLightbox] = useState<{ src: string; alt?: string } | null>(null);

  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [selectedText, setSelectedText] = useState("");

  useEffect(() => {
    const handleSelection = () => {
      if (editMode) {
        setSelectionRect(null);
        return;
      }
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setSelectionRect(null);
        return;
      }

      const range = selection.getRangeAt(0);
      if (containerRef.current && containerRef.current.contains(range.commonAncestorContainer)) {
        setSelectionRect(range.getBoundingClientRect());
        setSelectedText(selection.toString());
      } else {
        setSelectionRect(null);
      }
    };

    document.addEventListener("selectionchange", handleSelection);
    return () => document.removeEventListener("selectionchange", handleSelection);
  }, [editMode]);

  useEffect(() => {
    if (containerRef.current && !editMode) {
      applyHighlightsToDOM(containerRef.current, highlights);
    }
  }, [file.content, highlights, editMode]);

  useEffect(() => {
    if (!containerRef.current || editMode) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName.toLowerCase() === "mark") {
        const id = target.getAttribute("data-highlight-id");
        if (id) {
          onRemoveHighlight(id);
        }
      }
    };
    const node = containerRef.current;
    node.addEventListener("click", onClick);
    return () => node.removeEventListener("click", onClick);
  }, [onRemoveHighlight, editMode]);

  useEffect(() => {
    setDraft(file.content);
    setEditMode(false);
  }, [file.id]);

  // Gentle fade/rise when switching documents — reads as a settle, not a flash.
  useEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.fromTo(
      containerRef.current,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" },
    );
    return () => {
      ctx.kill();
    };
  }, [activeChunk.id, file.id]);

  // Autosave draft to parent
  useEffect(() => {
    if (!editMode) return;
    const t = setTimeout(() => onContentChange(file.id, draft), 400);
    return () => clearTimeout(t);
  }, [draft, editMode, file.id, onContentChange]);

  // Reset to top only when the chapter changes
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [activeChunk.id, file.id]);

  // Scrollspy, ambient progress, and earned completion. Completion is reported
  // by how far the reader has actually scrolled.
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const scrolled = window.scrollY;
      const max = doc.scrollHeight - window.innerHeight;
      const frac = max > 0 ? scrolled / max : 1;
      setProgress(frac * 100);
      setShowTop(scrolled > 400);
      onReadProgress(frac);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [file.id, activeChunk.id, onReadProgress, editMode]);

  // Save shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && editMode) {
        e.preventDefault();
        onContentChange(file.id, draft);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, editMode, file.id, onContentChange]);

  const stats = useMemo(() => {
    const words = activeChunk.content.trim().split(/\s+/).filter(Boolean).length;
    const readingMin = Math.max(1, Math.round(words / 220));
    return { words, readingMin };
  }, [activeChunk.content]);

  const highlightRegex = useMemo(() => {
    if (!highlightQuery) return null;
    const escaped = highlightQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(${escaped})`, "gi");
  }, [highlightQuery]);

  const highlightText = (text: string) => {
    if (!highlightRegex) return text;
    const parts = text.split(highlightRegex);
    return parts.map((p, i) =>
      highlightRegex.test(p) ? (
        <mark key={i} className="rounded bg-primary/25 px-0.5 text-foreground">
          {p}
        </mark>
      ) : (
        <span key={i}>{p}</span>
      ),
    );
  };

  const walkChildren = (children: any): any => {
    if (typeof children === "string") return highlightText(children);
    if (Array.isArray(children)) return children.map((c, i) => <span key={i}>{walkChildren(c)}</span>);
    return children;
  };

  const components = useMemo(
    () => ({
      h1: (p: any) => <HeadingLink as="h1" {...p} highlight={highlightText} />,
      h2: (p: any) => <HeadingLink as="h2" {...p} highlight={highlightText} />,
      h3: (p: any) => <HeadingLink as="h3" {...p} highlight={highlightText} />,
      h4: (p: any) => <HeadingLink as="h4" {...p} highlight={highlightText} />,
      h5: (p: any) => <HeadingLink as="h5" {...p} highlight={highlightText} />,
      h6: (p: any) => <HeadingLink as="h6" {...p} highlight={highlightText} />,
      p: (p: any) => {
        // Rich embed detection: a paragraph that is a single bare autolink.
        // Match on props.href rather than element type — the custom `a`
        // override makes the child's type the component, not the string "a".
        const kids = Array.isArray(p.children) ? p.children : [p.children];
        const solo = kids.filter((c: any) => !(typeof c === "string" && !c.trim()));
        const only = solo.length === 1 ? solo[0] : null;
        const href = only?.props?.href;
        if (href) {
          const inner = only.props?.children;
          const text = typeof inner === "string" ? inner : Array.isArray(inner) ? inner.join("") : "";
          if (text === href || text === "") {
            const embed = detectEmbed(href);
            if (embed) return <EmbedFrame embed={embed} />;
            if (isVideoUrl(href)) return <VideoPlayer src={href} />;
          }
        }
        return <p {...p}>{walkChildren(p.children)}</p>;
      },
      blockquote: (p: any) => <Callout {...p} />,
      pre: (p: any) => <CodeBlock {...p} />,
      img: (p: any) => {
        // ![alt](clip.mp4) renders a player; a `title` that is an image URL
        // (![alt](clip.mp4 "thumb.jpg")) becomes the preview poster.
        if (p.src && isVideoUrl(p.src)) {
          const poster =
            typeof p.title === "string" && /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(p.title)
              ? p.title
              : undefined;
          return <VideoPlayer src={p.src} poster={poster} />;
        }
        return (
          <img
            {...p}
            loading="lazy"
            onClick={() => setLightbox({ src: p.src, alt: p.alt })}
            className="cursor-zoom-in"
          />
        );
      },
      a: (p: any) => (
        <a {...p} target={p.href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
          {walkChildren(p.children)}
        </a>
      ),
      li: (p: any) => <li {...p}>{walkChildren(p.children)}</li>,
      table: (p: any) => (
        <div className="docs-table-wrap">
          <table {...p} />
        </div>
      ),
      td: (p: any) => <td {...p}>{walkChildren(p.children)}</td>,
      th: (p: any) => <th {...p}>{walkChildren(p.children)}</th>,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [highlightRegex],
  );

  return (
    <>
      {selectionRect && !editMode && (
        <div
          className="fixed z-50 flex gap-1 rounded-md bg-popover p-1 shadow-md border border-border"
          style={{
            top: selectionRect.top - 40,
            left: selectionRect.left + selectionRect.width / 2,
            transform: "translateX(-50%)",
          }}
        >
          {["#fde047", "#86efac", "#93c5fd", "#f9a8d4"].map((color) => (
            <button
              key={color}
              className="h-6 w-6 rounded-full border border-border cursor-pointer hover:scale-110 transition-transform"
              style={{ backgroundColor: color }}
              onClick={() => {
                onAddHighlight(selectedText, color);
                window.getSelection()?.removeAllRanges();
                setSelectionRect(null);
              }}
            />
          ))}
        </div>
      )}

      <div
        className="fixed left-0 right-0 top-16 z-40 h-0.5 bg-primary/80 transition-transform origin-left"
        style={{ transform: `scaleX(${progress / 100})` }}
      />

      {lightbox && <Lightbox {...lightbox} onClose={() => setLightbox(null)} />}

      <div
        className={`mx-auto flex w-full max-w-4xl gap-8 px-6 py-10 md:px-10 md:py-16`}
      >
        <article ref={containerRef} className="docs-prose mx-auto min-w-0 flex-1">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  {stripExt(file.name)}
                </span>
              </div>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                {activeChunk.title}
              </h1>
              {isComplete && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    <Check className="h-3 w-3" strokeWidth={3} /> Read
                  </span>
                )}
              <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="truncate">{stripExt(file.name)}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />≈ {stats.readingMin} min
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onToggleBookmark}
                aria-label={isBookmarked ? "Remove bookmark" : "Bookmark this chapter"}
                title={isBookmarked ? "Remove bookmark" : "Bookmark this chapter"}
                className={`inline-flex items-center justify-center rounded-md border border-border bg-background p-2 transition-colors hover:border-primary/40 active:scale-95 ${
                  isBookmarked ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Bookmark
                  className={`h-3.5 w-3.5 ${isBookmarked ? "fill-primary" : ""}`}
                />
              </button>
              <button
                onClick={() => setEditMode((e) => !e)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground active:scale-95"
              >
                {editMode ? (
                  <>
                    <Eye className="h-3.5 w-3.5" /> Preview
                  </>
                ) : (
                  <>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </>
                )}
              </button>
            </div>
          </div>

          {editMode ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
                className="min-h-[70vh] w-full resize-y rounded-lg border border-border bg-muted/30 p-4 font-mono text-[13px] leading-relaxed outline-none focus:border-primary/50"
              />
              <div className="rounded-lg border border-border bg-background p-6">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[
                    rehypeSlug,
                    rehypeKatex,
                    [rehypeHighlight, { detect: true, ignoreMissing: true }],
                  ]}
                  components={components}
                >
                  {draft}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[
                rehypeSlug,
                rehypeKatex,
                [rehypeHighlight, { detect: true, ignoreMissing: true }],
              ]}
              components={components}
            >
              {activeChunk.content}
            </ReactMarkdown>
          )}

          {/* Natural stopping point — quiet acknowledgement, clear next step */}
          {!editMode && (
            <div className="mt-16 border-t border-border pt-8">
              {isLastChunk && (
                <div className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <span>
                    <span className="font-medium text-foreground">{stripExt(file.name)}</span>{" "}
                    Documentation complete
                  </span>
                </div>
              )}

              {nextChunk ? (
                <button
                  onClick={() => onNav(file.id, nextChunk.id)}
                  className="group flex w-full items-center justify-between gap-4 rounded-xl border border-border p-5 text-left transition-all hover:border-primary/50 hover:bg-accent/40"
                >
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Next topic
                    </span>
                    <span className="mt-1 block truncate text-base font-semibold text-foreground">
                      {nextChunk.title}
                    </span>
                  </span>
                  <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </button>
              ) : nextFile ? (
                <button
                  onClick={() => onNav(nextFile.id, null)}
                  className="group flex w-full items-center justify-between gap-4 rounded-xl border border-border p-5 text-left transition-all hover:border-primary/50 hover:bg-accent/40"
                >
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Next chapter
                    </span>
                    <span className="mt-1 block truncate text-base font-semibold text-foreground">
                      {stripExt(nextFile.name)}
                    </span>
                    {nextReadingMin != null && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        ≈ {nextReadingMin} min read
                      </span>
                    )}
                  </span>
                  <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </button>
              ) : allComplete ? (
                <div className="rounded-xl border border-border bg-muted/30 p-8 text-center">
                  <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-5 w-5" strokeWidth={3} />
                  </span>
                  <div className="text-base font-semibold text-foreground">
                    Documentation completed
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    You&apos;ve finished all {totalChapters}{" "}
                    {totalChapters === 1 ? "chapter" : "chapters"}.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                  You&apos;ve reached the end of this chapter.
                </div>
              )}

              <div className="mt-4 flex flex-col gap-2 items-start">
                {prevChunk ? (
                  <button
                    onClick={() => onNav(file.id, prevChunk.id)}
                    className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                    Previous topic: {prevChunk.title}
                  </button>
                ) : prevFile ? (
                  <button
                    onClick={() => onNav(prevFile.id, null)}
                    className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                    Previous chapter: {stripExt(prevFile.name)}
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </article>
      </div>

      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
          className="fixed bottom-6 right-6 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/80 shadow-lg backdrop-blur transition-all hover:bg-accent active:scale-90"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      )}
    </>
  );
}

function HeadingLink({ as: Tag, children, id, highlight, ...rest }: any) {
  const [copied, setCopied] = useState(false);
  const text = Array.isArray(children)
    ? children.map((c) => (typeof c === "string" ? c : "")).join("")
    : String(children ?? "");
  const finalId = id || slugify(text);
  return (
    <Tag id={finalId} {...rest} className="group scroll-mt-24">
      {typeof children === "string" ? highlight?.(children) ?? children : children}
      <button
        onClick={() => {
          const url = `${window.location.origin}${window.location.pathname}#${finalId}`;
          navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="ml-2 inline-flex items-center align-middle opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Copy link to heading"
      >
        {copied ? (
          <Check className="h-4 w-4 text-primary" />
        ) : (
          <Link2 className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
    </Tag>
  );
}

function CodeBlock({ children, ...rest }: any) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  // Detect Mermaid
  const codeEl: any = Array.isArray(children) ? children[0] : children;
  const cls = codeEl?.props?.className ?? "";
  if (typeof cls === "string" && /language-mermaid/.test(cls)) {
    const raw = extractText(codeEl?.props?.children);
    return <Mermaid code={raw} />;
  }

  const lang = /language-([\w+-]+)/.exec(cls)?.[1];

  return (
    <div className="group relative my-6">
      {/* {lang && (
        <div className="absolute left-3 top-2 z-10 rounded bg-background/60 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground backdrop-blur">
          {lang}
        </div>
      )} */}
      <button
        onClick={() => {
          const code = ref.current?.innerText ?? "";
          navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md border border-border/50 bg-background/80 px-2 py-1 text-xs text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-foreground group-hover:opacity-100"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre ref={ref} {...rest}>
        {children}
      </pre>
    </div>
  );
}

function extractText(node: any): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node?.props?.children) return extractText(node.props.children);
  return "";
}

const CALLOUT_MAP: Record<string, { icon: any; label: string; cls: string }> = {
  NOTE: { icon: StickyNote, label: "Note", cls: "border-sky-500/40 bg-sky-500/5 text-sky-700 dark:text-sky-300" },
  INFO: { icon: Info, label: "Info", cls: "border-sky-500/40 bg-sky-500/5 text-sky-700 dark:text-sky-300" },
  TIP: { icon: Lightbulb, label: "Tip", cls: "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300" },
  WARNING: { icon: AlertTriangle, label: "Warning", cls: "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300" },
  CAUTION: { icon: AlertTriangle, label: "Caution", cls: "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300" },
  DANGER: { icon: AlertOctagon, label: "Danger", cls: "border-rose-500/40 bg-rose-500/5 text-rose-700 dark:text-rose-300" },
  IMPORTANT: { icon: AlertOctagon, label: "Important", cls: "border-violet-500/40 bg-violet-500/5 text-violet-700 dark:text-violet-300" },
};

function Callout({ children, ...rest }: any) {
  // Detect leading [!TYPE] token in first paragraph
  const kids = Array.isArray(children) ? [...children] : [children];
  let type: string | null = null;

  for (let i = 0; i < kids.length; i++) {
    const c = kids[i];
    if (c?.type === "p" || c?.props) {
      const inner = c.props?.children;
      const text = extractText(inner);
      const m = /^\s*\[!(NOTE|INFO|TIP|WARNING|CAUTION|DANGER|IMPORTANT)\]\s*(.*)/is.exec(text);
      if (m) {
        type = m[1].toUpperCase();
        // Strip token: build a new child with remainder
        const remainder = m[2];
        kids[i] = remainder ? { ...c, props: { ...c.props, children: remainder } } : null;
        break;
      }
    }
    break;
  }

  if (!type) {
    return <blockquote {...rest}>{children}</blockquote>;
  }

  const cfg = CALLOUT_MAP[type];
  const Icon = cfg.icon;
  return (
    <div className={`my-5 rounded-lg border-l-4 border p-4 ${cfg.cls}`}>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
        <Icon className="h-3.5 w-3.5" />
        {cfg.label}
      </div>
      <div className="[&>p:last-child]:mb-0 [&>p]:mb-2 text-foreground/90">
        {kids.filter(Boolean)}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy, Link2, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import type { MdFile } from "@/lib/markdown-utils";
import { slugify } from "@/lib/markdown-utils";

interface Props {
  file: MdFile;
  prevFile: MdFile | null;
  nextFile: MdFile | null;
  onNavFile: (id: string) => void;
  onActiveHeading: (id: string | null) => void;
  scrollTargetId: string | null;
}

export function MarkdownViewer({
  file,
  prevFile,
  nextFile,
  onNavFile,
  onActiveHeading,
  scrollTargetId,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);

  // Scroll to target when requested
  useEffect(() => {
    if (!scrollTargetId) return;
    const el = document.getElementById(scrollTargetId);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  }, [scrollTargetId, file.id]);

  // Reset scroll on file change
  useEffect(() => {
    if (!scrollTargetId) window.scrollTo({ top: 0 });
  }, [file.id, scrollTargetId]);

  // Scrollspy + progress
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const scrolled = window.scrollY;
      const max = doc.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? (scrolled / max) * 100 : 0);
      setShowTop(scrolled > 400);

      const headings = containerRef.current?.querySelectorAll<HTMLElement>(
        "h1, h2, h3, h4, h5, h6",
      );
      if (!headings) return;
      let current: string | null = null;
      for (const h of Array.from(headings)) {
        if (h.getBoundingClientRect().top < 120) current = h.id;
        else break;
      }
      onActiveHeading(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [file.id, onActiveHeading]);

  const components = useMemo(
    () => ({
      h1: (p: any) => <HeadingLink as="h1" {...p} />,
      h2: (p: any) => <HeadingLink as="h2" {...p} />,
      h3: (p: any) => <HeadingLink as="h3" {...p} />,
      h4: (p: any) => <HeadingLink as="h4" {...p} />,
      h5: (p: any) => <HeadingLink as="h5" {...p} />,
      h6: (p: any) => <HeadingLink as="h6" {...p} />,
      pre: (p: any) => <CodeBlock {...p} />,
      a: (p: any) => (
        <a {...p} target={p.href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer" />
      ),
    }),
    [],
  );

  return (
    <>
      <div
        className="fixed left-0 right-0 top-0 z-40 h-0.5 bg-primary/80 transition-transform origin-left"
        style={{ transform: `scaleX(${progress / 100})` }}
      />

      <article
        ref={containerRef}
        className="docs-prose mx-auto max-w-3xl px-6 py-10 md:px-10 md:py-16"
      >
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {file.name}
        </div>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSlug, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
          components={components}
        >
          {file.content}
        </ReactMarkdown>

        <nav className="mt-16 grid grid-cols-1 gap-3 border-t border-border pt-8 sm:grid-cols-2">
          {prevFile ? (
            <button
              onClick={() => onNavFile(prevFile.id)}
              className="group flex flex-col items-start gap-1 rounded-lg border border-border p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/50"
            >
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowLeft className="h-3 w-3" /> Previous
              </span>
              <span className="text-sm font-medium text-foreground">{prevFile.name}</span>
            </button>
          ) : (
            <div />
          )}
          {nextFile ? (
            <button
              onClick={() => onNavFile(nextFile.id)}
              className="group flex flex-col items-end gap-1 rounded-lg border border-border p-4 text-right transition-colors hover:border-primary/50 hover:bg-accent/50 sm:col-start-2"
            >
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                Next <ArrowRight className="h-3 w-3" />
              </span>
              <span className="text-sm font-medium text-foreground">{nextFile.name}</span>
            </button>
          ) : null}
        </nav>
      </article>

      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
          className="fixed bottom-6 right-6 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/80 shadow-lg backdrop-blur transition-all hover:bg-accent"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      )}
    </>
  );
}

function HeadingLink({ as: Tag, children, id, ...rest }: any) {
  const [copied, setCopied] = useState(false);
  const text = Array.isArray(children)
    ? children.map((c) => (typeof c === "string" ? c : "")).join("")
    : String(children ?? "");
  const finalId = id || slugify(text);
  return (
    <Tag id={finalId} {...rest} className="group scroll-mt-24">
      {children}
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
  return (
    <div className="group relative my-6">
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

import { useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import { FileText, Hash, Search, Clock, X } from "lucide-react";
import type { MdFile } from "@/lib/markdown-utils";

interface Props {
  files: MdFile[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (fileId: string, headingId?: string, query?: string) => void;
}

interface Hit {
  fileId: string;
  fileName: string;
  headingId?: string;
  headingText?: string;
  snippet: string;
  score: number;
}

const RECENT_KEY = "docs-recent-searches";

export function CommandPalette({ files, open, onOpenChange, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      if (Array.isArray(r)) setRecent(r);
    } catch {}
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits: Hit[] = [];
    for (const file of files) {
      const lines = file.content.split("\n");
      const fileNameMatch = file.name.toLowerCase().includes(q);
      let inCode = false;
      let currentHeading: { id: string; text: string } | null = null;
      const seen = new Map<string, number>();

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("```")) {
          inCode = !inCode;
          continue;
        }
        if (inCode) continue;

        const hm = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
        if (hm) {
          const text = hm[2].trim();
          let base = text
            .toLowerCase()
            .replace(/[^\w\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-") || "section";
          const c = seen.get(base) ?? 0;
          seen.set(base, c + 1);
          const id = c === 0 ? base : `${base}-${c}`;
          currentHeading = { id, text };
          if (text.toLowerCase().includes(q)) {
            hits.push({
              fileId: file.id,
              fileName: file.name,
              headingId: id,
              headingText: text,
              snippet: text,
              score: 100 + (text.toLowerCase().startsWith(q) ? 20 : 0),
            });
          }
          continue;
        }

        const li = line.toLowerCase();
        if (li.includes(q)) {
          const idx = li.indexOf(q);
          const start = Math.max(0, idx - 40);
          const end = Math.min(line.length, idx + q.length + 60);
          hits.push({
            fileId: file.id,
            fileName: file.name,
            headingId: currentHeading?.id,
            headingText: currentHeading?.text,
            snippet: (start > 0 ? "…" : "") + line.slice(start, end) + (end < line.length ? "…" : ""),
            score: 50,
          });
        }
      }

      if (fileNameMatch && !hits.some((h) => h.fileId === file.id && !h.headingId)) {
        hits.unshift({
          fileId: file.id,
          fileName: file.name,
          snippet: file.name,
          score: 80,
        });
      }
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, 60);
  }, [files, query]);

  const grouped = useMemo(() => {
    const g = new Map<string, Hit[]>();
    for (const h of results) {
      if (!g.has(h.fileName)) g.set(h.fileName, []);
      g.get(h.fileName)!.push(h);
    }
    return Array.from(g.entries());
  }, [results]);

  const commit = (hit: Hit) => {
    const q = query.trim();
    if (q) {
      const next = [q, ...recent.filter((r) => r !== q)].slice(0, 6);
      setRecent(next);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {}
    }
    onSelect(hit.fileId, hit.headingId, q);
    onOpenChange(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      } else if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const highlight = (text: string) => {
    if (!query) return text;
    const q = query.trim();
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="rounded bg-primary/20 px-0.5 text-foreground">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[10vh]">
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <Command
        label="Search docs"
        className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-popover shadow-2xl animate-in fade-in-0 zoom-in-95 duration-100"
        shouldFilter={false}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search all documentation..."
            className="flex-1 bg-transparent py-4 text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground sm:inline-block">
            ESC
          </kbd>
        </div>
        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          {!query && recent.length > 0 && (
            <Command.Group heading="Recent searches" className="text-xs text-muted-foreground">
              {recent.map((r) => (
                <Command.Item
                  key={r}
                  value={`recent-${r}`}
                  onSelect={() => setQuery(r)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
                >
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1">{r}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = recent.filter((x) => x !== r);
                      setRecent(next);
                      try {
                        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
                      } catch {}
                    }}
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </button>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {query && results.length === 0 && (
            <Command.Empty className="py-12 text-center text-sm text-muted-foreground">
              No results for "{query}"
            </Command.Empty>
          )}
          {grouped.map(([fileName, hits]) => (
            <Command.Group
              key={fileName}
              heading={fileName}
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              {hits.map((h, i) => (
                <Command.Item
                  key={`${fileName}-${i}`}
                  value={`${fileName}-${i}-${h.snippet}`}
                  onSelect={() => commit(h)}
                  className="group flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-accent"
                >
                  {h.headingId ? (
                    <Hash className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    {h.headingText && (
                      <div className="truncate text-[13px] font-medium">
                        {highlight(h.headingText)}
                      </div>
                    )}
                    <div
                      className={`truncate text-xs ${h.headingText ? "text-muted-foreground" : "font-medium"}`}
                    >
                      {highlight(h.snippet)}
                    </div>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded border border-border bg-background px-1">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="rounded border border-border bg-background px-1">↵</kbd> open
            </span>
          </div>
          <span>{results.length} results</span>
        </div>
      </Command>
    </div>
  );
}

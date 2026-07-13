import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Search, FileText, Plus, X } from "lucide-react";
import type { MdFile, MdHeading } from "@/lib/markdown-utils";
import { flattenHeadings } from "@/lib/markdown-utils";

interface Props {
  files: MdFile[];
  activeFileId: string | null;
  activeHeadingId: string | null;
  onSelect: (fileId: string, headingId?: string) => void;
  onAddFiles: () => void;
  onRemoveFile: (id: string) => void;
}

export function Sidebar({
  files,
  activeFileId,
  activeHeadingId,
  onSelect,
  onAddFiles,
  onRemoveFile,
}: Props) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // auto-expand active file
    if (activeFileId) setExpanded((e) => ({ ...e, [activeFileId]: true }));
  }, [activeFileId]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeHeadingId]);

  const filtered = useMemo(() => {
    if (!query.trim()) return files;
    const q = query.toLowerCase();
    return files
      .map((f) => {
        const matches = flattenHeadings(f.headings).filter((h) =>
          h.text.toLowerCase().includes(q),
        );
        const nameMatch = f.name.toLowerCase().includes(q);
        if (!nameMatch && matches.length === 0) return null;
        return { ...f, _matches: matches };
      })
      .filter(Boolean) as (MdFile & { _matches: MdHeading[] })[];
  }, [files, query]);

  const renderHeadings = (hs: MdHeading[], depth = 0) => (
    <ul className="space-y-0.5">
      {hs.map((h) => {
        const active = h.id === activeHeadingId;
        return (
          <li key={h.id}>
            <button
              ref={active ? activeRef : null}
              onClick={() => onSelect(h.fileId, h.id)}
              className={`group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[13px] leading-snug transition-colors ${
                active
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
              {active && (
                <span className="absolute left-0 h-4 w-0.5 rounded-r bg-primary" aria-hidden />
              )}
              <span className="truncate">{h.text}</span>
            </button>
            {h.children.length > 0 && renderHeadings(h.children, depth + 1)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside className="flex h-full flex-col">
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search docs..."
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">No matches</div>
        )}
        {filtered.map((file) => {
          const open = expanded[file.id] ?? true;
          return (
            <div key={file.id} className="mb-3">
              <div className="group flex items-center gap-1">
                <button
                  onClick={() => setExpanded((e) => ({ ...e, [file.id]: !open }))}
                  className="flex flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronRight
                    className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
                  />
                  <FileText className="h-3 w-3" />
                  <span className="truncate">{file.name.replace(/\.(md|markdown|mdx)$/i, "")}</span>
                </button>
                <button
                  onClick={() => onRemoveFile(file.id)}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Remove file"
                >
                  <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
              {open && (
                <div className="mt-1 relative">
                  {file.headings.length === 0 ? (
                    <button
                      onClick={() => onSelect(file.id)}
                      className={`w-full rounded-md px-3 py-1.5 text-left text-[13px] ${
                        file.id === activeFileId
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      (no headings)
                    </button>
                  ) : (
                    renderHeadings(file.headings)
                  )}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <button
          onClick={onAddFiles}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Add markdown files
        </button>
      </div>
    </aside>
  );
}

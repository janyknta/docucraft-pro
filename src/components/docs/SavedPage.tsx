import { useMemo, useState } from "react";
import { Highlighter, Star, Tag, Trash2, Unlink, X } from "lucide-react";
import { HL_COLORS, type Highlight } from "@/lib/dom-highlighter";
import { savedTypeLabel, type SavedEntry, type SavedItem } from "@/lib/saved-items";

/**
 * Everything the reader has kept, as a page rather than a list buried in
 * settings.
 *
 * Stars and highlights were in two different places — one under a settings tab,
 * the other behind a per-file menu item — which made "the things I saved" a
 * thing you had to remember the location of. They are one surface here: note
 * cards grouped by document, with the highlight colours as a filter across the
 * top, so a reader who marks passages in yellow for one purpose and green for
 * another can pull up just one of them.
 */
export function SavedPage({
  saved,
  highlights,
  fileName,
  onOpenSaved,
  onRemoveSaved,
  onOpenHighlight,
  onRemoveHighlight,
}: {
  saved: SavedEntry[];
  highlights: Highlight[];
  /** Resolve a highlight's file id to its name, for grouping. */
  fileName: (fileId: string) => string | null;
  onOpenSaved: (item: SavedItem) => void;
  onRemoveSaved: (id: string) => void;
  onOpenHighlight: (hl: Highlight) => void;
  onRemoveHighlight: (id: string) => void;
}) {
  // Which highlight colours are showing. Empty means "all of them" rather than
  // "none": an untouched filter should never hide anything.
  const [colors, setColors] = useState<Set<string>>(() => new Set());
  const [kind, setKind] = useState<"all" | "stars" | "highlights">("all");

  const usedColors = useMemo(() => {
    const seen = new Set<string>();
    for (const hl of highlights) seen.add(hl.color);
    // Ordered by the palette rather than by first appearance, so the row of
    // swatches doesn't rearrange itself as the reader highlights more.
    return HL_COLORS.filter((c) => seen.has(c));
  }, [highlights]);

  const visibleHighlights = useMemo(
    () =>
      kind === "stars" ? [] : highlights.filter((hl) => colors.size === 0 || colors.has(hl.color)),
    [highlights, colors, kind],
  );
  const visibleSaved = kind === "highlights" ? [] : saved;

  /** One bucket per document, holding both kinds of keepsake. */
  const groups = useMemo(() => {
    const byFile = new Map<
      string,
      { name: string; saved: SavedEntry[]; highlights: Highlight[] }
    >();
    const bucket = (fileId: string, name: string) => {
      let entry = byFile.get(fileId);
      if (!entry) {
        entry = { name, saved: [], highlights: [] };
        byFile.set(fileId, entry);
      }
      return entry;
    };
    for (const item of visibleSaved) bucket(item.fileId, item.fileName).saved.push(item);
    for (const hl of visibleHighlights) {
      const name = fileName(hl.fileId);
      if (name) bucket(hl.fileId, name).highlights.push(hl);
    }
    return [...byFile.entries()].map(([fileId, entry]) => ({ fileId, ...entry }));
  }, [visibleSaved, visibleHighlights, fileName]);

  const total = visibleSaved.length + visibleHighlights.length;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Saved</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stars and highlights, grouped by document.
        </p>
      </header>

      {/* The filter pane. Kind first, then colour — a reader narrowing down
          usually knows which of the two they are after before they know which
          colour they used. */}
      <div className="mb-6 space-y-3 rounded-xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(["all", "stars", "highlights"] as const).map((option) => (
            <button
              key={option}
              onClick={() => setKind(option)}
              aria-pressed={kind === option}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                kind === option
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        {usedColors.length > 0 && kind !== "stars" && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">Colour</span>
            {usedColors.map((color) => {
              const on = colors.has(color);
              const count = highlights.filter((hl) => hl.color === color).length;
              return (
                <button
                  key={color}
                  onClick={() =>
                    setColors((previous) => {
                      const next = new Set(previous);
                      if (next.has(color)) next.delete(color);
                      else next.add(color);
                      return next;
                    })
                  }
                  aria-pressed={on}
                  title={`${count} highlight${count === 1 ? "" : "s"}`}
                  className={`flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs transition-colors ${
                    on ? "border-primary/60 bg-accent" : "border-border hover:bg-accent/60"
                  }`}
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  <span className="tabular-nums text-muted-foreground">{count}</span>
                </button>
              );
            })}
            {colors.size > 0 && (
              <button
                onClick={() => setColors(new Set())}
                className="ml-1 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </div>
        )}
      </div>

      {total === 0 ? (
        <div className="rounded-xl border border-border bg-card px-4 py-16 text-center">
          <Star className="mx-auto h-6 w-6 text-muted-foreground/60" />
          <p className="mt-2 text-sm text-muted-foreground">
            {colors.size > 0 || kind !== "all"
              ? "Nothing matches this filter."
              : "Nothing saved yet. Star a section, or highlight a passage while reading."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.fileId}>
              <h2 className="mb-2 px-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.name.replace(/\.[^.]+$/, "")}
              </h2>
              <div className="space-y-2">
                {group.saved.map((item) => (
                  <article
                    key={item.id}
                    className="group flex items-stretch gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40"
                  >
                    <Star className="mt-0.5 h-4 w-4 shrink-0 fill-gold text-gold" aria-hidden />
                    <button onClick={() => onOpenSaved(item)} className="min-w-0 flex-1 text-left">
                      <span className="block text-sm font-medium text-foreground">
                        {item.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {savedTypeLabel(item)}
                        {item.orphaned && (
                          <span className="text-amber-600 dark:text-amber-400">· edited away</span>
                        )}
                      </span>
                      {item.note && (
                        <span className="mt-1.5 block whitespace-pre-wrap text-xs text-muted-foreground">
                          {item.note}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => onRemoveSaved(item.id)}
                      aria-label="Remove saved item"
                      className="shrink-0 self-start rounded-md p-1.5 text-muted-foreground transition-colors hover:text-destructive md:opacity-0 md:group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </article>
                ))}

                {group.highlights.map((hl) => (
                  <article
                    key={hl.id}
                    className="group flex items-stretch gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40"
                  >
                    <span
                      className="w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: hl.color }}
                      aria-hidden
                    />
                    <button
                      onClick={() => onOpenHighlight(hl)}
                      className="min-w-0 flex-1 text-left"
                      title="Jump to this highlight"
                    >
                      <span
                        className="text-sm leading-relaxed text-foreground [box-decoration-break:clone]"
                        style={{ backgroundColor: hl.color, color: "#0a0a0a", padding: "1px 2px" }}
                      >
                        {hl.text}
                      </span>
                      {hl.label && (
                        <span className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Tag className="h-3 w-3 shrink-0" />
                          {hl.label}
                        </span>
                      )}
                      {hl.orphaned && (
                        <span className="mt-1.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
                          <Unlink className="h-3 w-3 shrink-0" />
                          This text is no longer in the document
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => onRemoveHighlight(hl.id)}
                      aria-label="Remove highlight"
                      className="shrink-0 self-start rounded-md p-1.5 text-muted-foreground transition-colors hover:text-destructive md:opacity-0 md:group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {highlights.length === 0 && saved.length > 0 && (
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Highlighter className="h-3 w-3" />
          Highlight a passage while reading and it will appear here too.
        </p>
      )}
    </div>
  );
}

import { X } from "lucide-react";
import type { MdFile } from "@/lib/markdown-utils";
import type { Pane } from "@/lib/panes";

/**
 * Drag payload for a tab, carrying the pane it came from.
 *
 * Its own MIME type, so a tab drag is never confused with the sidebar's file
 * and folder drags — dropping a document from the sidebar and dropping a tab
 * from another pane are different gestures that happen to look alike.
 */
export const TAB_DND = "application/x-localdox-tab";

interface TabDragPayload {
  paneId: string;
  fileId: string;
}

export function readTabDrag(e: React.DragEvent): TabDragPayload | null {
  const raw = e.dataTransfer.getData(TAB_DND);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.paneId === "string" && typeof parsed?.fileId === "string") return parsed;
  } catch {
    // Malformed payload — treated as "not a tab drag" rather than an error.
  }
  return null;
}

const title = (name: string) => name.replace(/\.[^.]+$/, "");

/**
 * One pane's tab strip.
 *
 * Tabs are draggable between panes and within one, which is the whole point of
 * the split: a reader comparing two documents wants to decide which side each
 * one sits on after opening them, not before.
 */
export function PaneTabs({
  pane,
  files,
  focused,
  onSelect,
  onClose,
  onFocus,
  onSplit,
  onDropTab,
}: {
  pane: Pane;
  /** Lookup for the tab labels; only the ids live in the layout. */
  files: MdFile[];
  focused: boolean;
  onSelect: (fileId: string) => void;
  onClose: (fileId: string) => void;
  onFocus: () => void;
  onSplit: () => void;
  /** A tab was dropped here: from `fromPaneId`, landing at `toIndex`. */
  onDropTab: (fromPaneId: string, fileId: string, toIndex: number) => void;
}) {
  const nameOf = (id: string) => files.find((f) => f.id === id)?.name ?? "Untitled";

  const dropAt = (index: number) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(TAB_DND)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move" as const;
    },
    onDrop: (e: React.DragEvent) => {
      const payload = readTabDrag(e);
      if (!payload) return;
      e.preventDefault();
      e.stopPropagation();
      onDropTab(payload.paneId, payload.fileId, index);
    },
  });

  return (
    <div
      onMouseDown={onFocus}
      className={`flex shrink-0 items-stretch gap-0.5 overflow-x-auto border-b px-1 scrollbar-hide ${
        focused ? "border-border bg-background" : "border-border/60 bg-muted/30"
      }`}
    >
      {pane.tabs.map((fileId, index) => {
        const active = fileId === pane.activeTabId;
        return (
          <div
            key={fileId}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(TAB_DND, JSON.stringify({ paneId: pane.id, fileId }));
              e.dataTransfer.effectAllowed = "move";
            }}
            {...dropAt(index)}
            className={`group flex min-w-0 max-w-44 shrink-0 items-center gap-1 rounded-t-lg border-b-2 px-2 py-1.5 text-xs transition-colors ${
              active
                ? "border-primary bg-background text-foreground"
                : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            }`}
          >
            <button
              onClick={() => onSelect(fileId)}
              className="min-w-0 flex-1 truncate text-left"
              title={nameOf(fileId)}
            >
              {title(nameOf(fileId))}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(fileId);
              }}
              aria-label={`Close ${title(nameOf(fileId))}`}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}

      {/* The strip's tail is a drop target too, so a tab can be dragged to the
          end of a pane — including an empty one, which has no tab to aim at. */}
      <div className="min-w-8 flex-1" {...dropAt(pane.tabs.length)} />

      <button
        onClick={onSplit}
        title="Split this pane"
        aria-label="Split this pane"
        className="my-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <span className="text-sm leading-none">⫿</span>
      </button>
    </div>
  );
}

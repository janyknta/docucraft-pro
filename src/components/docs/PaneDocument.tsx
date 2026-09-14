import { useCallback, useMemo } from "react";
import { MarkdownViewer } from "./MarkdownViewer";
import type { Highlight } from "@/lib/dom-highlighter";
import type { MdFile } from "@/lib/markdown-utils";
import type { ReadingMode } from "@/lib/persistence";
import type { SavedDraft, SavedItem } from "@/lib/saved-items";

const EMPTY_HIGHLIGHTS: Highlight[] = [];
const EMPTY_SAVED: SavedItem[] = [];

/**
 * One pane's document.
 *
 * The single-pane reader gets its props from `DocsApp`, which can afford to
 * derive them for "the active file" because there is only one. In a split there
 * are several documents on screen at once, so each pane narrows the
 * workspace-level collections to its own file here rather than the parent
 * building one set of props per pane.
 *
 * Deliberately thin: the viewer is unchanged, and everything panes add is
 * either a filter over a list or a partial application of a callback that
 * already takes a file id.
 */
export function PaneDocument({
  file,
  files,
  saved,
  highlights,
  workspaceId,
  workspaceRevision,
  workspaceName,
  onContentChange,
  onAddHighlight,
  onUpdateHighlight,
  onRemoveHighlight,
  onRepairHighlights,
  onToggleSaved,
  onRemoveSaved,
  onOpenArtifact,
  readingMode,
}: {
  file: MdFile;
  files: MdFile[];
  saved: SavedItem[];
  highlights: Highlight[];
  workspaceId: string | null;
  workspaceRevision: string;
  workspaceName: string;
  onContentChange: (fileId: string, content: string) => void;
  onAddHighlight: (hl: Omit<Highlight, "id" | "fileId">, fileId: string) => void;
  onUpdateHighlight: (id: string, patch: Partial<Pick<Highlight, "color" | "label">>) => void;
  onRemoveHighlight: (id: string) => void;
  onRepairHighlights?: (patches: Array<{ id: string; patch: Partial<Highlight> }>) => void;
  onToggleSaved: (fileId: string, draft: SavedDraft) => void;
  onRemoveSaved: (id: string) => void;
  onOpenArtifact?: (fileId: string, workspaceId: string) => void;
  readingMode: ReadingMode;
}) {
  const fileHighlights = useMemo(() => {
    const mine = highlights.filter((hl) => hl.fileId === file.id);
    return mine.length > 0 ? mine : EMPTY_HIGHLIGHTS;
  }, [highlights, file.id]);

  const fileSaved = useMemo(() => {
    const mine = saved.filter((item) => item.fileId === file.id);
    return mine.length > 0 ? mine : EMPTY_SAVED;
  }, [saved, file.id]);

  const addHighlight = useCallback(
    (hl: Omit<Highlight, "id" | "fileId">) => onAddHighlight(hl, file.id),
    [onAddHighlight, file.id],
  );
  const toggleSaved = useCallback(
    (draft: SavedDraft) => onToggleSaved(file.id, draft),
    [onToggleSaved, file.id],
  );

  return (
    <MarkdownViewer
      // Keyed by document for the same reason the editor is: a pane switching
      // tabs must not hand one document's editor state to the next.
      key={file.id}
      file={file}
      prevFile={null}
      nextFile={null}
      // Paging between documents belongs to the single-document reader. In a
      // split, the tab strip is how you move between them.
      onNav={() => {}}
      activeSubtopicId={null}
      highlightQuery={null}
      onContentChange={onContentChange}
      nextReadingMin={null}
      isBookmarked={fileSaved.some((item) => item.kind === "file")}
      onToggleBookmark={() => onToggleSaved(file.id, { kind: "file", title: file.name })}
      highlights={fileHighlights}
      onAddHighlight={addHighlight}
      onUpdateHighlight={onUpdateHighlight}
      onRemoveHighlight={onRemoveHighlight}
      onRepairHighlights={onRepairHighlights}
      saved={fileSaved}
      onToggleSaved={toggleSaved}
      onRemoveSaved={onRemoveSaved}
      readingMode={readingMode}
      workspaceId={workspaceId}
      workspaceRevision={workspaceRevision}
      workspaceFiles={files}
      workspaceName={workspaceName}
      onOpenArtifact={onOpenArtifact}
    />
  );
}

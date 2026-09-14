import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Eye } from "lucide-react";
import { caretTop } from "@/lib/source-locate";
import type { FormatAction } from "@/lib/markdown-format";
import { TOOLBAR_ITEMS } from "@/lib/markdown-toolbar-items";
import { MarkdownToolbar } from "./MarkdownToolbar";

/**
 * The markdown source editor.
 *
 * The draft text used to be state on `MarkdownViewer`. Every keystroke
 * therefore re-rendered that entire component: the viewer header, the section
 * `<Select>` (which maps over every chunk in the document and word-counts each
 * one), the navigation footer and the saved-item context. Typing in a large
 * document was visibly behind the keyboard.
 *
 * The draft lives here now. A keystroke re-renders this component and nothing
 * else; the parent only hears about it on the debounced autosave.
 */

/** Imperative surface the viewer's "Inspect in source" jump drives. */
export interface MarkdownEditorHandle {
  /** Focus the textarea and select `[start, end)`, scrolled into view. */
  select: (start: number, end: number) => void;
}

interface Props {
  /** Source to edit. Read once per document — the editor owns it after that. */
  initialContent: string;
  /** Identity of the document being edited; remounts the draft when it changes. */
  fileId: string;
  /** Debounced autosave, and the target of the Cmd/Ctrl+S shortcut. */
  onSave: (content: string) => void;
  /** Leave the editor, keeping the current draft. Passes back the cursor's source index. */
  onDone: (cursorIndex?: number) => void;
  /** Leave the editor, restoring `initialContent`. Passes back the cursor's source index. */
  onCancel: (cursorIndex?: number) => void;
  /** Shown when "Inspect in source" couldn't pin the text to a source span. */
  inspectMissed?: boolean;
}

/** How long typing has to pause before the draft is handed to the parent. */
const AUTOSAVE_MS = 500;

function MarkdownEditorImpl(
  { initialContent, fileId, onSave, onDone, onCancel, inspectMissed }: Props,
  handleRef: React.Ref<MarkdownEditorHandle>,
) {
  const [draft, setDraft] = useState(initialContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Read by the shortcut and the unmount flush, so neither has to be rebuilt
  // (and re-bound) on every keystroke.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Switching documents re-seeds the draft. `fileId` rather than
  // `initialContent`, so the parent echoing an autosave back doesn't clobber
  // whatever has been typed since.
  useEffect(() => {
    setDraft(initialContent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  useImperativeHandle(
    handleRef,
    () => ({
      select: (start, end) => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(start, end);
        ta.scrollTop = Math.max(0, caretTop(ta, start) - ta.clientHeight / 3);
        ta.scrollIntoView({ behavior: "smooth", block: "center" });
      },
    }),
    [],
  );

  // Set when the reader cancels, to stop the unmount flush below from writing
  // the abandoned draft back over the content the parent just restored.
  const cancelledRef = useRef(false);

  // Autosave. Each of these re-renders the parent's file list, so the pause is
  // deliberately longer than a fast typist's gap between keystrokes.
  useEffect(() => {
    if (draft === initialContent) return;
    const t = setTimeout(() => onSaveRef.current(draft), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [draft, initialContent]);

  // Don't lose the tail of a burst of typing when the editor closes between the
  // last keystroke and the autosave firing.
  useEffect(() => {
    return () => {
      if (cancelledRef.current) return;
      if (draftRef.current !== initialContent) onSaveRef.current(draftRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSaveRef.current(draftRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * Run a formatting action against the live selection.
   *
   * The new selection is written back in the same frame as the text, so the
   * reader never sees the caret jump to the end and come back. `setSelectionRange`
   * has to wait for React to commit the new value — setting it against the old
   * text would place it by the wrong offsets.
   */
  const applyFormat = useCallback((action: FormatAction) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const next = action({ text: ta.value, start: ta.selectionStart, end: ta.selectionEnd });
    if (
      next.text === ta.value &&
      next.start === ta.selectionStart &&
      next.end === ta.selectionEnd
    ) {
      return;
    }
    setDraft(next.text);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(next.start, next.end);
    });
  }, []);

  // Formatting shortcuts. Bound on the textarea rather than the window: these
  // are edits to *this* field, and a global binding would fire while the reader
  // was typing in the search box or a rename input.
  const onShortcut = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      for (const item of TOOLBAR_ITEMS) {
        if (!item.shortcut) continue;
        const parts = item.shortcut.split("+");
        if (parts.includes("Shift") !== event.shiftKey) continue;
        if (parts.includes("Alt") !== event.altKey) continue;
        // The last segment is the key itself. Compared case-insensitively, and
        // against `event.code` digits too: Alt on macOS rewrites `key` into a
        // symbol (⌥1 becomes "¡"), which would otherwise never match.
        const wanted = parts[parts.length - 1].toLowerCase();
        const matches = key === wanted || (/^\d$/.test(wanted) && event.code === `Digit${wanted}`);
        if (!matches) continue;
        event.preventDefault();
        applyFormat(item.action);
        return;
      }
    },
    [applyFormat],
  );

  const cancel = useCallback(() => {
    // Order matters: the flag has to be set before the parent unmounts this
    // component, or the cleanup above would re-save the discarded draft.
    cancelledRef.current = true;
    setDraft(initialContent);
    onCancel(textareaRef.current?.selectionStart);
  }, [initialContent, onCancel]);

  return (
    <div>
      {/* Sticky exit bar: leaving edit mode stays reachable no matter how far
          the reader scrolls. Single-pane editor keeps typing smooth — no live
          full-document re-render on every keystroke. */}
      <div className="sticky top-16 z-(--z-sticky) -mx-1 mb-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-background/90 px-3 py-2">
        <span className="truncate text-xs font-medium text-muted-foreground">
          Editing — changes save automatically
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={cancel}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition-opacity hover:bg-muted/80 active:scale-95"
          >
            Cancel
          </button>
          <button
            onClick={() => onDone(textareaRef.current?.selectionStart)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 active:scale-95"
          >
            <Eye className="h-3.5 w-3.5" /> Done · Preview
          </button>
        </div>
      </div>
      {inspectMissed && (
        <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
          Couldn't pin that text to a spot in the source — the editor is open at the start of this
          section instead.
        </div>
      )}
      {/* Toolbar and field are one surface: the buttons act on the text
          directly below them, and a gap between the two would read as chrome
          belonging to the page rather than to this field.

          The toolbar is a plain header pinned to the top of that surface, not a
          sticky element. It was sticky once, which was wrong twice over: the
          offset had to guess the exit bar's height, and `position: sticky` does
          nothing useful inside this `overflow-hidden` box, which is not itself
          a scroll container — the row simply parked partway down the field. The
          editor scrolls as part of the page, so the header travels with it. */}
      <div className="overflow-hidden rounded-lg border border-border bg-muted/30 focus-within:border-primary/50">
        <div className="border-b border-border bg-background/90">
          <MarkdownToolbar onAction={applyFormat} />
        </div>
        <textarea
          id="markdown-source"
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onShortcut}
          spellCheck={false}
          className="min-h-[70vh] w-full resize-y bg-transparent p-4 font-mono text-sm leading-relaxed outline-none"
        />
      </div>
    </div>
  );
}

export const MarkdownEditor = memo(forwardRef<MarkdownEditorHandle, Props>(MarkdownEditorImpl));

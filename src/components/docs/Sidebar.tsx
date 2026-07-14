import { useEffect, useRef, useState } from "react";
import { ChevronRight, Settings, Check, MoreVertical, Trash2, Pencil, Sun, Moon, Monitor, Home, Bookmark, AlertTriangle, X } from "lucide-react";
import { splitIntoSubtopics } from "@/lib/markdown-utils";
import { Link } from "@tanstack/react-router";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import type { MdFile } from "@/lib/markdown-utils";
import { readingMinutes } from "@/lib/markdown-utils";
import type { ProgressMap } from "@/lib/reading-progress";

interface Props {
  files: MdFile[];
  activeFileId: string | null;
  activeHeadingId: string | null;
  progress: ProgressMap;
  expanded: Record<string, boolean>;
  onToggleFile: (fileId: string) => void;
  onSelect: (fileId: string, headingId?: string) => void;
  onAddFiles: () => void;
  onRemoveFile: (id: string) => void;
  onRenameFile: (id: string, newName: string) => void;
  theme: "dark" | "light" | "system";
  onCycleTheme: () => void;
  bookmarks: { fileId: string; subtopicId: string; name: string }[];
  currentWorkspaceName: string;
  canDeleteWorkspace: boolean;
  onRenameCurrentWorkspace: (name: string) => void;
  onDeleteCurrentWorkspace: () => void;
  onClearStorage: () => void;
}

export function Sidebar({
  files,
  activeFileId,
  activeHeadingId,
  progress,
  expanded,
  onToggleFile,
  onSelect,
  onAddFiles,
  onRemoveFile,
  onRenameFile,
  theme,
  onCycleTheme,
  bookmarks,
  currentWorkspaceName,
  canDeleteWorkspace,
  onRenameCurrentWorkspace,
  onDeleteCurrentWorkspace,
  onClearStorage,
}: Props) {
  const ThemeIcon = theme === "dark" ? Sun : theme === "light" ? Moon : Monitor;
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Progressive disclosure: chapters stay collapsed unless the reader opens
  // them; the current chapter is expanded automatically. This keeps the
  // reader from facing hundreds of headings at once.
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeHeadingId]);

  const total = files.length;
  const done = files.filter((f) => progress[f.name]?.completed).length;

  const renderSubtopics = (subtopics: any[], fileId: string) => (
    <ul className="space-y-0.5">
      {subtopics.map((chunk) => {
        const active = activeFileId === fileId && activeHeadingId === chunk.id;
        return (
          <li key={chunk.id}>
            <button
              onClick={() => onSelect(fileId, chunk.id)}
              className={`group relative flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[13px] leading-snug transition-all duration-150 hover:translate-x-0.5 ${
                active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              style={{ paddingLeft: "14px" }}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-primary"
                  aria-hidden
                />
              )}
              <span className="truncate">{chunk.title}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside className="flex h-full flex-col">
      <div className="border-b border-border p-3">
        <nav className="flex flex-col gap-1">
          <Link to="/" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <Home className="h-4 w-4" />
            Home
          </Link>
          <Sheet>
            <SheetTrigger asChild>
              <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground text-left">
                <Bookmark className="h-4 w-4" />
                Bookmarks
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Bookmarks</SheetTitle>
              </SheetHeader>
              <div className="mt-4 flex flex-col gap-1">
                {bookmarks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No bookmarks yet.</p>
                ) : (
                  bookmarks.map((bookmark, i) => (
                    <SheetClose asChild key={i}>
                      <button
                        onClick={() => onSelect(bookmark.fileId, bookmark.subtopicId)}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground text-left"
                      >
                        <Bookmark className="h-4 w-4 shrink-0" />
                        <span className="truncate">{bookmark.name}</span>
                      </button>
                    </SheetClose>
                  ))
                )}
              </div>
            </SheetContent>
          </Sheet>
        </nav>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {files.map((file, i) => {
          const current = file.id === activeFileId;
          const open = expanded[file.id] ?? current;
          const completed = !!progress[file.name]?.completed;
          const mins = readingMinutes(file.content);
          const title = file.name.replace(/\.(md|markdown|mdx|txt)$/i, "");
          return (
            <div key={file.id} className="mb-1.5">
              <div
                className={`group flex items-center gap-1 rounded-lg px-1 transition-colors ${
                  current ? "bg-accent/60" : ""
                }`}
              >
                <button
                  onClick={() => onToggleFile(file.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-2 text-left"
                >
                  <ChevronRight
                    className={`h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform ${open ? "rotate-90" : ""}`}
                  />
                  {/* Chapter state marker */}
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                      completed
                        ? "border-primary bg-primary text-primary-foreground"
                        : current
                          ? "border-primary text-primary"
                          : "border-muted-foreground/40 text-muted-foreground"
                    }`}
                  >
                    {completed ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-[13px] ${
                      current ? "font-semibold text-foreground" : "font-medium text-foreground/80"
                    }`}
                  >
                    {title}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {mins}m
                  </span>
                </button>
                <FileMenu
                  onRename={() => {
                    const newName = window.prompt("Rename file to:", file.name);
                    if (newName && newName !== file.name) {
                      onRenameFile(file.id, newName);
                    }
                  }}
                  onDelete={() => onRemoveFile(file.id)}
                />
              </div>
              {open && (file.subtopics || splitIntoSubtopics(file.content, file.name))?.length > 0 && (
                <div className="relative mb-2 mt-0.5 pl-3">
                  {renderSubtopics(file.subtopics || splitIntoSubtopics(file.content, file.name), file.id)}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="flex gap-2 border-t border-border p-3">
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
        <button
          onClick={onCycleTheme}
          className="flex shrink-0 items-center justify-center rounded-md border border-border p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={`Theme: ${theme}`}
          title={`Theme: ${theme}`}
        >
          <ThemeIcon className="h-4 w-4" />
        </button>
      </div>

      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          currentWorkspaceName={currentWorkspaceName}
          canDeleteWorkspace={canDeleteWorkspace}
          onRenameCurrentWorkspace={onRenameCurrentWorkspace}
          onDeleteCurrentWorkspace={onDeleteCurrentWorkspace}
          onClearStorage={onClearStorage}
        />
      )}
    </aside>
  );
}

function SettingsModal({
  onClose,
  currentWorkspaceName,
  canDeleteWorkspace,
  onRenameCurrentWorkspace,
  onDeleteCurrentWorkspace,
  onClearStorage,
}: {
  onClose: () => void;
  currentWorkspaceName: string;
  canDeleteWorkspace: boolean;
  onRenameCurrentWorkspace: (name: string) => void;
  onDeleteCurrentWorkspace: () => void;
  onClearStorage: () => void;
}) {
  const [name, setName] = useState(currentWorkspaceName);
  const [confirm, setConfirm] = useState<null | "delete" | "clear">(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const saveName = () => {
    const v = name.trim();
    if (v && v !== currentWorkspaceName) onRenameCurrentWorkspace(v);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">Settings</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Rename workspace
            </label>
            <div className="mt-2 flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
                placeholder="Workspace name"
              />
              <button
                onClick={saveName}
                disabled={!name.trim() || name.trim() === currentWorkspaceName}
                className="shrink-0 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>

          <div className="border-t border-border pt-5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Danger zone
            </label>
            <div className="mt-3 space-y-2">
              <button
                onClick={() => setConfirm("delete")}
                disabled={!canDeleteWorkspace}
                title={canDeleteWorkspace ? "" : "You can't delete your only workspace"}
                className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Delete workspace
                </span>
                <span className="truncate text-xs text-muted-foreground">{currentWorkspaceName}</span>
              </button>
              <button
                onClick={() => setConfirm("clear")}
                className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/5"
              >
                <AlertTriangle className="h-4 w-4" />
                Clear all storage
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Clearing storage removes every workspace, file, bookmark, and preference on this device.
            </p>
          </div>
        </div>

        {confirm && (
          <div className="border-t border-border bg-accent/30 p-5">
            <p className="text-sm text-foreground">
              {confirm === "delete"
                ? `Delete “${currentWorkspaceName}”? This can't be undone.`
                : "Clear everything on this device? This can't be undone."}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setConfirm(null)}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirm === "delete") onDeleteCurrentWorkspace();
                  else onClearStorage();
                  onClose();
                }}
                className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:opacity-90"
              >
                {confirm === "delete" ? "Delete" : "Clear"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FileMenu({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative ml-0.5 flex shrink-0 items-center">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground ${open ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover:opacity-100"}`}
        aria-label="Options"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-32 rounded-md border border-border bg-popover p-1 shadow-md">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onRename();
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-foreground hover:bg-accent"
          >
            <Pencil className="h-3.5 w-3.5" />
            Rename
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive hover:bg-accent/50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

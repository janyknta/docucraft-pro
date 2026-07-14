import { useMemo, useState } from "react";
import {
  ArrowRight,
  Clock,
  FolderOpen,
  Bookmark,
  FileText,
  Upload,
  Check,
} from "lucide-react";

export interface RecentItem {
  id: string;
  name: string;
  minutes: number;
  progress: number; // 0..1
  completed: boolean;
}

export interface WorkspaceItem {
  id: string;
  name: string;
  current: boolean;
}

export interface BookmarkItem {
  fileId: string;
  subtopicId: string;
  name: string;
}

interface Props {
  userName: string | null;
  isFirstVisit: boolean;
  onSubmitName: (name: string) => void;
  resume: { id: string; name: string } | null;
  recent: RecentItem[];
  workspaces: WorkspaceItem[];
  bookmarks: BookmarkItem[];
  hasFiles: boolean;
  onOpenFile: (fileId: string, subtopicId?: string) => void;
  onSwitchWorkspace: (id: string) => void;
  onUpload: () => void;
}

const FIRST_TIME = [
  "Welcome, {name}.",
  "Good to have you here, {name}.",
  "Hello {name} — let's get reading.",
];
const RETURNING = [
  "Welcome back, {name}.",
  "Good to see you again, {name}.",
  "Hey {name}, welcome back.",
];
const LEFT_OFF = [
  "Looks like you left off, {name}.",
  "Pick up where you left off, {name}.",
  "You were mid-way, {name} — jump back in.",
];

const stripExt = (name: string) => name.replace(/\.(md|markdown|mdx|txt)$/i, "");

export function HomePage({
  userName,
  isFirstVisit,
  onSubmitName,
  resume,
  recent,
  workspaces,
  bookmarks,
  hasFiles,
  onOpenFile,
  onSwitchWorkspace,
  onUpload,
}: Props) {
  const [draft, setDraft] = useState("");

  const greeting = useMemo(() => {
    const pool = resume ? LEFT_OFF : isFirstVisit ? FIRST_TIME : RETURNING;
    const msg = pool[Math.floor(Math.random() * pool.length)];
    return msg.replace("{name}", userName ?? "there");
    // Re-roll only when the state that drives the message changes.
  }, [userName, isFirstVisit, !!resume]);

  // No name yet → ask once. Same input styling as the app's search field.
  if (!userName) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-md flex-col justify-center px-6 py-16">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Welcome
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
          What do we call you?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We&apos;ll remember it on this device to personalize your reading.
        </p>
        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = draft.trim();
            if (v) onSubmitName(v);
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10 md:px-10 md:py-16">
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
        {greeting}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {hasFiles
          ? "Your documents are saved locally on this device and restored automatically."
          : "Upload Markdown files to start a calm, book-like reading experience."}
      </p>

      {/* Continue where you left off */}
      {resume && (
        <button
          onClick={() => onOpenFile(resume.id)}
          className="group mt-8 flex w-full items-center justify-between gap-4 rounded-xl border border-border p-5 text-left transition-all hover:border-primary/50 hover:bg-accent/40"
        >
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Continue reading
            </span>
            <span className="mt-1 block truncate text-base font-semibold text-foreground">
              {stripExt(resume.name)}
            </span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </button>
      )}

      {!hasFiles && (
        <button
          onClick={onUpload}
          className="mt-8 flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-10 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <Upload className="h-5 w-5" />
          Upload Markdown files
        </button>
      )}

      {/* Recent files */}
      {recent.length > 0 && (
        <Section label="Recent files">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {recent.map((f) => (
              <button
                key={f.id}
                onClick={() => onOpenFile(f.id)}
                className="group flex flex-col gap-2 rounded-xl border border-border p-4 text-left transition-all hover:border-primary/50 hover:bg-accent/40"
              >
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {stripExt(f.name)}
                  </span>
                  {f.completed && (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.round(Math.min(1, f.progress) * 100)}%` }}
                  />
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />≈ {f.minutes} min
                </span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* Workspaces */}
      <Section label="Workspaces">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => onSwitchWorkspace(w.id)}
              className="group flex items-center gap-3 rounded-xl border border-border p-4 text-left transition-all hover:border-primary/50 hover:bg-accent/40"
            >
              <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {w.name}
              </span>
              {w.current && (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  Current
                </span>
              )}
            </button>
          ))}
        </div>
      </Section>

      {/* Bookmarks */}
      <Section label="Bookmarks">
        {bookmarks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No bookmarks yet. Open a chapter and tap the bookmark to keep it here.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {bookmarks.map((b, i) => (
              <button
                key={i}
                onClick={() => onOpenFile(b.fileId, b.subtopicId)}
                className="group flex items-center gap-3 rounded-xl border border-border p-4 text-left transition-all hover:border-primary/50 hover:bg-accent/40"
              >
                <Bookmark className="h-4 w-4 shrink-0 fill-primary text-primary" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {b.name}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </button>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {children}
    </section>
  );
}

import { useEffect, useState } from "react";
import { ArrowRight, Clock, Bookmark, FileText, Upload, Check } from "lucide-react";

export interface RecentItem {
  id: string;
  name: string;
  minutes: number;
  progress: number;
  completed: boolean;
}

export interface BookmarkItem {
  fileId: string;
  subtopicId: string;
  name: string;
}

interface Props {
  userName: string | null;
  onSubmitName: (name: string) => void;
  recent: RecentItem[];
  bookmarks: BookmarkItem[];
  hasFiles: boolean;
  onOpenFile: (fileId: string, subtopicId?: string) => void;
  onUpload: () => void;
}

const stripExt = (name: string) => name.replace(/\.(md|markdown|mdx|txt)$/i, "");

export function HomePage({
  userName,
  onSubmitName,
  recent,
  bookmarks,
  hasFiles,
  onOpenFile,
  onUpload,
}: Props) {
  const [draft, setDraft] = useState("");
  const [showModal, setShowModal] = useState(!userName);

  useEffect(() => {
    if (!userName) setShowModal(true);
  }, [userName]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = draft.trim();
    if (!v) return;
    onSubmitName(v);
    setShowModal(false);
  };

  // ----- Content -----
  const displayName = userName ?? "there";

  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-6 py-16 md:px-10 md:py-24">
        <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
          Welcome, {displayName}.
        </h1>

        {!hasFiles ? (
          <>
            <p className="mt-4 text-base text-muted-foreground">
              Nothing here yet. Add a Markdown file to get started.
            </p>
            <button
              onClick={onUpload}
              className="mt-10 inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              <Upload className="h-4 w-4" />
              Add Markdown file
            </button>
          </>
        ) : (
          <>
            <p className="mt-3 text-base text-muted-foreground">
              Pick up where you left off.
            </p>

            {recent.length > 0 && (
              <Section label="Continue reading">
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

            {bookmarks.length > 0 && (
              <Section label="Bookmarks">
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
              </Section>
            )}

            <button
              onClick={onUpload}
              className="mt-10 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-6 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              <Upload className="h-4 w-4" />
              Add more Markdown files
            </button>
          </>
        )}
      </div>

      {/* Name modal — shown once on first visit */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-2xl">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Welcome
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
              What do we call you?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We&apos;ll remember it on this device to personalize your reading.
            </p>
            <form className="mt-5 flex gap-2" onSubmit={submit}>
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
        </div>
      )}
    </>
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

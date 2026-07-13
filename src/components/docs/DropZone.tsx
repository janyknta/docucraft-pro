import { useRef, useState, type DragEvent } from "react";
import { FileText, Upload, Sparkles } from "lucide-react";

interface Props {
  onFiles: (files: File[]) => void;
  fullscreen?: boolean;
}

export function DropZone({ onFiles, fullscreen }: Props) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list).filter((f) => /\.(md|markdown|mdx|txt)$/i.test(f.name));
    if (files.length) onFiles(files);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    handle(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      className={
        fullscreen
          ? "flex min-h-[calc(100dvh-4rem)] items-center justify-center px-6 py-16"
          : "px-6 py-8"
      }
    >
      <div
        className={`relative w-full max-w-2xl rounded-2xl border-2 border-dashed p-12 text-center transition-all ${
          drag
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border bg-card/50 hover:border-primary/40 hover:bg-card"
        }`}
      >
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <FileText className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Drop your Markdown files here
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We'll parse the heading hierarchy and build a navigable documentation site — instantly.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            <Upload className="h-4 w-4" />
            Choose files
          </button>
          <div className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            .md · .markdown · .mdx
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".md,.markdown,.mdx,.txt,text/markdown"
          className="hidden"
          onChange={(e) => handle(e.target.files)}
        />
      </div>
    </div>
  );
}

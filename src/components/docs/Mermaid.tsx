import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { Download, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

let initialized = false;

function ensureInit(dark: boolean) {
  mermaid.initialize({
    startOnLoad: false,
    theme: dark ? "dark" : "default",
    securityLevel: "loose",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
  });
  initialized = true;
}

let counter = 0;

export function Mermaid({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const idRef = useRef(`mmd-${++counter}`);

  useEffect(() => {
    const render = async () => {
      try {
        const dark = document.documentElement.classList.contains("dark");
        ensureInit(dark);
        const { svg } = await mermaid.render(idRef.current, code);
        setSvg(svg);
        setError(null);
      } catch (e: any) {
        setError(e?.message ?? "Failed to render diagram");
      }
    };
    render();
    const obs = new MutationObserver(() => {
      initialized = false;
      render();
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, [code]);

  const download = (type: "svg" | "png") => {
    if (!svg) return;
    if (type === "svg") {
      const blob = new Blob([svg], { type: "image/svg+xml" });
      trigger(URL.createObjectURL(blob), "diagram.svg");
      return;
    }
    const img = new Image();
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        if (b) trigger(URL.createObjectURL(b), "diagram.png");
      });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  if (error) {
    return (
      <div className="my-6 overflow-auto rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <div className="mb-2 font-semibold text-destructive">Mermaid error</div>
        <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{error}</pre>
      </div>
    );
  }

  return (
    <div className="group relative my-6 overflow-hidden rounded-xl border border-border bg-muted/30">
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <IconBtn onClick={() => setZoom((z) => Math.min(3, z * 1.2))} label="Zoom in">
          <ZoomIn className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))} label="Zoom out">
          <ZoomOut className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          label="Reset"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn onClick={() => download("svg")} label="Download SVG">
          <span className="text-[10px] font-semibold">SVG</span>
        </IconBtn>
        <IconBtn onClick={() => download("png")} label="Download PNG">
          <Download className="h-3.5 w-3.5" />
        </IconBtn>
      </div>
      <div
        className="flex min-h-[160px] cursor-grab items-center justify-center overflow-hidden p-4 active:cursor-grabbing"
        onMouseDown={(e) => (dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y })}
        onMouseMove={(e) => {
          if (!dragRef.current) return;
          setPan({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
        }}
        onMouseUp={() => (dragRef.current = null)}
        onMouseLeave={() => (dragRef.current = null)}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: dragRef.current ? "none" : "transform 0.15s ease",
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
}

function IconBtn({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border/60 bg-background/90 px-1.5 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
    >
      {children}
    </button>
  );
}

function trigger(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

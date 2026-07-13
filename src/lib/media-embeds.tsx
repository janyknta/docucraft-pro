import type { ReactNode } from "react";

interface Embed {
  src: string;
  title: string;
  aspect?: string;
  allow?: string;
}

export function detectEmbed(url: string): Embed | null {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, "");

    // YouTube
    if (h === "youtube.com" || h === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return yt(v);
    }
    if (h === "youtu.be") {
      const v = u.pathname.slice(1);
      if (v) return yt(v);
    }
    if (h === "youtube.com" && u.pathname.startsWith("/embed/")) {
      return yt(u.pathname.split("/")[2]);
    }

    // Vimeo
    if (h === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id && /^\d+$/.test(id))
        return {
          src: `https://player.vimeo.com/video/${id}`,
          title: "Vimeo video",
          allow: "autoplay; fullscreen; picture-in-picture",
        };
    }

    // Loom
    if (h === "loom.com" && u.pathname.startsWith("/share/")) {
      const id = u.pathname.split("/")[2];
      return { src: `https://www.loom.com/embed/${id}`, title: "Loom video" };
    }

    // CodeSandbox
    if (h === "codesandbox.io") {
      return {
        src: url.replace("/s/", "/embed/").replace("/p/sandbox/", "/embed/"),
        title: "CodeSandbox",
        aspect: "16 / 10",
      };
    }

    // StackBlitz
    if (h === "stackblitz.com") {
      const embedUrl = url.includes("?") ? `${url}&embed=1` : `${url}?embed=1`;
      return { src: embedUrl, title: "StackBlitz", aspect: "16 / 10" };
    }

    // CodePen
    if (h === "codepen.io" && u.pathname.includes("/pen/")) {
      return {
        src: url.replace("/pen/", "/embed/"),
        title: "CodePen",
        aspect: "16 / 10",
      };
    }

    // GitHub Gist
    if (h === "gist.github.com") {
      return { src: `${url}.pibb`, title: "GitHub Gist", aspect: "16 / 12" };
    }

    // Google Drive
    if (h === "drive.google.com" && u.pathname.includes("/file/d/")) {
      const id = u.pathname.split("/")[3];
      return {
        src: `https://drive.google.com/file/d/${id}/preview`,
        title: "Google Drive",
      };
    }

    return null;
  } catch {
    return null;
  }
}

function yt(id: string): Embed {
  return {
    src: `https://www.youtube.com/embed/${id}`,
    title: "YouTube video",
    allow:
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
  };
}

export function EmbedFrame({ embed }: { embed: Embed }): ReactNode {
  return (
    <div
      className="my-6 overflow-hidden rounded-xl border border-border bg-muted"
      style={{ aspectRatio: embed.aspect ?? "16 / 9" }}
    >
      <iframe
        src={embed.src}
        title={embed.title}
        loading="lazy"
        allow={embed.allow}
        allowFullScreen
        className="h-full w-full border-0"
      />
    </div>
  );
}

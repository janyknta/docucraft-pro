export interface MdHeading {
  id: string;
  text: string;
  level: number;
  fileId: string;
  children: MdHeading[];
}

export interface MdChunk {
  id: string;
  title: string;
  content: string;
}

export interface MdFile {
  id: string;
  name: string;
  content: string;
  headings: MdHeading[];
  subtopics: MdChunk[];
}

import GithubSlugger, { slug } from "github-slugger";

export const stripExt = (name: string) => name.replace(/\.(md|markdown|mdx|txt)$/i, "");

// Stateless slug matching rehype-slug (github-slugger) so sidebar/ToC ids
// line up exactly with the DOM ids rendered by rehypeSlug. Local ad-hoc
// slugging drifted on `&`, `/`, and other punctuation, breaking navigation.
export function slugify(text: string): string {
  return slug(text) || "section";
}

export function parseHeadings(content: string, fileId: string): MdHeading[] {
  const lines = content.split("\n");
  const flat: MdHeading[] = [];
  // A fresh slugger per file mirrors rehypeSlug's per-document dedup counter.
  const slugger = new GithubSlugger();
  let inCode = false;
  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const level = m[1].length;
    const text = m[2].trim();
    const id = slugger.slug(text || "section");
    flat.push({ id, text, level, fileId, children: [] });
  }
  // build tree
  const root: MdHeading[] = [];
  const stack: MdHeading[] = [];
  for (const h of flat) {
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
    if (stack.length === 0) root.push(h);
    else stack[stack.length - 1].children.push(h);
    stack.push(h);
  }
  return root;
}

export function readingMinutes(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export function flattenHeadings(headings: MdHeading[]): MdHeading[] {
  const out: MdHeading[] = [];
  const walk = (hs: MdHeading[]) => {
    for (const h of hs) {
      out.push(h);
      walk(h.children);
    }
  };
  walk(headings);
  return out;
}

export function splitIntoSubtopics(content: string, fileName: string): MdChunk[] {
  const lines = content.split("\n");
  const chunks: MdChunk[] = [];
  const slugger = new GithubSlugger();
  
  let currentChunk: string[] = [];
  let currentId = "preamble";
  let currentTitle = stripExt(fileName);
  let inCode = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCode = !inCode;
      currentChunk.push(line);
      continue;
    }
    
    // Split on H1 and H2 (level 1 and 2)
    if (!inCode) {
      const m = /^(#{1,2})\s+(.+?)\s*#*\s*$/.exec(line);
      if (m) {
        if (currentChunk.some(l => l.trim().length > 0)) {
          chunks.push({
            id: currentId,
            title: currentTitle,
            content: currentChunk.join("\n")
          });
        } else if (chunks.length > 0) {
           chunks.push({
            id: currentId,
            title: currentTitle,
            content: ""
          });
        }
        
        currentChunk = [line];
        currentTitle = m[2].trim();
        currentId = slugger.slug(currentTitle || "section");
        continue;
      }
    }
    
    currentChunk.push(line);
  }
  
  if (currentChunk.some(l => l.trim().length > 0) || chunks.length === 0) {
    chunks.push({
      id: currentId,
      title: currentTitle,
      content: currentChunk.join("\n")
    });
  }
  
  return chunks;
}

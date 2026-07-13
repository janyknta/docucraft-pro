export interface MdHeading {
  id: string;
  text: string;
  level: number;
  fileId: string;
  children: MdHeading[];
}

export interface MdFile {
  id: string;
  name: string;
  content: string;
  headings: MdHeading[];
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function parseHeadings(content: string, fileId: string): MdHeading[] {
  const lines = content.split("\n");
  const flat: MdHeading[] = [];
  const seen = new Map<string, number>();
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
    let base = slugify(text);
    if (!base) base = "section";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count}`;
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

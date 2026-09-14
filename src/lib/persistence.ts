// Local-first persistence, Excalidraw-style. No backend.
//
// - IndexedDB is the primary store: workspaces (markdown files + edits + UI
//   state) live here, keyed by workspace id.
// - localStorage holds only lightweight preferences (theme, last-opened
//   workspace). Reading progress, recent searches and sidebar width keep their
//   own small localStorage keys elsewhere; they already survive refresh.
//
// All IndexedDB access is funnelled through this module so UI components never
// touch the database directly.

export interface PersistedFile {
  id: string;
  name: string;
  content: string;
  data?: string;
  mimeType?: string;
  size?: number;
  addedAt?: number;
  kind?: import("./markdown-utils").DocumentKind;
  /** Sidebar folder this file is filed under; null/undefined = top level. */
  folderId?: string | null;
}

/**
 * A sidebar folder. Purely an organizational bucket over the flat file list —
 * files keep living in `WorkspaceRecord.files` and point back with `folderId`,
 * so a workspace whose folders are dropped (an older build, a share link)
 * degrades to the flat list rather than losing documents.
 */
export interface FolderRecord {
  id: string;
  name: string;
  createdAt: number;
}

export interface PersistedUI {
  activeFileId: string | null;
  expanded: Record<string, boolean>;
  sidebarCollapsed: boolean;
  scrollTop: number;
  fileOrder?: string[];
  /** File ids in most-recently-opened order — drives the "Recent" chip. */
  recentFileIds?: string[];
}

import type { Highlight } from "./dom-highlighter";
import type { SavedItem } from "./saved-items";

export interface WorkspaceRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  files: PersistedFile[];
  folders?: FolderRecord[];
  /**
   * Legacy `${fileId}#${subtopicId}` stars. Still written so a downgrade keeps
   * working, but `saved` is the source of truth — see `migrateBookmarks`.
   */
  bookmarks: string[];
  /** Stars on files, sections, blocks and selections. */
  saved?: SavedItem[];
  highlights?: Highlight[];
  ui: PersistedUI;
}

export type SaveStatus = "idle" | "saving" | "saved" | "restored";

const DB_NAME = "localdox";
const DB_VERSION = 1;
const STORE = "workspaces";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function request<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

async function deleteDatabase(): Promise<void> {
  const openDatabase = dbPromise;
  dbPromise = null;

  try {
    (await openDatabase)?.close();
  } catch {
    // The database may never have opened; deletion can still proceed.
  }

  if (typeof indexedDB === "undefined") return;

  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Could not delete local database"));
    req.onblocked = () => reject(new Error("Close Localdox in other tabs before clearing storage"));
  });
}

export const persistence = {
  getWorkspace(id: string) {
    return request<WorkspaceRecord | undefined>("readonly", (s) => s.get(id));
  },
  putWorkspace(w: WorkspaceRecord) {
    return request<IDBValidKey>("readwrite", (s) => s.put(w)).then(() => {});
  },
  deleteWorkspace(id: string) {
    return request<undefined>("readwrite", (s) => s.delete(id)).then(() => {});
  },
  listWorkspaces() {
    return request<WorkspaceRecord[]>("readonly", (s) => s.getAll());
  },
  clearAll() {
    return request<undefined>("readwrite", (s) => s.clear()).then(() => {});
  },
  destroy() {
    return deleteDatabase();
  },
};

// ---- scroll position (localStorage, per workspace) ----
//
// Scroll position used to ride along in the workspace record, which meant every
// scroll-stop wrote the entire workspace back to IndexedDB — every document's
// text plus every binary file's base64 data URL, structured-cloned in one go.
// In a workspace holding a few PDFs that is tens of megabytes of copying on the
// main thread, every time the reader stopped scrolling.
//
// It is one number. It lives in localStorage now, keyed per workspace, and the
// workspace record is only written when the workspace itself actually changes.
// `WorkspaceRecord.ui.scrollTop` is still populated on save so exports and
// share links keep working.

const SCROLL_KEY_PREFIX = "localdox:scroll:";

export function saveScrollTop(workspaceId: string, top: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SCROLL_KEY_PREFIX + workspaceId, String(Math.round(top)));
  } catch {
    /* storage unavailable — the position is simply not restored next time */
  }
}

export function loadScrollTop(workspaceId: string): number | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SCROLL_KEY_PREFIX + workspaceId);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

export function emptyUI(): PersistedUI {
  return {
    activeFileId: null,
    expanded: {},
    sidebarCollapsed: false,
    scrollTop: 0,
    fileOrder: [],
    recentFileIds: [],
  };
}

export function newWorkspaceRecord(name: string): WorkspaceRecord {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    files: [],
    folders: [],
    bookmarks: [],
    saved: [],
    highlights: [],
    ui: emptyUI(),
  };
}

// ---- lightweight preferences (localStorage) ----

// One light and one dark palette, both WCAG-checked (see styles.css). The set
// was five; sepia/nord/black were dropped so there is one obvious choice per
// ambient light level rather than three near-identical dark variants.
export type ThemePref = "light" | "dark";

// Themes whose surfaces are dark — used to keep the legacy `.dark` class in sync
// so dark-only rules (code highlighting, katex, mermaid) still apply.
export const DARK_THEMES: readonly ThemePref[] = ["dark"];
export const READER_THEMES: readonly ThemePref[] = ["light", "dark"];

export function isDarkTheme(theme: ThemePref): boolean {
  return DARK_THEMES.includes(theme);
}

/** Stored prefs predating the trim name themes that no longer exist. Map each
 *  to whichever survivor matches its brightness, so an existing reader's screen
 *  does not invert under them. */
function migrateTheme(theme: unknown): ThemePref {
  if (theme === "light" || theme === "dark") return theme;
  if (theme === "sepia") return "light";
  if (theme === "nord" || theme === "black") return "dark";
  return DEFAULT_PREFS.theme;
}

// How a multi-section markdown document is laid out for reading.
// "paginated" = one section per page with prev/next; "single" = whole doc scrolls.
export type ReadingMode = "paginated" | "single";

// Reading typeface. Each maps to a --font-body / --font-heading pair in styles.css.
// One built-in face — Atkinson Hyperlegible, drawn for maximum letterform
// distinction — plus whatever the reader uploads themselves. The other bundled
// families were dropped: picking between five similar faces is not a decision
// worth putting in front of someone who wants to read.
export type ReadingFont = "hyperlegible" | "custom" | "google";
export const READING_FONTS: readonly ReadingFont[] = ["hyperlegible", "custom", "google"];

/** Old prefs name faces that are no longer bundled. They all collapse onto the
 *  one remaining built-in; "custom" only survives if a font is actually stored,
 *  and "google" only if a family name was saved alongside it — both of which
 *  the caller checks separately. */
function migrateFont(font: unknown): ReadingFont {
  if (font === "custom") return "custom";
  if (font === "google") return "google";
  return "hyperlegible";
}

export interface Prefs {
  theme: ThemePref;
  /**
   * Colour diagram nodes by what they mean — green for success, red for
   * failure, amber for a decision — rather than leaving every box the same
   * neutral fill. Applies to Raw and Stepped; Flow keeps the animator's own
   * palette, which already colours by packet.
   */
  diagramColors: boolean;
  /**
   * Whether the AI features exist at all.
   *
   * Off hides every AI surface — the Ask AI panel and its sidebar entry, the
   * Ask AI row on the selection popover, the settings tab — rather than
   * greying them out. A reader who does not want AI in their reader should not
   * have to look at it.
   */
  aiEnabled: boolean;
  lastWorkspaceId: string | null;
  // The reader's name, asked once and remembered for personalized greetings.
  name: string | null;
  // True once the reader has answered the name prompt (set a name or skipped),
  // so the greeting modal never asks again.
  namePrompted: boolean;
  readingMode: ReadingMode;
  readingFont: ReadingFont;
  /**
   * The Google Fonts family backing `readingFont: "google"`.
   *
   * Only the name is kept — the face itself is fetched from Google's CDN on
   * boot. Null whenever the reader has never named one, which is also what
   * makes the "google" choice inert until they do.
   */
  googleFont: string | null;
}

const PREFS_KEY = "localdox:prefs";
const DEFAULT_PREFS: Prefs = {
  theme: "dark",
  diagramColors: true,
  aiEnabled: true,
  lastWorkspaceId: null,
  name: null,
  namePrompted: false,
  readingMode: "paginated",
  readingFont: "hyperlegible",
  googleFont: null,
};

export function loadPrefs(): Prefs {
  if (typeof localStorage === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const stored = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    // Themes and faces were trimmed; a pref naming a removed one has to be
    // mapped on read or it would set a `data-theme` no stylesheet answers.
    return {
      ...stored,
      theme: migrateTheme(stored.theme),
      readingFont: migrateFont(stored.readingFont),
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(patch: Partial<Prefs>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...patch }));
  } catch {
    /* storage unavailable — preferences stay in memory */
  }
}

// ---- import / export (JSON) ----

export function serializeWorkspace(w: WorkspaceRecord): string {
  return JSON.stringify({ format: "localdox-workspace", version: 1, workspace: w }, null, 2);
}

/** Parse an exported workspace JSON into a fresh record (new id, no clobber). */
export function parseWorkspaceImport(json: string): WorkspaceRecord {
  const data = JSON.parse(json);
  const w = data?.workspace ?? data;
  if (!w || !Array.isArray(w.files)) {
    throw new Error("Not a valid workspace file");
  }
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: typeof w.name === "string" && w.name.trim() ? w.name : "Imported workspace",
    createdAt: typeof w.createdAt === "number" ? w.createdAt : now,
    updatedAt: now,
    files: w.files
      .filter((f: any) => f && typeof f.content === "string")
      .map((f: any) => ({
        id: typeof f.id === "string" ? f.id : crypto.randomUUID(),
        name: typeof f.name === "string" ? f.name : "untitled.md",
        content: f.content,
        data: typeof f.data === "string" ? f.data : undefined,
        mimeType: typeof f.mimeType === "string" ? f.mimeType : undefined,
        size: typeof f.size === "number" ? f.size : undefined,
        addedAt: typeof f.addedAt === "number" ? f.addedAt : undefined,
        kind: typeof f.kind === "string" ? f.kind : undefined,
        folderId: typeof f.folderId === "string" ? f.folderId : null,
      })),
    folders: Array.isArray(w.folders)
      ? (w.folders as Partial<FolderRecord>[])
          .filter((f) => f && typeof f.id === "string" && typeof f.name === "string")
          .map((f) => ({
            id: f.id as string,
            name: f.name as string,
            createdAt: typeof f.createdAt === "number" ? f.createdAt : now,
          }))
      : [],
    bookmarks: Array.isArray(w.bookmarks)
      ? w.bookmarks.filter((b: any) => typeof b === "string")
      : [],
    highlights: Array.isArray(w.highlights) ? w.highlights : [],
    ui: {
      activeFileId: typeof w.ui?.activeFileId === "string" ? w.ui.activeFileId : null,
      expanded: typeof w.ui?.expanded === "object" ? w.ui.expanded : {},
      sidebarCollapsed: typeof w.ui?.sidebarCollapsed === "boolean" ? w.ui.sidebarCollapsed : false,
      scrollTop: typeof w.ui?.scrollTop === "number" ? w.ui.scrollTop : 0,
      fileOrder: Array.isArray(w.ui?.fileOrder) ? w.ui.fileOrder : [],
      recentFileIds: Array.isArray(w.ui?.recentFileIds) ? w.ui.recentFileIds : [],
    },
  };
}

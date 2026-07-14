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
}

export interface PersistedUI {
  activeFileId: string | null;
  expanded: Record<string, boolean>;
  sidebarCollapsed: boolean;
  scrollTop: number;
}

import type { Highlight } from "./dom-highlighter";

export interface WorkspaceRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  files: PersistedFile[];
  // Bookmarked file ids, shown on the home page.
  bookmarks: string[];
  highlights?: Highlight[];
  ui: PersistedUI;
}

export type SaveStatus = "idle" | "saving" | "saved" | "restored";

const DB_NAME = "docucraft-pro";
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
};

export function emptyUI(): PersistedUI {
  return { activeFileId: null, expanded: {}, sidebarCollapsed: false, scrollTop: 0 };
}

export function newWorkspaceRecord(name: string): WorkspaceRecord {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    files: [],
    bookmarks: [],
    highlights: [],
    ui: emptyUI(),
  };
}

// ---- lightweight preferences (localStorage) ----

export type ThemePref = "light" | "dark" | "system";

export interface Prefs {
  theme: ThemePref;
  lastWorkspaceId: string | null;
  // The reader's name, asked once and remembered for personalized greetings.
  name: string | null;
}

const PREFS_KEY = "docucraft:prefs";
const DEFAULT_PREFS: Prefs = { theme: "system", lastWorkspaceId: null, name: null };

export function loadPrefs(): Prefs {
  if (typeof localStorage === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS };
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
  return JSON.stringify({ format: "docucraft-workspace", version: 1, workspace: w }, null, 2);
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
      })),
    bookmarks: Array.isArray(w.bookmarks)
      ? w.bookmarks.filter((b: any) => typeof b === "string")
      : [],
    highlights: Array.isArray(w.highlights) ? w.highlights : [],
    ui: {
      activeFileId: typeof w.ui?.activeFileId === "string" ? w.ui.activeFileId : null,
      expanded: typeof w.ui?.expanded === "object" ? w.ui.expanded : {},
      sidebarCollapsed: typeof w.ui?.sidebarCollapsed === "boolean" ? w.ui.sidebarCollapsed : false,
      scrollTop: typeof w.ui?.scrollTop === "number" ? w.ui.scrollTop : 0,
    },
  };
}

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { antoinePath } from './paths.js';

/**
 * A single completed exchange within a session.
 */
export interface SessionTurn {
  query: string;
  answer: string;
  at: string;
}

/**
 * A persisted, resumable conversation thread. One file per session lives in
 * `.antoine/sessions/<id>.json`. Sessions let the user pick up a research
 * thread later with full multi-turn context restored into the model.
 */
export interface SessionFile {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  turns: SessionTurn[];
}

/**
 * Lightweight metadata used when listing sessions (no turn bodies).
 */
export interface SessionSummary {
  id: string;
  title: string;
  updatedAt: string;
  turnCount: number;
}

const SESSIONS_DIR = 'sessions';

function sessionsDir(): string {
  return antoinePath(SESSIONS_DIR);
}

function sessionPath(id: string): string {
  return join(sessionsDir(), `${id}.json`);
}

function makeId(): string {
  // Sortable, filesystem-safe: 2026-06-19T14-22-05-123Z
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function deriveTitle(query: string): string {
  const firstLine = query.split('\n').find((l) => l.trim()) ?? query;
  const clean = firstLine.trim();
  return clean.length > 70 ? `${clean.slice(0, 70)}…` : clean;
}

/**
 * Manages the lifecycle of one session: create it, append turns as the user
 * works, and persist to disk after every turn so a crash never loses history.
 */
export class SessionStore {
  private session: SessionFile;

  private constructor(session: SessionFile) {
    this.session = session;
  }

  /** Start a brand-new session. */
  static create(model: string): SessionStore {
    const now = new Date().toISOString();
    return new SessionStore({
      id: makeId(),
      title: 'New session',
      createdAt: now,
      updatedAt: now,
      model,
      turns: [],
    });
  }

  /** Wrap an already-loaded session so new turns append to it. */
  static fromExisting(session: SessionFile): SessionStore {
    return new SessionStore(session);
  }

  get id(): string {
    return this.session.id;
  }

  get data(): SessionFile {
    return this.session;
  }

  get turns(): SessionTurn[] {
    return this.session.turns;
  }

  setModel(model: string): void {
    this.session.model = model;
  }

  /** Append a completed turn and persist. The first turn sets the title. */
  async appendTurn(query: string, answer: string): Promise<void> {
    if (this.session.turns.length === 0) {
      this.session.title = deriveTitle(query);
    }
    this.session.turns.push({ query, answer, at: new Date().toISOString() });
    this.session.updatedAt = new Date().toISOString();
    await this.save();
  }

  private async save(): Promise<void> {
    const dir = sessionsDir();
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(sessionPath(this.session.id), JSON.stringify(this.session, null, 2), 'utf-8');
  }
}

/** Load a specific session by id, or null if it doesn't exist / is unreadable. */
export async function loadSession(id: string): Promise<SessionFile | null> {
  try {
    const content = await readFile(sessionPath(id), 'utf-8');
    return JSON.parse(content) as SessionFile;
  } catch {
    return null;
  }
}

/** List all saved sessions, newest first. */
export async function listSessions(): Promise<SessionSummary[]> {
  const dir = sessionsDir();
  if (!existsSync(dir)) return [];
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const summaries: SessionSummary[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const content = await readFile(join(dir, file), 'utf-8');
      const parsed = JSON.parse(content) as SessionFile;
      // Skip empty sessions (created but never used) so the list stays useful.
      if (!parsed.turns || parsed.turns.length === 0) continue;
      summaries.push({
        id: parsed.id,
        title: parsed.title,
        updatedAt: parsed.updatedAt,
        turnCount: parsed.turns.length,
      });
    } catch {
      // Ignore malformed files.
    }
  }

  summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return summaries;
}

/** The most recently updated non-empty session, or null if none exist. */
export async function latestSession(): Promise<SessionFile | null> {
  const summaries = await listSessions();
  const first = summaries[0];
  if (!first) return null;
  return loadSession(first.id);
}

import type Database from 'better-sqlite3'

export const MEMORY_STORE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS sessions (
    sessionId TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    runtimeId TEXT NOT NULL,
    branchName TEXT NOT NULL,
    worktreePath TEXT,
    taskDescription TEXT,
    startedAt INTEGER NOT NULL,
    endedAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId TEXT NOT NULL,
    sessionId TEXT NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_interactions_session ON interactions(sessionId);
  CREATE INDEX IF NOT EXISTS idx_interactions_timestamp ON interactions(timestamp);

  CREATE VIRTUAL TABLE IF NOT EXISTS interactions_fts USING fts5(
    text,
    content='interactions',
    content_rowid='id',
    tokenize='porter unicode61'
  );

  CREATE TRIGGER IF NOT EXISTS interactions_ai AFTER INSERT ON interactions BEGIN
    INSERT INTO interactions_fts(rowid, text) VALUES (new.id, new.text);
  END;

  CREATE TRIGGER IF NOT EXISTS interactions_ad AFTER DELETE ON interactions BEGIN
    INSERT INTO interactions_fts(interactions_fts, rowid, text) VALUES('delete', old.id, old.text);
  END;

  CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    sessionId TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    facts TEXT NOT NULL DEFAULT '[]',
    filesTouched TEXT NOT NULL DEFAULT '[]',
    createdAt INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_observations_session ON observations(sessionId);

  CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
    title,
    summary,
    facts,
    content='observations',
    content_rowid='rowid',
    tokenize='porter unicode61'
  );

  CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
    INSERT INTO observations_fts(rowid, title, summary, facts) VALUES (new.rowid, new.title, new.summary, new.facts);
  END;

  CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
    INSERT INTO observations_fts(observations_fts, rowid, title, summary, facts) VALUES('delete', old.rowid, old.title, old.summary, old.facts);
  END;

  CREATE TABLE IF NOT EXISTS session_summaries (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    sessionId TEXT NOT NULL,
    runtimeId TEXT NOT NULL,
    branchName TEXT NOT NULL,
    taskDescription TEXT NOT NULL,
    whatWasDone TEXT NOT NULL,
    whatWasLearned TEXT NOT NULL,
    decisionsMade TEXT NOT NULL DEFAULT '[]',
    filesChanged TEXT NOT NULL DEFAULT '[]',
    createdAt INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_summaries_session ON session_summaries(sessionId);

  CREATE VIRTUAL TABLE IF NOT EXISTS session_summaries_fts USING fts5(
    taskDescription,
    whatWasDone,
    whatWasLearned,
    content='session_summaries',
    content_rowid='rowid',
    tokenize='porter unicode61'
  );

  CREATE TRIGGER IF NOT EXISTS summaries_ai AFTER INSERT ON session_summaries BEGIN
    INSERT INTO session_summaries_fts(rowid, taskDescription, whatWasDone, whatWasLearned)
      VALUES (new.rowid, new.taskDescription, new.whatWasDone, new.whatWasLearned);
  END;

  CREATE TRIGGER IF NOT EXISTS summaries_ad AFTER DELETE ON session_summaries BEGIN
    INSERT INTO session_summaries_fts(session_summaries_fts, rowid, taskDescription, whatWasDone, whatWasLearned)
      VALUES('delete', old.rowid, old.taskDescription, old.whatWasDone, old.whatWasLearned);
  END;
`

const MEMORY_STORE_MIGRATIONS = [
  'ALTER TABLE sessions ADD COLUMN worktreePath TEXT',
  "ALTER TABLE observations ADD COLUMN narrative TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE observations ADD COLUMN concepts TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE interactions ADD COLUMN toolEvents TEXT NOT NULL DEFAULT '[]'",
]

export function applyMemoryStoreMigrations(db: Database.Database): void {
  for (const sql of MEMORY_STORE_MIGRATIONS) {
    try {
      db.exec(sql)
    } catch {
      // Column already exists on subsequent opens.
    }
  }
}

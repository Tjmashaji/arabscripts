// قاعدة بيانات SQLite المدمجة في Node (node:sqlite): ملف واحد، بلا خادم، يشترك فيه تطبيق الويب والعامل.
// وضع WAL يسمح بقراءات متزامنة مع كاتب واحد، وهذا يكفي لمنصة بهذا الحجم.
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { env } from "./env";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS channels (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  title TEXT NOT NULL,
  thumbnail TEXT,
  refresh_token_enc TEXT NOT NULL,
  scopes TEXT NOT NULL,
  connected_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  age TEXT NOT NULL,
  voice_mode TEXT NOT NULL,
  music TEXT NOT NULL,
  scenes TEXT NOT NULL DEFAULT '[]',
  youtube TEXT NOT NULL DEFAULT '{"title":"","description":"","tags":[]}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS projects_user ON projects(user_id, updated_at DESC);
-- الصوت منفصل عن المشاهد: العامل يكتبه دون أن يتعارض مع حفظ المحرر
CREATE TABLE IF NOT EXISTS scene_audio (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL,
  file TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  source TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (project_id, scene_id)
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  payload TEXT NOT NULL DEFAULT '{}',
  result TEXT,
  progress REAL,
  message TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  run_after INTEGER NOT NULL,
  locked_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_queue ON jobs(status, run_after);
CREATE INDEX IF NOT EXISTS jobs_project ON jobs(project_id, created_at DESC);
-- مهمة واحدة نشطة من كل نوع لكل مشروع (يمنع النقر المزدوج من إنشاء مهمتين)
CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_active ON jobs(project_id, kind) WHERE status IN ('queued', 'processing');
CREATE TABLE IF NOT EXISTS renders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file TEXT NOT NULL,
  thumb TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL,
  project_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  render_id TEXT NOT NULL REFERENCES renders(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  status TEXT NOT NULL,
  privacy TEXT NOT NULL,
  publish_at INTEGER,
  session_url TEXT,
  video_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  hits INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
);
`;

let db: DatabaseSync | undefined;

export function dataDir() {
  return path.resolve(env().DATA_DIR);
}

export function getDb() {
  if (db) return db;
  mkdirSync(dataDir(), { recursive: true });
  db = new DatabaseSync(path.join(dataDir(), "kids-shorts.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  return db;
}

type Params = SQLInputValue[];
export const q = {
  get<T>(sql: string, ...p: Params) {
    return getDb().prepare(sql).get(...p) as T | undefined;
  },
  all<T>(sql: string, ...p: Params) {
    return getDb().prepare(sql).all(...p) as T[];
  },
  run(sql: string, ...p: Params) {
    return getDb().prepare(sql).run(...p);
  },
};

export function tx<T>(fn: () => T): T {
  const d = getDb();
  d.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    d.exec("COMMIT");
    return out;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

export const now = () => Date.now();

// للاختبارات فقط
export function closeDb() {
  db?.close();
  db = undefined;
}

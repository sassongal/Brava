use rusqlite::{params, Connection, OptionalExtension, Result as SqliteResult};
use std::path::PathBuf;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};

use crate::engine::clipboard::ClipboardItem;
use crate::engine::snippets::Snippet;

/// SQLite database manager for persistent storage
pub struct Database {
    conn: Mutex<Connection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionJobRow {
    pub id: String,
    pub file_name: String,
    pub file_path: String,
    pub status: String,
    pub text: Option<String>,
    pub language: Option<String>,
    pub duration_seconds: Option<f64>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupData {
    pub clipboard_items: Vec<ClipboardItem>,
    pub snippets: Vec<Snippet>,
    pub transcription_jobs: Vec<TranscriptionJobRow>,
    pub settings_rows: Vec<(String, String)>,
}

impl Database {
    /// Open or create the database at the app data directory
    pub fn open(data_dir: &PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(data_dir).map_err(|e| format!("Failed to create data dir: {}", e))?;

        let db_path = data_dir.join("brava.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        conn.execute_batch("PRAGMA journal_mode=WAL;").ok();

        let db = Database {
            conn: Mutex::new(conn),
        };
        db.initialize_tables()?;
        Ok(db)
    }

    /// Create tables if they don't exist
    fn initialize_tables(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS clipboard_history (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                preview TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'text',
                hash TEXT NOT NULL,
                pinned INTEGER NOT NULL DEFAULT 0,
                favorite INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                accessed_at TEXT NOT NULL,
                access_count INTEGER NOT NULL DEFAULT 0,
                source_app TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_clipboard_created ON clipboard_history(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_clipboard_hash ON clipboard_history(hash);

            CREATE TABLE IF NOT EXISTS snippets (
                id TEXT PRIMARY KEY,
                trigger TEXT NOT NULL UNIQUE,
                content TEXT NOT NULL,
                description TEXT,
                folder TEXT,
                is_regex INTEGER NOT NULL DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1,
                use_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS prompt_library (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                prompt TEXT NOT NULL,
                category TEXT,
                use_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS transcription_jobs (
                id TEXT PRIMARY KEY,
                file_name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                status TEXT NOT NULL,
                text TEXT,
                language TEXT,
                duration_seconds REAL,
                error_message TEXT,
                created_at TEXT NOT NULL,
                completed_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_transcription_jobs_created ON transcription_jobs(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_transcription_jobs_status ON transcription_jobs(status);

            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TEXT NOT NULL
            );
            "
        ).map_err(|e| format!("Failed to create tables: {}", e))?;
        Self::apply_migrations(&conn)?;

        Ok(())
    }

    fn apply_migrations(conn: &Connection) -> Result<(), String> {
        Self::apply_migration(conn, 1, "clipboard_image_path", |conn| {
            if !Self::column_exists(conn, "clipboard_history", "image_path")? {
                conn.execute("ALTER TABLE clipboard_history ADD COLUMN image_path TEXT", [])
                    .map_err(|e| format!("Migration clipboard_image_path failed: {}", e))?;
            }
            Ok(())
        })?;
        Self::apply_migration(conn, 2, "snippets_folder", |conn| {
            if !Self::column_exists(conn, "snippets", "folder")? {
                conn.execute("ALTER TABLE snippets ADD COLUMN folder TEXT", [])
                    .map_err(|e| format!("Migration snippets_folder failed: {}", e))?;
            }
            Ok(())
        })?;
        Self::apply_migration(conn, 3, "snippets_is_regex", |conn| {
            if !Self::column_exists(conn, "snippets", "is_regex")? {
                conn.execute("ALTER TABLE snippets ADD COLUMN is_regex INTEGER NOT NULL DEFAULT 0", [])
                    .map_err(|e| format!("Migration snippets_is_regex failed: {}", e))?;
            }
            Ok(())
        })?;
        Self::apply_migration(conn, 4, "transcription_jobs", |conn| {
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS transcription_jobs (
                    id TEXT PRIMARY KEY,
                    file_name TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    status TEXT NOT NULL,
                    text TEXT,
                    language TEXT,
                    duration_seconds REAL,
                    error_message TEXT,
                    created_at TEXT NOT NULL,
                    completed_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_transcription_jobs_created ON transcription_jobs(created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_transcription_jobs_status ON transcription_jobs(status);",
            ).map_err(|e| format!("Migration transcription_jobs failed: {}", e))?;
            Ok(())
        })?;
        Ok(())
    }

    fn apply_migration<F>(conn: &Connection, version: i64, name: &str, action: F) -> Result<(), String>
    where
        F: FnOnce(&Connection) -> Result<(), String>,
    {
        let already: Option<i64> = conn
            .query_row(
                "SELECT version FROM schema_migrations WHERE version = ?1",
                params![version],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("Failed to query migration state: {}", e))?;
        if already.is_some() {
            return Ok(());
        }
        action(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?1, ?2, ?3)",
            params![version, name, chrono::Utc::now().to_rfc3339()],
        )
        .map_err(|e| format!("Failed to record migration {}: {}", version, e))?;
        Ok(())
    }

    fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info({})", table))
            .map_err(|e| format!("Failed to inspect table {}: {}", table, e))?;
        let columns = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| format!("Failed to read table info {}: {}", table, e))?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect table info {}: {}", table, e))?;
        Ok(columns.iter().any(|c| c == column))
    }

    // --- Clipboard History ---

    pub fn save_clipboard_item(&self, item: &ClipboardItem) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO clipboard_history
             (id, content, preview, category, hash, pinned, favorite, created_at, accessed_at, access_count, source_app, image_path)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                item.id,
                item.content,
                item.preview,
                serde_json::to_string(&item.category).unwrap_or_default(),
                item.hash,
                item.pinned as i32,
                item.favorite as i32,
                item.created_at.to_rfc3339(),
                item.accessed_at.to_rfc3339(),
                item.access_count,
                item.source_app,
                item.image_path,
            ],
        ).map_err(|e| format!("Failed to save clipboard item: {}", e))?;
        Ok(())
    }

    pub fn load_clipboard_history(&self, limit: usize) -> Result<Vec<ClipboardItem>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, content, preview, category, hash, pinned, favorite, created_at, accessed_at, access_count, source_app, image_path
             FROM clipboard_history ORDER BY created_at DESC LIMIT ?1"
        ).map_err(|e| format!("Failed to prepare query: {}", e))?;

        let items = stmt.query_map(params![limit as i64], |row| {
            let category_str: String = row.get(3)?;
            let category = serde_json::from_str(&category_str)
                .unwrap_or(crate::engine::clipboard::ClipboardCategory::Text);
            let created_str: String = row.get(7)?;
            let accessed_str: String = row.get(8)?;

            Ok(ClipboardItem {
                id: row.get(0)?,
                content: row.get(1)?,
                preview: row.get(2)?,
                category,
                hash: row.get(4)?,
                pinned: row.get::<_, i32>(5)? != 0,
                favorite: row.get::<_, i32>(6)? != 0,
                created_at: chrono::DateTime::parse_from_rfc3339(&created_str)
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .unwrap_or_else(|_| chrono::Utc::now()),
                accessed_at: chrono::DateTime::parse_from_rfc3339(&accessed_str)
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .unwrap_or_else(|_| chrono::Utc::now()),
                access_count: row.get::<_, u32>(9)?,
                source_app: row.get(10)?,
                image_path: row.get(11).ok(),
            })
        }).map_err(|e| format!("Failed to query clipboard: {}", e))?;

        items.collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect clipboard items: {}", e))
    }

    pub fn delete_clipboard_item(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM clipboard_history WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete: {}", e))?;
        Ok(())
    }

    pub fn clear_clipboard_history(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM clipboard_history WHERE pinned = 0", [])
            .map_err(|e| format!("Failed to clear history: {}", e))?;
        Ok(())
    }

    pub fn delete_clipboard_older_than_days(&self, days: u32) -> Result<usize, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let modifier = format!("-{} days", days);
        conn.execute(
            "DELETE FROM clipboard_history
             WHERE pinned = 0
             AND datetime(created_at) < datetime('now', ?1)",
            params![modifier],
        ).map_err(|e| format!("Failed to prune old clipboard items: {}", e))
    }

    // --- Snippets ---

    pub fn save_snippet(&self, snippet: &Snippet) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO snippets
             (id, trigger, content, description, folder, is_regex, enabled, use_count, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                snippet.id,
                snippet.trigger,
                snippet.content,
                snippet.description,
                snippet.folder,
                snippet.is_regex as i32,
                snippet.enabled as i32,
                snippet.use_count,
                snippet.created_at,
                snippet.updated_at,
            ],
        ).map_err(|e| format!("Failed to save snippet: {}", e))?;
        Ok(())
    }

    pub fn load_snippets(&self) -> Result<Vec<Snippet>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, trigger, content, description, enabled, use_count, created_at, updated_at
             , folder, is_regex
             FROM snippets ORDER BY trigger ASC"
        ).map_err(|e| format!("Failed to prepare: {}", e))?;

        let items = stmt.query_map([], |row| {
            Ok(Snippet {
                id: row.get(0)?,
                trigger: row.get(1)?,
                content: row.get(2)?,
                description: row.get(3)?,
                folder: row.get(8)?,
                is_regex: row.get::<_, i32>(9)? != 0,
                enabled: row.get::<_, i32>(4)? != 0,
                use_count: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        }).map_err(|e| format!("Failed to query snippets: {}", e))?;

        items.collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect snippets: {}", e))
    }

    pub fn delete_snippet(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM snippets WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete snippet: {}", e))?;
        Ok(())
    }

    // --- Settings ---

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")
            .map_err(|e| format!("Failed to prepare: {}", e))?;

        let result = stmt.query_row(params![key], |row| row.get(0));
        match result {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(format!("Failed to get setting: {}", e)),
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        ).map_err(|e| format!("Failed to set setting: {}", e))?;
        Ok(())
    }

    // --- Transcription Jobs ---

    pub fn insert_transcription_job(&self, id: &str, file_name: &str, file_path: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO transcription_jobs
             (id, file_name, file_path, status, created_at)
             VALUES (?1, ?2, ?3, 'queued', ?4)",
            params![id, file_name, file_path, chrono::Utc::now().to_rfc3339()],
        ).map_err(|e| format!("Failed to insert transcription job: {}", e))?;
        Ok(())
    }

    pub fn update_transcription_job_status(&self, id: &str, status: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE transcription_jobs SET status = ?1 WHERE id = ?2",
            params![status, id],
        ).map_err(|e| format!("Failed to update transcription status: {}", e))?;
        Ok(())
    }

    pub fn complete_transcription_job(
        &self,
        id: &str,
        text: &str,
        language: &str,
        duration_seconds: Option<f64>,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE transcription_jobs
             SET status = 'completed', text = ?1, language = ?2, duration_seconds = ?3, error_message = NULL, completed_at = ?4
             WHERE id = ?5",
            params![text, language, duration_seconds, chrono::Utc::now().to_rfc3339(), id],
        ).map_err(|e| format!("Failed to mark transcription complete: {}", e))?;
        Ok(())
    }

    pub fn fail_transcription_job(&self, id: &str, error_message: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE transcription_jobs
             SET status = 'failed', error_message = ?1, completed_at = ?2
             WHERE id = ?3",
            params![error_message, chrono::Utc::now().to_rfc3339(), id],
        ).map_err(|e| format!("Failed to mark transcription failed: {}", e))?;
        Ok(())
    }

    pub fn list_transcription_jobs(&self, limit: usize, offset: usize) -> Result<Vec<TranscriptionJobRow>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, file_name, file_path, status, text, language, duration_seconds, error_message, created_at, completed_at
             FROM transcription_jobs
             ORDER BY created_at DESC
             LIMIT ?1 OFFSET ?2"
        ).map_err(|e| format!("Failed to prepare transcription list query: {}", e))?;

        let rows = stmt.query_map(params![limit as i64, offset as i64], |row| {
            Ok(TranscriptionJobRow {
                id: row.get(0)?,
                file_name: row.get(1)?,
                file_path: row.get(2)?,
                status: row.get(3)?,
                text: row.get(4)?,
                language: row.get(5)?,
                duration_seconds: row.get(6)?,
                error_message: row.get(7)?,
                created_at: row.get(8)?,
                completed_at: row.get(9)?,
            })
        }).map_err(|e| format!("Failed to query transcription jobs: {}", e))?;

        rows.collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect transcription jobs: {}", e))
    }

    pub fn mark_stale_processing_jobs_failed(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE transcription_jobs
             SET status = 'failed',
                 error_message = COALESCE(error_message, 'Interrupted by app restart'),
                 completed_at = ?1
             WHERE status = 'processing'",
            params![chrono::Utc::now().to_rfc3339()],
        ).map_err(|e| format!("Failed to recover stale transcription jobs: {}", e))?;
        Ok(())
    }

    // --- Prompt Library ---

    pub fn save_prompt(&self, id: &str, title: &str, prompt: &str, category: Option<&str>) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR REPLACE INTO prompt_library (id, title, prompt, category, use_count, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, COALESCE((SELECT use_count FROM prompt_library WHERE id = ?1), 0), COALESCE((SELECT created_at FROM prompt_library WHERE id = ?1), ?5), ?5)",
            params![id, title, prompt, category, now],
        ).map_err(|e| format!("Failed to save prompt: {}", e))?;
        Ok(())
    }

    pub fn load_prompts(&self) -> Result<Vec<(String, String, String, Option<String>, u32)>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, title, prompt, category, use_count FROM prompt_library ORDER BY use_count DESC, updated_at DESC"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, Option<String>>(3)?, row.get::<_, u32>(4)?))
        }).map_err(|e| e.to_string())?;
        rows.collect::<SqliteResult<Vec<_>>>().map_err(|e| e.to_string())
    }

    pub fn delete_prompt(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM prompt_library WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn increment_prompt_usage(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute("UPDATE prompt_library SET use_count = use_count + 1, updated_at = ?2 WHERE id = ?1", params![id, now]).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn export_backup_data(&self) -> Result<BackupData, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let mut clipboard_stmt = conn.prepare(
            "SELECT id, content, preview, category, hash, pinned, favorite, created_at, accessed_at, access_count, source_app, image_path
             FROM clipboard_history ORDER BY created_at DESC"
        ).map_err(|e| format!("Failed to prepare clipboard export: {}", e))?;
        let clipboard_items = clipboard_stmt
            .query_map([], |row| {
                let category_str: String = row.get(3)?;
                let category = serde_json::from_str(&category_str)
                    .unwrap_or(crate::engine::clipboard::ClipboardCategory::Text);
                let created_str: String = row.get(7)?;
                let accessed_str: String = row.get(8)?;
                Ok(ClipboardItem {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    preview: row.get(2)?,
                    category,
                    hash: row.get(4)?,
                    pinned: row.get::<_, i32>(5)? != 0,
                    favorite: row.get::<_, i32>(6)? != 0,
                    created_at: chrono::DateTime::parse_from_rfc3339(&created_str)
                        .map(|dt| dt.with_timezone(&chrono::Utc))
                        .unwrap_or_else(|_| chrono::Utc::now()),
                    accessed_at: chrono::DateTime::parse_from_rfc3339(&accessed_str)
                        .map(|dt| dt.with_timezone(&chrono::Utc))
                        .unwrap_or_else(|_| chrono::Utc::now()),
                    access_count: row.get::<_, u32>(9)?,
                    source_app: row.get(10)?,
                    image_path: row.get(11)?,
                })
            })
            .map_err(|e| format!("Failed to query clipboard export: {}", e))?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect clipboard export: {}", e))?;

        let snippets = self.load_snippets()?;
        let transcription_jobs = self.list_transcription_jobs(100_000, 0)?;

        let mut settings_stmt = conn
            .prepare("SELECT key, value FROM settings ORDER BY key ASC")
            .map_err(|e| format!("Failed to prepare settings export: {}", e))?;
        let settings_rows = settings_stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| format!("Failed to query settings export: {}", e))?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| format!("Failed to collect settings export: {}", e))?;

        Ok(BackupData {
            clipboard_items,
            snippets,
            transcription_jobs,
            settings_rows,
        })
    }

    pub fn import_backup_data(&self, data: BackupData) -> Result<(), String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| format!("Failed to start transaction: {}", e))?;

        tx.execute("DELETE FROM clipboard_history", [])
            .map_err(|e| format!("Failed to clear clipboard_history: {}", e))?;
        tx.execute("DELETE FROM snippets", [])
            .map_err(|e| format!("Failed to clear snippets: {}", e))?;
        tx.execute("DELETE FROM transcription_jobs", [])
            .map_err(|e| format!("Failed to clear transcription_jobs: {}", e))?;
        tx.execute("DELETE FROM settings", [])
            .map_err(|e| format!("Failed to clear settings: {}", e))?;

        for item in data.clipboard_items {
            tx.execute(
                "INSERT INTO clipboard_history
                 (id, content, preview, category, hash, pinned, favorite, created_at, accessed_at, access_count, source_app, image_path)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    item.id,
                    item.content,
                    item.preview,
                    serde_json::to_string(&item.category).unwrap_or_else(|_| "\"text\"".to_string()),
                    item.hash,
                    item.pinned as i32,
                    item.favorite as i32,
                    item.created_at.to_rfc3339(),
                    item.accessed_at.to_rfc3339(),
                    item.access_count,
                    item.source_app,
                    item.image_path,
                ],
            ).map_err(|e| format!("Failed to restore clipboard item: {}", e))?;
        }

        for snippet in data.snippets {
            tx.execute(
                "INSERT INTO snippets
                 (id, trigger, content, description, folder, is_regex, enabled, use_count, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    snippet.id,
                    snippet.trigger,
                    snippet.content,
                    snippet.description,
                    snippet.folder,
                    snippet.is_regex as i32,
                    snippet.enabled as i32,
                    snippet.use_count,
                    snippet.created_at,
                    snippet.updated_at,
                ],
            ).map_err(|e| format!("Failed to restore snippet: {}", e))?;
        }

        for job in data.transcription_jobs {
            tx.execute(
                "INSERT INTO transcription_jobs
                 (id, file_name, file_path, status, text, language, duration_seconds, error_message, created_at, completed_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    job.id,
                    job.file_name,
                    job.file_path,
                    job.status,
                    job.text,
                    job.language,
                    job.duration_seconds,
                    job.error_message,
                    job.created_at,
                    job.completed_at,
                ],
            ).map_err(|e| format!("Failed to restore transcription job: {}", e))?;
        }

        for (key, value) in data.settings_rows {
            tx.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)",
                params![key, value],
            ).map_err(|e| format!("Failed to restore settings row: {}", e))?;
        }

        tx.commit().map_err(|e| format!("Failed to commit restore: {}", e))?;
        Ok(())
    }
}

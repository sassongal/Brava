use rusqlite::{params, Connection, Result as SqliteResult};
use std::path::PathBuf;
use std::sync::Mutex;

use crate::engine::clipboard::ClipboardItem;
use crate::engine::snippets::Snippet;

/// SQLite database manager for persistent storage
pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    /// Open or create the database at the app data directory
    pub fn open(data_dir: &PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(data_dir).map_err(|e| format!("Failed to create data dir: {}", e))?;

        let db_path = data_dir.join("brava.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

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
            "
        ).map_err(|e| format!("Failed to create tables: {}", e))?;

        Ok(())
    }

    // --- Clipboard History ---

    pub fn save_clipboard_item(&self, item: &ClipboardItem) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO clipboard_history
             (id, content, preview, category, hash, pinned, favorite, created_at, accessed_at, access_count, source_app)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
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
            ],
        ).map_err(|e| format!("Failed to save clipboard item: {}", e))?;
        Ok(())
    }

    pub fn load_clipboard_history(&self, limit: usize) -> Result<Vec<ClipboardItem>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, content, preview, category, hash, pinned, favorite, created_at, accessed_at, access_count, source_app
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

    // --- Snippets ---

    pub fn save_snippet(&self, snippet: &Snippet) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO snippets
             (id, trigger, content, description, enabled, use_count, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                snippet.id,
                snippet.trigger,
                snippet.content,
                snippet.description,
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
             FROM snippets ORDER BY trigger ASC"
        ).map_err(|e| format!("Failed to prepare: {}", e))?;

        let items = stmt.query_map([], |row| {
            Ok(Snippet {
                id: row.get(0)?,
                trigger: row.get(1)?,
                content: row.get(2)?,
                description: row.get(3)?,
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
}

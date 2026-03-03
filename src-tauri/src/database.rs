use rusqlite::{Connection, Result as SqliteResult, params};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tracing::{info, error, debug, instrument, warn};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Account {
    pub id: i64,
    pub namespace: String,
    pub account_name: String,
    #[serde(skip)]
    pub secret_key: String,
    pub algorithm: String,
    pub digits: i32,
    pub period: i32,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NamespaceInfo {
    pub namespace: String,
    pub count: i64,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    #[instrument]
    pub fn new(app_handle: &AppHandle) -> SqliteResult<Self> {
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .expect("Failed to get app data dir");

        // Create app data directory if it doesn't exist
        std::fs::create_dir_all(&app_dir).expect("Failed to create app data dir");

        let db_path = app_dir.join("auth2fa.db");
        let conn = Connection::open(&db_path)?;

        let db = Database { conn };
        db.init_tables()?;

        info!(db_path = %db_path.display(), "Database initialized");

        Ok(db)
    }

    fn init_tables(&self) -> SqliteResult<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                namespace TEXT NOT NULL DEFAULT 'DEFAULT',
                account_name TEXT NOT NULL,
                secret_key TEXT NOT NULL,
                algorithm TEXT DEFAULT 'SHA1',
                digits INTEGER DEFAULT 6,
                period INTEGER DEFAULT 30,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(namespace, account_name)
            )",
            [],
        )?;

        // Create search indexes
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_accounts_namespace ON accounts(namespace)",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_accounts_search ON accounts(account_name)",
            [],
        )?;

        Ok(())
    }

    pub fn create_account(
        &self,
        namespace: &str,
        account_name: &str,
        secret_key: &str,
        algorithm: Option<&str>,
        digits: Option<i32>,
        period: Option<i32>,
    ) -> SqliteResult<i64> {
        let algorithm = algorithm.unwrap_or("SHA1");
        let digits = digits.unwrap_or(6);
        let period = period.unwrap_or(30);

        debug!(
            namespace = %namespace,
            account_name = %account_name,
            algorithm = %algorithm,
            "Creating account"
        );

        // Check if account already exists
        let mut stmt = self.conn.prepare(
            "SELECT id FROM accounts WHERE namespace = ?1 AND account_name = ?2"
        )?;

        let exists = stmt.exists(params![namespace, account_name])?;
        if exists {
            error!(
                namespace = %namespace,
                account_name = %account_name,
                "Account already exists"
            );
            return Err(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CONSTRAINT),
                Some("Account with this namespace and name already exists".to_string())
            ));
        }

        self.conn.execute(
            "INSERT INTO accounts (namespace, account_name, secret_key, algorithm, digits, period)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![namespace, account_name, secret_key, algorithm, digits, period],
        )?;

        let id = self.conn.last_insert_rowid();
        info!(
            account_id = id,
            namespace = %namespace,
            account_name = %account_name,
            "Account created successfully"
        );

        Ok(id)
    }

    pub fn list_accounts(&self, namespace: Option<&str>) -> SqliteResult<Vec<Account>> {
        let mut accounts = Vec::new();

        if let Some(ns) = namespace {
            let mut stmt = self.conn.prepare(
                "SELECT id, namespace, account_name, secret_key, algorithm, digits, period, created_at
                 FROM accounts WHERE namespace = ?1 ORDER BY namespace, account_name"
            )?;

            let accounts_iter = stmt.query_map(params![ns], |row| {
                Ok(Account {
                    id: row.get(0)?,
                    namespace: row.get(1)?,
                    account_name: row.get(2)?,
                    secret_key: row.get(3)?,
                    algorithm: row.get(4)?,
                    digits: row.get(5)?,
                    period: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })?;

            for account in accounts_iter {
                accounts.push(account?);
            }
        } else {
            let mut stmt = self.conn.prepare(
                "SELECT id, namespace, account_name, secret_key, algorithm, digits, period, created_at
                 FROM accounts ORDER BY namespace, account_name"
            )?;

            let accounts_iter = stmt.query_map([], |row| {
                Ok(Account {
                    id: row.get(0)?,
                    namespace: row.get(1)?,
                    account_name: row.get(2)?,
                    secret_key: row.get(3)?,
                    algorithm: row.get(4)?,
                    digits: row.get(5)?,
                    period: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })?;

            for account in accounts_iter {
                accounts.push(account?);
            }
        }

        Ok(accounts)
    }

    pub fn get_account(&self, id: i64) -> SqliteResult<Option<Account>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, namespace, account_name, secret_key, algorithm, digits, period, created_at
             FROM accounts WHERE id = ?1"
        )?;

        let mut iter = stmt.query_map(params![id], |row| {
            Ok(Account {
                id: row.get(0)?,
                namespace: row.get(1)?,
                account_name: row.get(2)?,
                secret_key: row.get(3)?,
                algorithm: row.get(4)?,
                digits: row.get(5)?,
                period: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;

        match iter.next() {
            Some(account) => Ok(Some(account?)),
            None => Ok(None),
        }
    }

    pub fn delete_account(&self, id: i64) -> SqliteResult<()> {
        info!(account_id = id, "Deleting account");

        let rows_affected = self.conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])?;

        if rows_affected == 0 {
            warn!(account_id = id, "No account found to delete");
        } else {
            info!(account_id = id, "Account deleted successfully");
        }

        Ok(())
    }

    pub fn search_accounts(&self, query: &str) -> SqliteResult<Vec<Account>> {
        let search_pattern = format!("%{}%", query);

        let mut stmt = self.conn.prepare(
            "SELECT id, namespace, account_name, secret_key, algorithm, digits, period, created_at
             FROM accounts
             WHERE account_name LIKE ?1
             ORDER BY namespace, account_name"
        )?;

        let accounts_iter = stmt.query_map(params![search_pattern], |row| {
            Ok(Account {
                id: row.get(0)?,
                namespace: row.get(1)?,
                account_name: row.get(2)?,
                secret_key: row.get(3)?,
                algorithm: row.get(4)?,
                digits: row.get(5)?,
                period: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;

        let mut accounts = Vec::new();
        for account in accounts_iter {
            accounts.push(account?);
        }

        Ok(accounts)
    }

    pub fn list_namespaces(&self) -> SqliteResult<Vec<NamespaceInfo>> {
        let mut stmt = self.conn.prepare(
            "SELECT namespace, COUNT(*) as count
             FROM accounts
             GROUP BY namespace
             ORDER BY namespace"
        )?;

        let namespaces_iter = stmt.query_map([], |row| {
            Ok(NamespaceInfo {
                namespace: row.get(0)?,
                count: row.get(1)?,
            })
        })?;

        let mut namespaces = Vec::new();
        for ns in namespaces_iter {
            namespaces.push(ns?);
        }

        Ok(namespaces)
    }
}

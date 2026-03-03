use crate::database::{Database, NamespaceInfo};
use crate::totp::generate_totp;
use crate::otpauth::parse_clipboard_content;
use crate::logging::mask_secret;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tracing::{info, error, debug, instrument, warn};

// ============== Response Structs ==============

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TotpResponse {
    pub code: String,
    pub remaining_seconds: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkTotpItem {
    pub account_id: i64,
    pub code: String,
    pub remaining_seconds: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddAccountResponse {
    pub id: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BulkImportResponse {
    pub ids: Vec<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountDisplay {
    pub id: i64,
    pub namespace: String,
    pub account_name: String,
    pub algorithm: String,
    pub digits: i32,
    pub period: i32,
    pub created_at: String,
}

// ============== Validation ==============

/// Validate account data
/// Returns Ok(()) if valid, Err(error_message) if invalid
fn validate_account_data(
    namespace: &str,
    account_name: &str,
    secret_key: &str,
    algorithm: Option<&String>,
    digits: Option<i32>,
    period: Option<i32>,
) -> Result<(), String> {
    // Validate namespace
    let namespace = namespace.trim();
    if namespace.is_empty() {
        return Err("命名空间不能为空".to_string());
    }

    // Validate account name
    let account_name = account_name.trim();
    if account_name.is_empty() {
        return Err("账号名不能为空".to_string());
    }

    // Validate secret key
    let secret_key = secret_key.trim().to_uppercase();
    if secret_key.is_empty() {
        return Err("密钥不能为空".to_string());
    }

    // Base32 validation: only A-Z, 2-7, and = are allowed
    // Must be at least 8 characters (minimum for useful OTP)
    if secret_key.len() < 8 {
        return Err("密钥长度不能少于8位".to_string());
    }

    if !secret_key.chars().all(|c| c.is_ascii_alphanumeric() || c == '=') {
        return Err("密钥格式无效：只能包含字母、数字和等号".to_string());
    }

    // Check for valid Base32 characters (A-Z, 2-7)
    let valid_base32_chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567=";
    if !secret_key.chars().all(|c| valid_base32_chars.contains(c)) {
        return Err("密钥格式无效：必须是有效的 Base32 字符 (A-Z, 2-7, =)".to_string());
    }

    // Validate algorithm
    if let Some(algo) = algorithm {
        let algo = algo.trim().to_uppercase();
        match algo.as_str() {
            "SHA1" | "SHA256" | "SHA512" => {}
            _ => return Err("算法必须是 SHA1、SHA256 或 SHA512".to_string()),
        }
    }

    // Validate digits
    if let Some(d) = digits {
        if d != 6 && d != 8 {
            return Err("位数必须是 6 或 8".to_string());
        }
    }

    // Validate period
    if let Some(p) = period {
        if p != 30 && p != 60 {
            return Err("周期必须是 30 或 60".to_string());
        }
    }

    Ok(())
}

// ============== State ==============
pub struct AppState {
    pub db: Mutex<Option<Database>>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            db: Mutex::new(None),
        }
    }

    pub fn init(&self, app_handle: &AppHandle) -> Result<(), String> {
        let db = Database::new(app_handle).map_err(|e| format!("Database error: {}", e))?;
        *self.db.lock().unwrap() = Some(db);
        Ok(())
    }

    fn with_db<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&Database) -> Result<R, String>,
    {
        let db = self.db.lock().unwrap();
        let db_ref = db
            .as_ref()
            .ok_or("Database not initialized".to_string())?;
        f(db_ref)
    }
}

#[tauri::command]
pub fn get_namespaces(state: tauri::State<AppState>) -> Result<Vec<NamespaceInfo>, String> {
    state.with_db(|db| {
        db.list_namespaces()
            .map_err(|e| format!("Failed to list namespaces: {}", e))
    })
}

#[tauri::command]
pub fn get_accounts(
    state: tauri::State<AppState>,
    namespace: Option<String>,
) -> Result<Vec<AccountDisplay>, String> {
    state.with_db(|db| {
        let accounts = db
            .list_accounts(namespace.as_deref())
            .map_err(|e| format!("Failed to list accounts: {}", e))?;

        let display_accounts: Vec<AccountDisplay> = accounts
            .into_iter()
            .map(|acc| AccountDisplay {
                id: acc.id,
                namespace: acc.namespace,
                account_name: acc.account_name,
                algorithm: acc.algorithm,
                digits: acc.digits,
                period: acc.period,
                created_at: acc.created_at,
            })
            .collect();

        Ok(display_accounts)
    })
}

#[tauri::command]
#[instrument(skip(state, req), fields(
    namespace = %req.namespace,
    account_name = %req.account_name,
    secret_key = %mask_secret(&req.secret_key)
))]
pub fn add_account(
    state: tauri::State<AppState>,
    req: AddAccountRequest,
) -> Result<AddAccountResponse, String> {
    info!("add_account called");

    // Validate all account data
    validate_account_data(
        &req.namespace,
        &req.account_name,
        &req.secret_key,
        req.algorithm.as_ref(),
        req.digits,
        req.period,
    )?;

    let secret_key = req.secret_key.trim().to_uppercase();

    let id = state.with_db(|db| {
        db.create_account(
            &req.namespace,
            &req.account_name,
            &secret_key,
            req.algorithm.as_deref(),
            req.digits,
            req.period,
        )
        .map_err(|e| {
            error!("Failed to create account: {}", e);
            format!("Failed to add account: {}", e)
        })
    })?;

    info!(
        account_id = id,
        namespace = %req.namespace,
        account_name = %req.account_name,
        "Account added successfully"
    );

    Ok(AddAccountResponse { id })
}

#[tauri::command]
#[instrument(skip(state), fields(account_id = id))]
pub fn delete_account(
    state: tauri::State<AppState>,
    id: i64,
) -> Result<(), String> {
    info!("delete_account called");

    state.with_db(|db| {
        db.delete_account(id)
            .map_err(|e| {
                error!("Failed to delete account: {}", e);
                format!("Failed to delete account: {}", e)
            })
    })?;

    info!(account_id = id, "Account deleted successfully");
    Ok(())
}

#[tauri::command]
pub fn search_accounts(
    state: tauri::State<AppState>,
    query: String,
) -> Result<Vec<AccountDisplay>, String> {
    state.with_db(|db| {
        let accounts = db
            .search_accounts(&query)
            .map_err(|e| format!("Failed to search accounts: {}", e))?;

        let display_accounts: Vec<AccountDisplay> = accounts
            .into_iter()
            .map(|acc| AccountDisplay {
                id: acc.id,
                namespace: acc.namespace,
                account_name: acc.account_name,
                algorithm: acc.algorithm,
                digits: acc.digits,
                period: acc.period,
                created_at: acc.created_at,
            })
            .collect();

        Ok(display_accounts)
    })
}

#[tauri::command]
#[instrument(skip(state), fields(account_id))]
pub fn get_totp_code(
    state: tauri::State<AppState>,
    account_id: i64,
) -> Result<TotpResponse, String> {
    debug!("get_totp_code called");

    state.with_db(|db| {
        let account = db
            .get_account(account_id)
            .map_err(|e| {
                error!("Failed to get account: {}", e);
                format!("Failed to get account: {}", e)
            })?
            .ok_or({
                warn!("Account not found");
                "Account not found".to_string()
            })?;

        debug!(
            account_id = account_id,
            namespace = %account.namespace,
            account_name = %account.account_name,
            "Generating TOTP code"
        );

        let totp_code = generate_totp(
            &account.secret_key,
            account.digits as u32,
            account.period as u64,
            &account.algorithm,
        )?;

        debug!(
            account_id = account_id,
            remaining_seconds = totp_code.remaining_seconds,
            "TOTP code generated successfully"
        );

        Ok(TotpResponse {
            code: totp_code.code,
            remaining_seconds: totp_code.remaining_seconds,
        })
    })
}

#[tauri::command]
#[instrument(skip(state, req), fields(account_count = req.account_ids.len()))]
pub fn get_bulk_totp_codes(
    state: tauri::State<AppState>,
    req: GetBulkTotpCodesRequest,
) -> Result<Vec<BulkTotpItem>, String> {
    debug!("get_bulk_totp_codes called");

    let requested_count = req.account_ids.len();

    state.with_db(|db| {
        let mut results = Vec::new();

        for account_id in req.account_ids {
            if let Ok(Some(account)) = db.get_account(account_id) {
                if let Ok(totp_code) = generate_totp(
                    &account.secret_key,
                    account.digits as u32,
                    account.period as u64,
                    &account.algorithm,
                ) {
                    results.push(BulkTotpItem {
                        account_id,
                        code: totp_code.code,
                        remaining_seconds: totp_code.remaining_seconds,
                    });
                }
            }
        }

        debug!(
            requested = requested_count,
            generated = results.len(),
            "Bulk TOTP codes generated"
        );

        Ok(results)
    })
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedAccountData {
    pub namespace: String,
    pub account_name: String,
    pub secret_key: String,
    pub algorithm: Option<String>,
    pub digits: Option<i32>,
    pub period: Option<i32>,
}

// Request struct for get_bulk_totp_codes command
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetBulkTotpCodesRequest {
    pub account_ids: Vec<i64>,
}

// Request struct for add_account command
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddAccountRequest {
    pub namespace: String,
    pub account_name: String,
    pub secret_key: String,
    pub algorithm: Option<String>,
    pub digits: Option<i32>,
    pub period: Option<i32>,
}

// Parse clipboard content (single entry)
#[tauri::command]
#[instrument(skip(app_handle))]
pub fn parse_clipboard(
    app_handle: AppHandle,
) -> Result<ParsedAccountData, String> {
    info!("parse_clipboard called");

    use tauri_plugin_clipboard_manager::ClipboardExt;

    let clipboard_text = app_handle
        .clipboard()
        .read_text()
        .map_err(|e| {
            error!("Failed to read clipboard: {}", e);
            format!("Failed to read clipboard: {}", e)
        })?;

    if clipboard_text.is_empty() {
        warn!("Clipboard is empty");
        return Err("剪贴板为空".to_string());
    }

    debug!("Parsing clipboard content");
    let parsed = parse_clipboard_content(&clipboard_text)?;

    // Validate the parsed data
    validate_account_data(
        &parsed.namespace,
        &parsed.account_name,
        &parsed.secret_key,
        parsed.algorithm.as_ref(),
        parsed.digits,
        parsed.period,
    )?;

    info!(
        namespace = %parsed.namespace,
        account_name = %parsed.account_name,
        secret_key = %mask_secret(&parsed.secret_key),
        "Clipboard parsed successfully"
    );

    Ok(ParsedAccountData {
        namespace: parsed.namespace,
        account_name: parsed.account_name,
        secret_key: parsed.secret_key,
        algorithm: parsed.algorithm,
        digits: parsed.digits,
        period: parsed.period,
    })
}

// Parse and import multiple accounts from clipboard (bulk import)
#[tauri::command]
pub fn parse_bulk_clipboard(
    app_handle: AppHandle,
) -> Result<Vec<ParsedAccountData>, String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;

    let clipboard_text = app_handle
        .clipboard()
        .read_text()
        .map_err(|e| format!("Failed to read clipboard: {}", e))?;

    if clipboard_text.is_empty() {
        return Err("剪贴板为空".to_string());
    }

    // Try to parse as bulk (lines separated by newline)
    let mut results = Vec::new();
    let mut first_error: Option<String> = None;

    for (index, line) in clipboard_text.lines().enumerate() {
        let line: &str = line.trim();
        if line.is_empty() {
            continue;
        }

        match parse_clipboard_content(line) {
            Ok(parsed) => {
                // Validate the parsed data
                let validation_result = validate_account_data(
                    &parsed.namespace,
                    &parsed.account_name,
                    &parsed.secret_key,
                    parsed.algorithm.as_ref(),
                    parsed.digits,
                    parsed.period,
                );

                if let Err(e) = validation_result {
                    // Store only the first error
                    if first_error.is_none() {
                        first_error = Some(format!("第 {} 项: {}", index + 1, e));
                    }
                    // Continue parsing other items even if this one fails
                } else {
                    results.push(ParsedAccountData {
                        namespace: parsed.namespace,
                        account_name: parsed.account_name,
                        secret_key: parsed.secret_key,
                        algorithm: parsed.algorithm,
                        digits: parsed.digits,
                        period: parsed.period,
                    });
                }
            }
            Err(_) => {
                // If parsing fails and we have no valid results yet, return error
                if results.is_empty() && first_error.is_none() {
                    return Err(format!("无法解析剪贴板内容。请确保每行是有效的 otpauth:// URL 或 Base32 密钥。"));
                }
                // Continue with already parsed items
            }
        }
    }

    // Return first validation error if no valid items were parsed
    if results.is_empty() {
        if let Some(e) = first_error {
            Err(e)
        } else {
            Err("无法识别任何有效的 2FA 数据".to_string())
        }
    } else {
        Ok(results)
    }
}

// Bulk import accounts directly
#[tauri::command]
#[instrument(skip(state, accounts), fields(total_accounts = accounts.len()))]
pub fn bulk_import_accounts(
    state: State<'_, AppState>,
    accounts: Vec<ParsedAccountData>,
) -> Result<BulkImportResponse, String> {
    info!("bulk_import_accounts called");

    let mut imported_ids = Vec::new();
    let mut success_count = 0;
    let failed_count = 0;

    for (index, account_data) in accounts.iter().enumerate() {
        // Validate account data (only show first error)
        if let Err(e) = validate_account_data(
            &account_data.namespace,
            &account_data.account_name,
            &account_data.secret_key,
            account_data.algorithm.as_ref(),
            account_data.digits,
            account_data.period,
        ) {
            error!(
                index = index,
                namespace = %account_data.namespace,
                account_name = %account_data.account_name,
                error = %e,
                "Account validation failed"
            );

            return Err(if index == 0 {
                e
            } else {
                format!("第 {} 项: {}", index + 1, e)
            });
        }

        match state.with_db(|db| -> Result<i64, String> {
            db.create_account(
                &account_data.namespace,
                &account_data.account_name,
                &account_data.secret_key,
                account_data.algorithm.as_deref(),
                account_data.digits,
                account_data.period,
            )
            .map_err(|e| format!("Failed to create account: {}", e))
        }) {
            Ok(id) => {
                imported_ids.push(id);
                success_count += 1;
                debug!(
                    index = index,
                    account_id = id,
                    namespace = %account_data.namespace,
                    account_name = %account_data.account_name,
                    "Account imported successfully"
                );
            }
            Err(e) => {
                error!(
                    index = index,
                    namespace = %account_data.namespace,
                    account_name = %account_data.account_name,
                    error = %e,
                    "Failed to import account"
                );
                return Err(e);
            }
        }
    }

    info!(
        total = accounts.len(),
        success = success_count,
        failed = failed_count,
        "Bulk import completed"
    );

    Ok(BulkImportResponse { ids: imported_ids })
}

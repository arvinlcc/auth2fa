// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod database;
mod totp;
mod otpauth;
mod logging;

use commands::{AppState, get_namespaces, get_accounts, add_account, delete_account, search_accounts, get_totp_code, get_bulk_totp_codes, parse_clipboard, parse_bulk_clipboard, bulk_import_accounts};
use tauri::Manager;
use std::sync::Mutex;
use tracing_appender::non_blocking::WorkerGuard;

// Log guard wrapper to keep it alive for the app lifetime
#[allow(dead_code)]
struct LogGuard(Mutex<Option<WorkerGuard>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // Initialize logging system (must be before other operations)
            // The guard must be kept alive for the entire app lifetime
            let _log_guard = logging::init_logging(app.handle());
            app.manage(LogGuard(Mutex::new(Some(_log_guard))));

            tracing::info!("Application starting up");

            // Initialize database
            let state = app.state::<AppState>();
            state.init(app.handle())?;

            tracing::info!("Application initialized successfully");
            Ok(())
        })
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            get_namespaces,
            get_accounts,
            add_account,
            delete_account,
            search_accounts,
            get_totp_code,
            get_bulk_totp_codes,
            parse_clipboard,
            parse_bulk_clipboard,
            bulk_import_accounts
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

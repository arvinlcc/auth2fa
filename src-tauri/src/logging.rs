use tracing_subscriber::{
    fmt::{self, format::FmtSpan},
    layer::SubscriberExt,
    util::SubscriberInitExt,
    Layer, EnvFilter, Registry,
};
use tracing_appender::{non_blocking, rolling};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Log file directory
pub fn log_dir(app_handle: &AppHandle) -> PathBuf {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");

    let log_dir = app_data_dir.join("logs");
    std::fs::create_dir_all(&log_dir).expect("Failed to create log directory");
    log_dir
}

/// Initialize logging system
///
/// IMPORTANT: The returned guard must be kept alive for the entire application lifetime,
/// otherwise the file logging will stop working.
pub fn init_logging(app_handle: &AppHandle) -> tracing_appender::non_blocking::WorkerGuard {
    let log_directory = log_dir(app_handle);

    // Create log file appender (rotates daily)
    let file_appender = rolling::daily(log_directory.clone(), "auth2fa.log");
    let (non_blocking_file, guard) = non_blocking(file_appender);

    // Read log level from environment variable, default to info
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    // Console output (with colors)
    let console_layer = fmt::layer()
        .with_span_events(FmtSpan::CLOSE)
        .with_target(true)
        .with_thread_ids(false)
        .with_filter(env_filter.clone());

    // File output (JSON format for structured logging)
    let file_layer = fmt::layer()
        .json()
        .with_span_events(FmtSpan::CLOSE)
        .with_writer(non_blocking_file)
        .with_filter(env_filter);

    // Initialize global subscriber
    Registry::default()
        .with(console_layer)
        .with(file_layer)
        .init();

    tracing::info!(
        log_dir = %log_directory.display(),
        "Logging system initialized"
    );

    guard
}

/// Mask sensitive information (secret keys)
///
/// Shows first 4 and last 4 characters for debugging while hiding the middle
pub fn mask_secret(secret: &str) -> String {
    if secret.len() <= 8 {
        return "***".to_string();
    }
    format!("{}***{}", &secret[..4], &secret[secret.len()-4..])
}

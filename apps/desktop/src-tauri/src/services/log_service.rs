use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

const MAX_LOGS: usize = 2000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub timestamp_ms: u128,
    pub level: String,
    pub source: String,
    pub message: String,
    pub command: Option<String>,
    pub success: Option<bool>,
    pub duration_ms: Option<u128>,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
}

static LOGS: OnceLock<Mutex<Vec<LogEntry>>> = OnceLock::new();

fn store() -> &'static Mutex<Vec<LogEntry>> {
    LOGS.get_or_init(|| Mutex::new(Vec::new()))
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

pub fn push(mut entry: LogEntry) {
    entry.timestamp_ms = now_ms();

    if let Ok(mut logs) = store().lock() {
        logs.push(entry);

        if logs.len() > MAX_LOGS {
            let excess = logs.len() - MAX_LOGS;
            logs.drain(0..excess);
        }
    }
}

pub fn info(source: &str, message: impl Into<String>) {
    let message = message.into();

    if message.contains("PHYSICAL") || message.contains("SNAPSHOT") {
        eprintln!("[TESTFLOW][INFO][{source}] {message}");
    }

    push(LogEntry {
        timestamp_ms: 0,
        level: "info".to_string(),
        source: source.to_string(),
        message,
        command: None,
        success: None,
        duration_ms: None,
        stdout: None,
        stderr: None,
    });
}

pub fn error(source: &str, message: impl Into<String>) {
    let message = message.into();

    if message.contains("PHYSICAL") || message.contains("SNAPSHOT") {
        eprintln!("[TESTFLOW][ERROR][{source}] {message}");
    }

    push(LogEntry {
        timestamp_ms: 0,
        level: "error".to_string(),
        source: source.to_string(),
        message,
        command: None,
        success: Some(false),
        duration_ms: None,
        stdout: None,
        stderr: None,
    });
}

pub fn command(command: String, success: bool, duration_ms: u128, stdout: String, stderr: String) {
    push(LogEntry {
        timestamp_ms: 0,
        level: if success { "debug" } else { "error" }.to_string(),
        source: "command".to_string(),
        message: if success {
            "Command completed".to_string()
        } else {
            "Command failed".to_string()
        },
        command: Some(command),
        success: Some(success),
        duration_ms: Some(duration_ms),
        stdout: (!stdout.is_empty()).then_some(stdout),
        stderr: (!stderr.is_empty()).then_some(stderr),
    });
}

pub fn get_logs() -> Vec<LogEntry> {
    store().lock().map(|logs| logs.clone()).unwrap_or_default()
}

pub fn clear_logs() {
    if let Ok(mut logs) = store().lock() {
        logs.clear();
    }
}

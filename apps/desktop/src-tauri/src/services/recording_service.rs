use std::fs;
use std::path::PathBuf;

use serde_json::Value;

fn recordings_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|error| format!("Unable to resolve HOME: {error}"))?;

    let directory = PathBuf::from(home)
        .join(".testflow")
        .join("mobile")
        .join("recordings");

    fs::create_dir_all(&directory)
        .map_err(|error| format!("Unable to create recordings directory: {error}"))?;

    Ok(directory)
}

fn safe_id(id: &str) -> Result<String, String> {
    let value = id.trim();

    if value.is_empty() {
        return Err("Recording id is required".to_string());
    }

    if !value
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || character == '-' || character == '_')
    {
        return Err("Recording id contains invalid characters".to_string());
    }

    Ok(value.to_string())
}

pub fn save(recording: Value) -> Result<Value, String> {
    let id = recording
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Recording id is missing".to_string())?;

    let id = safe_id(id)?;

    let path = recordings_dir()?.join(format!("{id}.json"));

    let content = serde_json::to_string_pretty(&recording)
        .map_err(|error| format!("Unable to serialize recording: {error}"))?;

    fs::write(&path, content).map_err(|error| format!("Unable to persist recording: {error}"))?;

    Ok(recording)
}

pub fn list() -> Result<Vec<Value>, String> {
    let directory = recordings_dir()?;

    let mut recordings = Vec::new();

    for entry in
        fs::read_dir(directory).map_err(|error| format!("Unable to read recordings: {error}"))?
    {
        let entry = entry.map_err(|error| error.to_string())?;

        let path = entry.path();

        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }

        let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;

        let recording = serde_json::from_str::<Value>(&content)
            .map_err(|error| format!("Invalid recording {}: {error}", path.display(),))?;

        recordings.push(recording);
    }

    recordings.sort_by(|left, right| {
        let left_started = left.get("startedAt").and_then(Value::as_u64).unwrap_or(0);

        let right_started = right.get("startedAt").and_then(Value::as_u64).unwrap_or(0);

        right_started.cmp(&left_started)
    });

    Ok(recordings)
}

pub fn delete(recording_id: &str) -> Result<(), String> {
    let id = safe_id(recording_id)?;

    let path = recordings_dir()?.join(format!("{id}.json"));

    if path.exists() {
        fs::remove_file(path).map_err(|error| format!("Unable to delete recording: {error}"))?;
    }

    Ok(())
}

pub fn export(recording: Value) -> Result<String, String> {
    let id = recording
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Recording id is missing".to_string())?;

    let id = safe_id(id)?;

    let home = std::env::var("HOME").map_err(|error| format!("Unable to resolve HOME: {error}"))?;

    let downloads = PathBuf::from(home).join("Downloads");

    fs::create_dir_all(&downloads)
        .map_err(|error| format!("Unable to access Downloads: {error}"))?;

    let destination = downloads.join(format!("{id}.recording.json"));

    let content = serde_json::to_string_pretty(&recording)
        .map_err(|error| format!("Unable to serialize recording: {error}"))?;

    fs::write(&destination, content)
        .map_err(|error| format!("Unable to export recording: {error}"))?;

    Ok(destination.to_string_lossy().to_string())
}

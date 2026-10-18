use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

const MAX_LINES: usize = 5000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppiumLiveLine {
    pub timestamp_ms: u128,
    pub stream: String,
    pub text: String,
}

static LINES: OnceLock<Mutex<VecDeque<AppiumLiveLine>>> = OnceLock::new();

fn store() -> &'static Mutex<VecDeque<AppiumLiveLine>> {
    LINES.get_or_init(|| Mutex::new(VecDeque::new()))
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn strip_ansi(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut output = String::with_capacity(input.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == 0x1b {
            index += 1;

            if index < bytes.len() && bytes[index] == b'[' {
                index += 1;

                while index < bytes.len() {
                    let byte = bytes[index];
                    index += 1;

                    if (0x40..=0x7e).contains(&byte) {
                        break;
                    }
                }

                continue;
            }

            continue;
        }

        let remainder = &input[index..];

        if let Some(character) = remainder.chars().next() {
            output.push(character);
            index += character.len_utf8();
        } else {
            break;
        }
    }

    output
}

pub fn push(stream: impl Into<String>, text: impl Into<String>) {
    let text = strip_ansi(&text.into());

    if text.trim().is_empty() {
        return;
    }

    if let Ok(mut lines) = store().lock() {
        lines.push_back(AppiumLiveLine {
            timestamp_ms: now_ms(),
            stream: stream.into(),
            text,
        });

        while lines.len() > MAX_LINES {
            lines.pop_front();
        }
    }
}

pub fn get() -> Vec<AppiumLiveLine> {
    store()
        .lock()
        .map(|lines| lines.iter().cloned().collect())
        .unwrap_or_default()
}

pub fn clear() {
    if let Ok(mut lines) = store().lock() {
        lines.clear();
    }
}

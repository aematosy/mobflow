use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Instant;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::services::log_service;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicalInputSession {
    pub device_id: String,
    pub input_device: String,
    pub input_name: String,
    pub max_x: i32,
    pub max_y: i32,
    pub screen_width: i32,
    pub screen_height: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicalGesture {
    pub device_id: String,
    pub kind: String,
    pub start_x: i32,
    pub start_y: i32,
    pub end_x: i32,
    pub end_y: i32,
    pub duration_ms: u64,
    pub direction: Option<String>,
}

struct ActiveCapture {
    process: Child,
}

static CAPTURES: OnceLock<Mutex<HashMap<String, ActiveCapture>>> = OnceLock::new();

fn captures() -> &'static Mutex<HashMap<String, ActiveCapture>> {
    CAPTURES.get_or_init(|| Mutex::new(HashMap::new()))
}

/*
 * Durable exactly-once handoff between the long-lived
 * Android input reader and Mobile Recorder.
 *
 * Tauri events remain useful for telemetry, but Recorder
 * correctness does not depend on transient event delivery.
 */
static GESTURES: OnceLock<Mutex<HashMap<String, VecDeque<PhysicalGesture>>>> = OnceLock::new();

fn gesture_store() -> &'static Mutex<HashMap<String, VecDeque<PhysicalGesture>>> {
    GESTURES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn adb_output(device_id: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("adb")
        .arg("-s")
        .arg(device_id)
        .args(args)
        .output()
        .map_err(|error| format!("Unable to execute adb: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn display_size(device_id: &str) -> Result<(i32, i32), String> {
    let output = adb_output(device_id, &["shell", "wm", "size"])?;

    for line in output.lines() {
        if let Some(value) = line.split(':').nth(1).map(str::trim) {
            let Some((width, height)) = value.split_once('x') else {
                continue;
            };

            if let (Ok(width), Ok(height)) =
                (width.trim().parse::<i32>(), height.trim().parse::<i32>())
            {
                return Ok((width, height));
            }
        }
    }

    Err(format!(
        "Unable to resolve Android display size: {}",
        output.trim(),
    ))
}

fn parse_max(line: &str) -> Option<i32> {
    let marker = "max ";

    let start = line.find(marker)? + marker.len();

    let tail = &line[start..];

    let value = tail.split(',').next()?.trim();

    value.parse::<i32>().ok()
}

fn discover_touchscreen(device_id: &str) -> Result<(String, String, i32, i32), String> {
    let output = adb_output(device_id, &["shell", "getevent", "-pl"])?;

    let mut current_device: Option<String> = None;

    let mut current_name = String::new();

    let mut current_direct = false;
    let mut current_max_x: Option<i32> = None;
    let mut current_max_y: Option<i32> = None;

    let finish = |device: &Option<String>,
                  name: &str,
                  direct: bool,
                  max_x: Option<i32>,
                  max_y: Option<i32>|
     -> Option<(String, String, i32, i32)> {
        if !direct {
            return None;
        }

        Some((device.clone()?, name.to_string(), max_x?, max_y?))
    };

    for line in output.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("add device ") {
            if let Some(result) = finish(
                &current_device,
                &current_name,
                current_direct,
                current_max_x,
                current_max_y,
            ) {
                return Ok(result);
            }

            current_device = trimmed.split_once(": ").map(|(_, value)| value.to_string());

            current_name.clear();
            current_direct = false;
            current_max_x = None;
            current_max_y = None;

            continue;
        }

        if let Some(name) = trimmed.strip_prefix("name:") {
            current_name = name.trim().trim_matches('"').to_string();

            continue;
        }

        if trimmed.contains("ABS_MT_POSITION_X") {
            current_max_x = parse_max(trimmed);

            continue;
        }

        if trimmed.contains("ABS_MT_POSITION_Y") {
            current_max_y = parse_max(trimmed);

            continue;
        }

        if trimmed.contains("INPUT_PROP_DIRECT") {
            current_direct = true;
        }
    }

    if let Some(result) = finish(
        &current_device,
        &current_name,
        current_direct,
        current_max_x,
        current_max_y,
    ) {
        return Ok(result);
    }

    Err("No readable direct Android touchscreen was discovered".to_string())
}

fn parse_hex(value: &str) -> Option<i32> {
    let clean = value.trim();

    let unsigned = u32::from_str_radix(clean, 16).ok()?;

    Some(unsigned as i32)
}

fn normalize(raw: i32, maximum: i32, screen: i32) -> i32 {
    if maximum <= 0 {
        return 0;
    }

    let ratio = raw as f64 / maximum as f64;

    (ratio * screen as f64)
        .round()
        .clamp(0.0, screen.saturating_sub(1) as f64) as i32
}

fn swipe_direction(start_x: i32, start_y: i32, end_x: i32, end_y: i32) -> String {
    let dx = end_x - start_x;

    let dy = end_y - start_y;

    if dx.abs() > dy.abs() {
        if dx > 0 { "right" } else { "left" }
    } else if dy > 0 {
        "down"
    } else {
        "up"
    }
    .to_string()
}

pub fn start(app: AppHandle, device_id: &str) -> Result<PhysicalInputSession, String> {
    /*
     * Idempotency boundary.
     *
     * Never spawn two getevent producers for one device.
     */
    {
        let registry = captures()
            .lock()
            .map_err(|_| "Unable to lock physical input registry".to_string())?;

        if registry.contains_key(device_id) {
            log_service::info(
                "device",
                format!("PHYSICAL CAPTURE ALREADY ACTIVE | device={device_id}"),
            );

            return Err(format!("Physical capture already active for {device_id}"));
        }
    }

    stop(device_id)?;

    /*
     * New capture owns a clean gesture queue.
     * A previous Recorder session must never leak actions
     * into a new recording.
     */
    gesture_store()
        .lock()
        .map_err(|_| "Unable to lock physical gesture queue".to_string())?
        .remove(device_id);

    let (input_device, input_name, max_x, max_y) = discover_touchscreen(device_id)?;

    let (screen_width, screen_height) = display_size(device_id)?;

    log_service::info(
        "device",
        format!(
            "Physical input capture: device={device_id}, input={input_device}, name={input_name}, range={max_x}x{max_y}, screen={screen_width}x{screen_height}"
        ),
    );

    let mut child = Command::new("adb")
        .args(["-s", device_id, "shell", "getevent", "-lt", &input_device])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Unable to start physical input capture: {error}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Physical input stdout unavailable".to_string())?;

    let thread_device_id = device_id.to_string();

    thread::spawn(move || {
        let reader = BufReader::new(stdout);

        let mut active = false;

        let mut started_at: Option<Instant> = None;

        let mut start_raw_x = 0;
        let mut start_raw_y = 0;

        let mut current_raw_x = 0;
        let mut current_raw_y = 0;

        let mut have_x = false;
        let mut have_y = false;

        /*
         * Temporary bounded telemetry.
         * We only need to prove that the Rust reader receives
         * data from the long-lived adb/getevent child.
         */
        let mut raw_lines_seen: u64 = 0;

        for line in reader.lines().map_while(Result::ok) {
            raw_lines_seen += 1;

            if raw_lines_seen <= 12 {
                log_service::info(
                    "device",
                    format!("PHYSICAL RAW INPUT #{raw_lines_seen} | {line}"),
                );
            }
            if line.contains("ABS_MT_TRACKING_ID") {
                if line.contains("ffffffff") {
                    if active && have_x && have_y {
                        let duration_ms = started_at
                            .map(|value| value.elapsed().as_millis() as u64)
                            .unwrap_or(0);

                        let start_x = normalize(start_raw_x, max_x, screen_width);

                        let start_y = normalize(start_raw_y, max_y, screen_height);

                        let end_x = normalize(current_raw_x, max_x, screen_width);

                        let end_y = normalize(current_raw_y, max_y, screen_height);

                        let dx = end_x - start_x;

                        let dy = end_y - start_y;

                        let distance_squared = dx * dx + dy * dy;

                        /*
                         * Small finger movement is still a tap.
                         * Threshold is expressed in real screen px.
                         */
                        let is_tap = distance_squared <= 40 * 40;

                        let gesture = PhysicalGesture {
                            device_id: thread_device_id.clone(),

                            kind: if is_tap { "tap" } else { "swipe" }.to_string(),

                            start_x,
                            start_y,
                            end_x,
                            end_y,

                            duration_ms,

                            direction: if is_tap {
                                None
                            } else {
                                Some(swipe_direction(start_x, start_y, end_x, end_y))
                            },
                        };

                        log_service::info(
                            "device",
                            format!(
                                "PHYSICAL GESTURE READY | device={} | kind={} | start={},{} | end={},{} | duration={}ms",
                                gesture.device_id,
                                gesture.kind,
                                gesture.start_x,
                                gesture.start_y,
                                gesture.end_x,
                                gesture.end_y,
                                gesture.duration_ms,
                            ),
                        );

                        /*
                         * Persist first, emit second.
                         *
                         * Mobile Recorder drains this queue exactly once.
                         * Tauri emit remains telemetry only.
                         */
                        {
                            match gesture_store().lock() {
                                Ok(mut store) => {
                                    let queue = store.entry(thread_device_id.clone()).or_default();

                                    queue.push_back(gesture.clone());

                                    while queue.len() > 256 {
                                        queue.pop_front();
                                    }

                                    log_service::info(
                                        "device",
                                        format!(
                                            "PHYSICAL GESTURE QUEUED | device={} | pending={}",
                                            thread_device_id,
                                            queue.len(),
                                        ),
                                    );
                                }

                                Err(_) => {
                                    log_service::error(
                                        "device",
                                        "Unable to lock physical gesture queue",
                                    );
                                }
                            }
                        }

                        match app.emit("testflow://physical-gesture", gesture) {
                            Ok(()) => {
                                log_service::info("device", "PHYSICAL GESTURE EMITTED");
                            }
                            Err(error) => {
                                log_service::error(
                                    "device",
                                    format!("PHYSICAL GESTURE EMIT FAILED | {error}"),
                                );
                            }
                        }
                    }

                    active = false;
                    started_at = None;
                    have_x = false;
                    have_y = false;

                    continue;
                }

                active = true;
                started_at = Some(Instant::now());

                have_x = false;
                have_y = false;

                log_service::info(
                    "device",
                    format!("PHYSICAL TOUCH DOWN | device={thread_device_id}"),
                );

                continue;
            }

            if !active {
                continue;
            }

            if line.contains("ABS_MT_POSITION_X") {
                if let Some(value) = line.split_whitespace().last().and_then(parse_hex) {
                    current_raw_x = value;

                    if !have_x {
                        start_raw_x = value;
                    }

                    have_x = true;
                }

                continue;
            }

            if line.contains("ABS_MT_POSITION_Y") {
                if let Some(value) = line.split_whitespace().last().and_then(parse_hex) {
                    current_raw_y = value;

                    if !have_y {
                        start_raw_y = value;
                    }

                    have_y = true;
                }
            }
        }
    });

    captures()
        .lock()
        .map_err(|_| "Unable to lock physical input registry".to_string())?
        .insert(device_id.to_string(), ActiveCapture { process: child });

    Ok(PhysicalInputSession {
        device_id: device_id.to_string(),
        input_device,
        input_name,
        max_x,
        max_y,
        screen_width,
        screen_height,
    })
}

pub fn drain(device_id: &str) -> Result<Vec<PhysicalGesture>, String> {
    let mut store = gesture_store()
        .lock()
        .map_err(|_| "Unable to lock physical gesture queue".to_string())?;

    let Some(queue) = store.get_mut(device_id) else {
        return Ok(Vec::new());
    };

    let gestures: Vec<PhysicalGesture> = queue.drain(..).collect();

    if !gestures.is_empty() {
        log_service::info(
            "device",
            format!(
                "PHYSICAL GESTURE DRAIN | device={} | count={}",
                device_id,
                gestures.len(),
            ),
        );
    }

    Ok(gestures)
}

pub fn stop(device_id: &str) -> Result<(), String> {
    let capture = captures()
        .lock()
        .map_err(|_| "Unable to lock physical input registry".to_string())?
        .remove(device_id);

    if let Some(mut capture) = capture {
        let _ = capture.process.kill();

        let _ = capture.process.wait();
    }

    Ok(())
}

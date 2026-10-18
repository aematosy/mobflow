use std::env;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::Value;

use crate::models::device::{Device, DeviceInventory, DeviceKind, Platform};
use crate::services::{command_runner, log_service};

fn android_emulator_binary() -> Option<PathBuf> {
    let sdk = env::var("ANDROID_HOME")
        .or_else(|_| env::var("ANDROID_SDK_ROOT"))
        .ok()?;

    let binary = PathBuf::from(sdk)
        .join("emulator")
        .join(if cfg!(target_os = "windows") {
            "emulator.exe"
        } else {
            "emulator"
        });

    binary.exists().then_some(binary)
}

fn android_avd_name(serial: &str) -> Option<String> {
    let result = command_runner::run("adb", &["-s", serial, "emu", "avd", "name"]);

    if !result.success {
        return None;
    }

    result
        .stdout
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && *line != "OK")
        .map(str::to_string)
}

fn connected_android_physical_devices() -> Vec<Device> {
    let result = command_runner::run("adb", &["devices", "-l"]);

    if !result.success {
        return Vec::new();
    }

    result
        .stdout
        .lines()
        .skip(1)
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let mut parts = line.split_whitespace();

            let id = parts.next()?.to_string();
            let state = parts.next().unwrap_or("unknown").to_string();

            if id.starts_with("emulator-") {
                return None;
            }

            let mut model = None;

            for part in parts {
                if let Some(value) = part.strip_prefix("model:") {
                    model = Some(value.replace('_', " "));
                }
            }

            Some(Device {
                id: id.clone(),
                logical_id: id.clone(),
                name: model.clone().unwrap_or_else(|| id.clone()),
                platform: Platform::Android,
                kind: DeviceKind::Physical,
                os_version: None,
                state: state.clone(),
                available: state == "device",
                model,
            })
        })
        .collect()
}

fn connected_android_emulator_runtime(avd_name: &str) -> Option<(String, String, Option<String>)> {
    let result = command_runner::run("adb", &["devices", "-l"]);

    if !result.success {
        return None;
    }

    for line in result
        .stdout
        .lines()
        .skip(1)
        .filter(|line| !line.trim().is_empty())
    {
        let mut parts = line.split_whitespace();

        let Some(serial) = parts.next() else {
            continue;
        };

        let state = parts.next().unwrap_or("unknown");

        if !serial.starts_with("emulator-") {
            continue;
        }

        if android_avd_name(serial).as_deref() != Some(avd_name) {
            continue;
        }

        let mut model = None;

        for part in parts {
            if let Some(value) = part.strip_prefix("model:") {
                model = Some(value.replace('_', " "));
            }
        }

        return Some((serial.to_string(), state.to_string(), model));
    }

    None
}

fn android_emulators() -> Vec<Device> {
    let Some(binary) = android_emulator_binary() else {
        return Vec::new();
    };

    let program = binary.to_string_lossy().to_string();

    let result = command_runner::run(&program, &["-list-avds"]);

    if !result.success {
        return Vec::new();
    }

    result
        .stdout
        .lines()
        .map(str::trim)
        .filter(|avd_name| !avd_name.is_empty())
        .map(|avd_name| {
            let runtime = connected_android_emulator_runtime(avd_name);

            match runtime {
                Some((serial, state, model)) => {
                    log_service::info(
                        "device",
                        format!("Android AVD {avd_name} mapped to runtime {serial} ({state})"),
                    );

                    Device {
                        id: serial,
                        logical_id: avd_name.to_string(),
                        name: avd_name.replace('_', " "),
                        platform: Platform::Android,
                        kind: DeviceKind::Emulator,
                        os_version: None,
                        available: state == "device",
                        state,
                        model,
                    }
                }

                None => {
                    log_service::info(
                        "device",
                        format!("Android AVD {avd_name} is installed and stopped"),
                    );

                    Device {
                        id: format!("avd:{avd_name}"),
                        logical_id: avd_name.to_string(),
                        name: avd_name.replace('_', " "),
                        platform: Platform::Android,
                        kind: DeviceKind::Emulator,
                        os_version: None,
                        state: "Stopped".to_string(),
                        available: true,
                        model: None,
                    }
                }
            }
        })
        .collect()
}

fn ios_simulators() -> Vec<Device> {
    if !cfg!(target_os = "macos") {
        return Vec::new();
    }

    let result = command_runner::run(
        "xcrun",
        &["simctl", "list", "devices", "available", "--json"],
    );

    if !result.success {
        return Vec::new();
    }

    let Ok(json) = serde_json::from_str::<Value>(&result.stdout) else {
        return Vec::new();
    };

    let Some(runtimes) = json.get("devices").and_then(Value::as_object) else {
        return Vec::new();
    };

    let mut devices = Vec::new();

    for (runtime, entries) in runtimes {
        let os_version = runtime
            .split("iOS-")
            .nth(1)
            .map(|value| value.replace('-', "."));

        let Some(entries) = entries.as_array() else {
            continue;
        };

        for entry in entries {
            let Some(id) = entry.get("udid").and_then(Value::as_str) else {
                continue;
            };

            let name = entry
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("iOS Simulator");

            let state = entry
                .get("state")
                .and_then(Value::as_str)
                .unwrap_or("Unknown");

            devices.push(Device {
                id: id.to_string(),
                logical_id: id.to_string(),
                name: name.to_string(),
                platform: Platform::Ios,
                kind: DeviceKind::Simulator,
                os_version: os_version.clone(),
                state: state.to_string(),
                available: true,
                model: None,
            });
        }
    }

    devices
}

fn ios_physical_devices() -> Vec<Device> {
    if !cfg!(target_os = "macos") {
        return Vec::new();
    }

    // TODO:
    // Replace this conservative table parser with
    // structured devicectl output + fixtures/tests.
    let result = command_runner::run("xcrun", &["devicectl", "list", "devices"]);

    if !result.success {
        return Vec::new();
    }

    result
        .stdout
        .lines()
        .skip_while(|line| !line.starts_with("---"))
        .skip(1)
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            if !line.trim_end().ends_with("physical") {
                return None;
            }

            let parts: Vec<&str> = line.split_whitespace().collect();

            let id_index = parts.iter().position(|part| {
                part.contains('-')
                    || (part.len() >= 20 && part.chars().all(|c| c.is_ascii_hexdigit()))
            })?;

            let name = parts[..id_index].join(" ");

            let id = parts[id_index].trim_end_matches("(UDID)").to_string();

            let model = parts[id_index + 1..]
                .join(" ")
                .replace("available (paired)", "")
                .replace("physical", "")
                .trim()
                .to_string();

            Some(Device {
                id: id.clone(),
                logical_id: id,
                name,
                platform: Platform::Ios,
                kind: DeviceKind::Physical,
                os_version: None,
                state: if line.contains("available") {
                    "Available".to_string()
                } else {
                    "Detected".to_string()
                },
                available: line.contains("available"),
                model: if model.is_empty() { None } else { Some(model) },
            })
        })
        .collect()
}

pub fn get_devices() -> DeviceInventory {
    let mut android = connected_android_physical_devices();

    android.extend(android_emulators());

    let mut ios = ios_physical_devices();
    ios.extend(ios_simulators());

    DeviceInventory { android, ios }
}

pub fn start_ios_simulator(id: &str) -> Result<(), String> {
    if !cfg!(target_os = "macos") {
        return Err("Local iOS simulators require macOS.".to_string());
    }

    crate::services::log_service::info("device", format!("Starting iOS simulator {id}"));

    let current = command_runner::run("xcrun", &["simctl", "list", "devices", "booted"]);

    if current.success && current.stdout.contains(id) {
        crate::services::log_service::info(
            "device",
            format!("iOS simulator {id} is already booted"),
        );
        return Ok(());
    }

    let boot = command_runner::run("xcrun", &["simctl", "boot", id]);

    if !boot.success {
        crate::services::log_service::error(
            "device",
            format!(
                "Could not request boot for iOS simulator {id}: {}",
                boot.stderr
            ),
        );

        return Err(if boot.stderr.is_empty() {
            "The iOS simulator could not be started.".to_string()
        } else {
            boot.stderr
        });
    }

    let ready = command_runner::run("xcrun", &["simctl", "bootstatus", id, "-b"]);

    if !ready.success {
        crate::services::log_service::error(
            "device",
            format!(
                "iOS simulator {id} did not finish booting: {}",
                ready.stderr
            ),
        );

        return Err(if ready.stderr.is_empty() {
            "The iOS simulator did not finish booting.".to_string()
        } else {
            ready.stderr
        });
    }

    crate::services::log_service::info("device", format!("iOS simulator {id} is booted and ready"));

    Ok(())
}

pub fn stop_ios_simulator(id: &str) -> Result<(), String> {
    if !cfg!(target_os = "macos") {
        return Err("Local iOS simulators require macOS.".to_string());
    }

    let result = command_runner::run("xcrun", &["simctl", "shutdown", id]);

    if result.success {
        Ok(())
    } else {
        Err(if result.stderr.is_empty() {
            "The iOS simulator could not be stopped.".to_string()
        } else {
            result.stderr
        })
    }
}

fn find_android_serial_for_avd(avd_name: &str) -> Option<String> {
    let result = command_runner::run("adb", &["devices"]);

    if !result.success {
        return None;
    }

    for line in result.stdout.lines().skip(1) {
        let serial = line.split_whitespace().next()?;

        if !serial.starts_with("emulator-") {
            continue;
        }

        if android_avd_name(serial).as_deref() == Some(avd_name) {
            return Some(serial.to_string());
        }
    }

    None
}

fn wait_for_android_boot(avd_name: &str, timeout: Duration) -> Result<String, String> {
    let started = Instant::now();

    while started.elapsed() < timeout {
        if let Some(serial) = find_android_serial_for_avd(avd_name) {
            let boot = command_runner::run(
                "adb",
                &["-s", &serial, "shell", "getprop", "sys.boot_completed"],
            );

            if boot.success && boot.stdout.trim() == "1" {
                return Ok(serial);
            }
        }

        thread::sleep(Duration::from_millis(750));
    }

    Err(format!(
        "Android emulator '{avd_name}' did not become ready before timeout."
    ))
}

pub fn start_android_emulator(avd_name: &str) -> Result<String, String> {
    if let Some(serial) = find_android_serial_for_avd(avd_name) {
        return Ok(serial);
    }

    let binary = android_emulator_binary()
        .ok_or_else(|| "Android Emulator binary was not found.".to_string())?;

    Command::new(binary)
        .args(["-avd", avd_name])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Could not start Android emulator: {error}"))?;

    wait_for_android_boot(avd_name, Duration::from_secs(180))
}

pub fn stop_android_emulator(serial: &str) -> Result<(), String> {
    if !serial.starts_with("emulator-") {
        return Err("Only Android emulator instances can be stopped here.".to_string());
    }

    let result = command_runner::run("adb", &["-s", serial, "emu", "kill"]);

    if result.success {
        Ok(())
    } else {
        Err(if result.stderr.is_empty() {
            "Android emulator could not be stopped.".to_string()
        } else {
            result.stderr
        })
    }
}

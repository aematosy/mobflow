use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::services::{appium_log_service, log_service, runtime_config};

static APPIUM_PROCESS: OnceLock<Mutex<Option<Child>>> = OnceLock::new();

fn process_store() -> &'static Mutex<Option<Child>> {
    APPIUM_PROCESS.get_or_init(|| Mutex::new(None))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppiumSession {
    pub session_id: String,
    pub server_url: String,
    pub automation_name: String,
    pub platform_name: String,
}

fn server_ready() -> bool {
    let status_url = runtime_config::appium_status_url();

    ureq::get(&status_url)
        .call()
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

pub fn ensure_server() -> Result<(), String> {
    let config = runtime_config::get_appium_config();
    let server_url = runtime_config::appium_url();

    if server_ready() {
        log_service::info(
            "appium",
            format!("Appium server already running on {server_url}"),
        );
        return Ok(());
    }

    log_service::info("appium", format!("Starting Appium server on {server_url}"));

    let port = config.port.to_string();

    let mut child = Command::new("appium")
        .args([
            "--address",
            config.host.as_str(),
            "--port",
            port.as_str(),
            "--base-path",
            config.base_path.as_str(),
            "--log-no-colors",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            let message = format!("Unable to start Appium: {error}");
            log_service::error("appium", &message);
            message
        })?;

    if let Some(stdout) = child.stdout.take() {
        thread::spawn(move || {
            let reader = BufReader::new(stdout);

            for line in reader.lines().map_while(Result::ok) {
                appium_log_service::push("stdout", line);
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        thread::spawn(move || {
            let reader = BufReader::new(stderr);

            for line in reader.lines().map_while(Result::ok) {
                appium_log_service::push("stderr", line);
            }
        });
    }

    if let Ok(mut process) = process_store().lock() {
        *process = Some(child);
    }

    for attempt in 1..=30 {
        if server_ready() {
            log_service::info(
                "appium",
                format!("Appium server ready after {attempt} checks"),
            );
            return Ok(());
        }

        thread::sleep(Duration::from_millis(250));
    }

    let message = "Appium did not become ready within the expected time";

    log_service::error("appium", message);

    Err(message.to_string())
}

pub fn create_android_session(
    device_id: &str,
    _application_path: &str,
    package: &str,
    activity: &str,
) -> Result<AppiumSession, String> {
    ensure_server()?;

    log_service::info(
        "appium",
        format!("Creating UiAutomator2 session for {device_id}"),
    );

    let config = runtime_config::get_appium_config();

    let mut always_match = serde_json::Map::new();

    always_match.insert("platformName".to_string(), json!("Android"));
    always_match.insert("appium:automationName".to_string(), json!("UiAutomator2"));
    always_match.insert("appium:udid".to_string(), json!(device_id));
    always_match.insert("appium:deviceName".to_string(), json!(device_id));
    always_match.insert("appium:appPackage".to_string(), json!(package));
    always_match.insert("appium:appActivity".to_string(), json!(activity));

    /*
     * Safe MobFlow defaults.
     *
     * User capabilities may intentionally override these
     * non-identity defaults.
     */
    always_match.insert("appium:noReset".to_string(), json!(true));
    always_match.insert("appium:newCommandTimeout".to_string(), json!(300));

    for capability in config.capabilities {
        /*
         * MobFlow owns session identity capabilities.
         *
         * For an explicit clean session, MobFlow also owns
         * noReset=false. A user capability must not silently
         * turn "Nueva sesión" back into state preservation.
         */
        let protected = matches!(
            capability.key.as_str(),
            "platformName"
                | "appium:automationName"
                | "appium:udid"
                | "appium:deviceName"
                | "appium:appPackage"
                | "appium:appActivity"
        );

        if protected {
            continue;
        }

        always_match.insert(capability.key, capability.value);
    }

    let payload = json!({
        "capabilities": {
            "alwaysMatch": always_match,
            "firstMatch": [{}]
        }
    });

    /*
     * UiAutomator2 bootstrap must never block Prepare
     * indefinitely.
     *
     * Thirty seconds is a hard upper bound for creating
     * the Appium session.
     */
    let appium_url = runtime_config::appium_url();
    let session_url = format!("{appium_url}/session");

    let mut response = ureq::post(&session_url)
        .config()
        .timeout_global(Some(Duration::from_secs(30)))
        .build()
        .send_json(payload)
        .map_err(|error| {
            let message = format!("Unable to create Appium session within 30s: {error}");

            log_service::error("appium", &message);

            message
        })?;

    let body: Value = response.body_mut().read_json().map_err(|error| {
        let message = format!("Unable to parse Appium session response: {error}");
        log_service::error("appium", &message);
        message
    })?;

    let session_id = body
        .get("value")
        .and_then(|value| value.get("sessionId"))
        .and_then(Value::as_str)
        .or_else(|| body.get("sessionId").and_then(Value::as_str))
        .ok_or_else(|| {
            let message = format!("Appium response did not contain sessionId: {body}");
            log_service::error("appium", &message);
            message
        })?
        .to_string();

    log_service::info(
        "appium",
        format!("UiAutomator2 session ready: {session_id}"),
    );

    Ok(AppiumSession {
        session_id,
        server_url: appium_url,
        automation_name: "UiAutomator2".to_string(),
        platform_name: "Android".to_string(),
    })
}

pub fn delete_session(session_id: &str) -> Result<(), String> {
    if session_id.trim().is_empty() {
        return Ok(());
    }

    let appium_url = runtime_config::appium_url();
    let url = format!("{appium_url}/session/{session_id}");

    log_service::info("session", format!("Deleting Appium session: {session_id}"));

    match ureq::delete(&url).call() {
        Ok(_) => {
            log_service::info("session", format!("Appium session deleted: {session_id}"));

            Ok(())
        }

        Err(ureq::Error::StatusCode(404)) => {
            log_service::info(
                "session",
                format!("Appium session already gone: {session_id}"),
            );

            Ok(())
        }

        Err(ureq::Error::StatusCode(code)) => {
            let message = format!(
                "Unable to delete Appium session \
                 {session_id}: HTTP {code}"
            );

            log_service::error("session", &message);

            Err(message)
        }

        Err(error) => {
            let message = format!(
                "Unable to delete Appium session \
                 {session_id}: {error}"
            );

            log_service::error("session", &message);

            Err(message)
        }
    }
}

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::services::{appium_service, command_runner, log_service};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareApplicationResult {
    pub ok: bool,
    pub platform: String,
    pub device_id: String,
    pub application_path: String,
    pub package: String,
    pub activity: String,
    pub session_id: String,
    pub appium_url: String,
    pub automation_name: String,
    pub message: String,
}

fn find_aapt() -> Option<PathBuf> {
    let sdk = env::var("ANDROID_HOME")
        .or_else(|_| env::var("ANDROID_SDK_ROOT"))
        .ok()?;

    let build_tools = PathBuf::from(sdk).join("build-tools");

    let mut candidates = fs::read_dir(build_tools)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path().join("aapt"))
        .filter(|path| path.exists())
        .collect::<Vec<_>>();

    candidates.sort();
    candidates.pop()
}

fn quoted_attribute(line: &str, attribute: &str) -> Option<String> {
    let marker = format!("{attribute}='");

    let start = line.find(&marker)? + marker.len();
    let remainder = &line[start..];
    let end = remainder.find('\'')?;

    Some(remainder[..end].to_string())
}

fn apk_metadata(application_path: &str) -> Result<(String, String), String> {
    let aapt = find_aapt().ok_or_else(|| "Unable to locate Android aapt".to_string())?;

    log_service::info("app", "Reading APK metadata");

    let program = aapt.to_string_lossy().to_string();

    let result = command_runner::run(&program, &["dump", "badging", application_path]);

    if !result.success {
        let message = format!("Unable to read APK metadata: {}", result.stderr);

        log_service::error("app", &message);
        return Err(message);
    }

    let package_line = result
        .stdout
        .lines()
        .find(|line| line.starts_with("package:"))
        .ok_or_else(|| "APK package name was not found".to_string())?;

    let activity_line = result
        .stdout
        .lines()
        .find(|line| line.starts_with("launchable-activity:"))
        .ok_or_else(|| "APK launchable activity was not found".to_string())?;

    let package = quoted_attribute(package_line, "name")
        .ok_or_else(|| "Unable to parse APK package name".to_string())?;

    let activity = quoted_attribute(activity_line, "name")
        .ok_or_else(|| "Unable to parse APK launchable activity".to_string())?;

    log_service::info(
        "app",
        format!("APK metadata detected: {package} / {activity}"),
    );

    Ok((package, activity))
}

pub fn prepare_android_application(
    device_id: &str,
    application_path: &str,
) -> Result<PrepareApplicationResult, String> {
    log_service::info(
        "app",
        format!("Preparing Android application: {application_path}"),
    );

    /*
     * The selected APK is the source of application
     * metadata for the Recorder/Inspector.
     *
     * Preparing an automation session must not implicitly
     * install the application.
     */
    let path = Path::new(application_path);

    if !path.exists() {
        let message = format!("Application file does not exist: {application_path}");

        log_service::error("app", &message);

        return Err(message);
    }

    let is_apk = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("apk"))
        .unwrap_or(false);

    if !is_apk {
        let message = "Android local application must be an APK";

        log_service::error("app", message);

        return Err(message.to_string());
    }

    /*
     * Always validate the exact device selected by the
     * user. Multiple Android devices may be connected.
     */
    log_service::info("device", format!("Validating Android target: {device_id}"));

    let devices = command_runner::run("adb", &["devices"]);

    if !devices.success {
        let message = format!("Unable to query ADB: {}", devices.stderr,);

        log_service::error("device", &message);

        return Err(message);
    }

    let target_ready = devices.stdout.lines().skip(1).any(|line| {
        let mut parts = line.split_whitespace();

        matches!(
            (
                parts.next(),
                parts.next(),
            ),
            (
                Some(serial),
                Some("device"),
            ) if serial == device_id
        )
    });

    if !target_ready {
        let message = format!("Android target is not ready: {device_id}");

        log_service::error("device", &message);

        return Err(message);
    }

    /*
     * Resolve AUT identity dynamically.
     *
     * Nothing here knows about SauceDemo, Samsung,
     * emulator serials or any concrete application.
     */
    let (package, activity) = apk_metadata(application_path)?;

    log_service::info(
        "app",
        format!("Application metadata resolved: package={package}, activity={activity}"),
    );

    /*
     * Appium attaches to the already-installed AUT using:
     *
     * device_id
     * package
     * activity
     *
     * There is deliberately no adb install here.
     */
    /*
     * LOCAL FILE CONTRACT
     *
     * The selected APK is the source of truth.
     *
     * Every Prepare for a local file installs exactly the
     * application_path selected by the user onto exactly the
     * device_id selected by the user.
     *
     * No installed-app lookup.
     * No package cache.
     * No temporary APK.
     * No reuse decision.
     *
     * package/activity were resolved directly from this APK
     * above and are used to create the automation session.
     */
    log_service::info(
        "app",
        format!("Installing selected local APK | device={device_id} | path={application_path}"),
    );

    let install = command_runner::run_with_timeout(
        "adb",
        &["-s", device_id, "install", "-r", application_path],
        std::time::Duration::from_secs(60),
    );

    if !install.success {
        let details = if install.stderr.trim().is_empty() {
            install.stdout.trim()
        } else {
            install.stderr.trim()
        };

        let message = format!(
            "Unable to install selected local APK on {device_id}: {}",
            if details.is_empty() {
                "adb install failed"
            } else {
                details
            },
        );

        log_service::error("app", &message);

        return Err(message);
    }

    log_service::info(
        "app",
        format!(
            "Selected local APK installed successfully | device={device_id} | package={package}"
        ),
    );

    let session =
        appium_service::create_android_session(device_id, application_path, &package, &activity)?;

    log_service::info(
        "session",
        format!("Android automation session ready: {}", session.session_id,),
    );

    Ok(PrepareApplicationResult {
        ok: true,
        platform: "android".to_string(),
        device_id: device_id.to_string(),
        application_path: application_path.to_string(),
        package,
        activity,
        session_id: session.session_id,
        appium_url: session.server_url,
        automation_name: session.automation_name,
        message: "Session ready".to_string(),
    })
}

/*
 * Create a genuinely clean Android automation context.
 *
 * Unlike normal preparation, this operation intentionally
 * clears the AUT application data before creating Appium.
 *
 * Contract:
 * - application remains installed;
 * - no APK reinstall;
 * - no hardcoded application/package/device;
 * - AUT starts from its initial application state;
 * - a new UiAutomator2 session is always created.
 */
pub fn restart_android_application(
    device_id: &str,
    application_path: &str,
) -> Result<PrepareApplicationResult, String> {
    log_service::info(
        "session",
        format!(
            "Creating clean Android automation session: \
             device={device_id}"
        ),
    );

    let path = Path::new(application_path);

    if !path.exists() {
        let message = format!("Application file does not exist: {application_path}");

        log_service::error("app", &message);

        return Err(message);
    }

    let (package, activity) = apk_metadata(application_path)?;

    /*
     * The package must already exist because this operation
     * is invoked from an active automation lifecycle.
     *
     * Still validate explicitly instead of assuming.
     */
    let installed = command_runner::run("adb", &["-s", device_id, "shell", "pm", "path", &package]);

    let package_available = installed.success
        && installed
            .stdout
            .lines()
            .any(|line| line.trim().starts_with("package:"));

    if !package_available {
        let message = format!(
            "Unable to restart AUT because package is not \
             installed on {device_id}: {package}"
        );

        log_service::error("session", &message);

        return Err(message);
    }

    /*
     * NEW SESSION CONTRACT
     *
     * A new MobFlow session means a clean AUT runtime:
     *
     *   force-stop
     *   -> clear application data
     *   -> create UiAutomator2 session
     *
     * UiAutomator2 owns the clean AUT launch.
     *
     * Do not rely on Appium/noReset to define application
     * lifecycle semantics.
     */

    log_service::info(
        "session",
        format!(
            "Stopping AUT before clean restart: \
             device={device_id}, package={package}"
        ),
    );

    let stop = command_runner::run_with_timeout(
        "adb",
        &["-s", device_id, "shell", "am", "force-stop", &package],
        std::time::Duration::from_secs(10),
    );

    if !stop.success {
        let details = if stop.stderr.trim().is_empty() {
            stop.stdout
        } else {
            stop.stderr
        };

        let message = format!("Unable to stop AUT on {device_id}: {details}");

        log_service::error("session", &message);

        return Err(message);
    }

    log_service::info(
        "session",
        format!(
            "Clearing AUT application data: \
             device={device_id}, package={package}"
        ),
    );

    let clear = command_runner::run_with_timeout(
        "adb",
        &["-s", device_id, "shell", "pm", "clear", &package],
        std::time::Duration::from_secs(10),
    );

    let clear_output = clear.stdout.trim();

    if !clear.success || !clear_output.eq_ignore_ascii_case("success") {
        let details = if clear.stderr.trim().is_empty() {
            clear.stdout
        } else {
            clear.stderr
        };

        let message = format!(
            "Unable to clear AUT application data on \
             {device_id}: {details}"
        );

        log_service::error("session", &message);

        return Err(message);
    }

    log_service::info(
        "session",
        format!(
            "AUT application data cleared successfully: \
             {package}"
        ),
    );

    /*
     * PROVEN CLEAN AUT LAUNCH
     *
     * This sequence mirrors the manually validated Android
     * reset contract:
     *
     *   am force-stop
     *   pm clear
     *   am start -W -S -n package/activity
     *
     * Do not replace this with activateApp(). activateApp()
     * may bring an existing Android task to foreground.
     */
    let component = format!("{package}/{activity}");

    log_service::info(
        "session",
        format!("Launching clean AUT from resolved activity: {component}"),
    );

    let launch = command_runner::run_with_timeout(
        "adb",
        &[
            "-s", device_id, "shell", "am", "start", "-W", "-S", "-n", &component,
        ],
        std::time::Duration::from_secs(15),
    );

    if !launch.success {
        let details = if launch.stderr.trim().is_empty() {
            launch.stdout
        } else {
            launch.stderr
        };

        let message = format!("Unable to launch clean AUT on {device_id}: {details}");

        log_service::error("session", &message);

        return Err(message);
    }

    /*
     * `am start -W` waits for Android launch completion.
     * Keep a short stabilization window for applications
     * whose splash activity redirects to their real root.
     */
    std::thread::sleep(std::time::Duration::from_millis(700));

    log_service::info(
        "session",
        format!("Clean AUT launch completed: {component}"),
    );

    /*
     * CLEAN TASK LAUNCH
     *
     * pm clear removes persisted application data, but MobFlow
     * must also guarantee that Android starts a fresh task from
     * the resolved launch activity instead of bringing an
     * existing task/back stack to the foreground.
     */
    let component = format!("{package}/{activity}");

    log_service::info("session", format!("Launching clean AUT task: {component}"));

    let launch = command_runner::run_with_timeout(
        "adb",
        &[
            "-s", device_id, "shell", "am", "start", "-W", "-S", "-n", &component,
        ],
        std::time::Duration::from_secs(15),
    );

    if !launch.success {
        let details = if launch.stderr.trim().is_empty() {
            launch.stdout
        } else {
            launch.stderr
        };

        let message = format!("Unable to launch clean AUT task on {device_id}: {details}");

        log_service::error("session", &message);

        return Err(message);
    }

    log_service::info("session", format!("Clean AUT task launched: {component}"));

    let session =
        appium_service::create_android_session(device_id, application_path, &package, &activity)?;

    log_service::info(
        "session",
        format!(
            "Clean Android automation session ready: {}",
            session.session_id,
        ),
    );

    Ok(PrepareApplicationResult {
        ok: true,
        platform: "android".to_string(),
        device_id: device_id.to_string(),
        application_path: application_path.to_string(),
        package,
        activity,
        session_id: session.session_id,
        appium_url: session.server_url,
        automation_name: session.automation_name,
        message: "Clean session ready".to_string(),
    })
}

use crate::services::{
    appium_service::{
        self,
        AndroidSessionLaunchPolicy,
    },
    command_runner,
    log_service,
};

use crate::services::application_service::PrepareApplicationResult;

/*
 * Recover Appium automation infrastructure without changing
 * the current AUT runtime state.
 *
 * Contract:
 * - no force-stop;
 * - no pm clear;
 * - no APK reinstall;
 * - no explicit AUT launch;
 * - preserve the application's current screen/task;
 * - create a fresh UiAutomator2 session.
 */
pub fn recover_android_session(
    device_id: &str,
    application_path: &str,
    package: &str,
    activity: &str,
) -> Result<PrepareApplicationResult, String> {
    if device_id.trim().is_empty() {
        return Err(
            "Cannot recover Appium session without device id."
                .to_string(),
        );
    }

    if package.trim().is_empty() {
        return Err(
            "Cannot recover Appium session without package."
                .to_string(),
        );
    }

    if activity.trim().is_empty() {
        return Err(
            "Cannot recover Appium session without activity."
                .to_string(),
        );
    }

    log_service::info(
        "session",
        format!(
            "Recovering Android Appium session | \
             device={device_id} | package={package}"
        ),
    );

    /*
     * Recovery operates against an already prepared AUT.
     * Verify that the package still exists instead of silently
     * falling back to installation/preparation behavior.
     */
    let installed = command_runner::run(
        "adb",
        &[
            "-s",
            device_id,
            "shell",
            "pm",
            "path",
            package,
        ],
    );

    let package_available =
        installed.success
        && installed
            .stdout
            .lines()
            .any(
                |line| {
                    line.trim()
                        .starts_with("package:")
                },
            );

    if !package_available {
        let message = format!(
            "Cannot recover Appium session because package \
             is not installed on {device_id}: {package}"
        );

        log_service::error(
            "session",
            &message,
        );

        return Err(message);
    }

    /*
     * Critical recovery boundary:
     *
     * PreserveApplicationState adds autoLaunch=false.
     * UiAutomator2 infrastructure is recreated without asking
     * Appium to launch or restart the AUT.
     */
    let session =
        appium_service::create_android_session_with_policy(
            device_id,
            application_path,
            package,
            activity,
            AndroidSessionLaunchPolicy::PreserveApplicationState,
        )?;

    log_service::info(
        "session",
        format!(
            "Android Appium session recovered | \
             old runtime preserved | new_session={}",
            session.session_id,
        ),
    );

    Ok(PrepareApplicationResult {
        ok: true,
        platform: "android".to_string(),
        device_id: device_id.to_string(),
        application_path: application_path.to_string(),
        package: package.to_string(),
        activity: activity.to_string(),
        session_id: session.session_id,
        appium_url: session.server_url,
        automation_name: session.automation_name,
        message: "Session recovered".to_string(),
    })
}

use std::env;

use crate::models::environment::{EnvironmentStatus, ToolStatus};
use crate::services::command_runner;

fn command_status(name: &str, program: &str, args: &[&str], required: bool) -> ToolStatus {
    let result = command_runner::run(program, args);

    ToolStatus {
        name: name.to_string(),
        installed: result.success,
        version: if result.success && !result.stdout.is_empty() {
            Some(result.stdout.lines().next().unwrap_or_default().to_string())
        } else {
            None
        },
        path: None,
        required,
    }
}

pub fn get_environment() -> EnvironmentStatus {
    let android_home = env::var("ANDROID_HOME")
        .or_else(|_| env::var("ANDROID_SDK_ROOT"))
        .ok();

    let mut adb = command_status("ADB", "adb", &["version"], true);

    if adb.installed {
        adb.version = adb.version.as_deref().and_then(|_| {
            let result = command_runner::run("adb", &["version"]);
            result.stdout.lines().nth(1).map(|value| value.to_string())
        });
    }

    let xcode_result = command_runner::run("xcodebuild", &["-version"]);

    EnvironmentStatus {
        operating_system: env::consts::OS.to_string(),
        architecture: env::consts::ARCH.to_string(),

        appium: command_status("Appium", "appium", &["--version"], true),

        adb,

        android_sdk: ToolStatus {
            name: "Android SDK".to_string(),
            installed: android_home.is_some(),
            version: None,
            path: android_home,
            required: true,
        },

        xcode: ToolStatus {
            name: "Xcode".to_string(),
            installed: xcode_result.success,
            version: if xcode_result.success {
                Some(xcode_result.stdout.replace('\n', " · "))
            } else {
                None
            },
            path: None,
            required: cfg!(target_os = "macos"),
        },

        maestro: command_status("Maestro", "maestro", &["--version"], false),
    }
}

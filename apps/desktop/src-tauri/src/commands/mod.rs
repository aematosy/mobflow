use crate::models::device::DeviceInventory;
use crate::models::environment::EnvironmentStatus;
use crate::services::{device_service, environment_service};

#[tauri::command]
pub fn get_environment_status() -> EnvironmentStatus {
    environment_service::get_environment()
}

#[tauri::command]
pub fn get_devices() -> DeviceInventory {
    device_service::get_devices()
}

#[tauri::command]
pub fn start_ios_simulator(id: String) -> Result<(), String> {
    device_service::start_ios_simulator(&id)
}

#[tauri::command]
pub fn stop_ios_simulator(id: String) -> Result<(), String> {
    device_service::stop_ios_simulator(&id)
}

#[tauri::command]
pub fn start_android_emulator(avd_name: String) -> Result<String, String> {
    device_service::start_android_emulator(&avd_name)
}

#[tauri::command]
pub fn stop_android_emulator(serial: String) -> Result<(), String> {
    device_service::stop_android_emulator(&serial)
}

#[tauri::command]
pub fn get_logs() -> Vec<crate::services::log_service::LogEntry> {
    crate::services::log_service::get_logs()
}

#[tauri::command]
pub fn clear_logs() {
    crate::services::log_service::clear_logs();
}

#[tauri::command]
pub fn prepare_android_application(
    device_id: String,
    application_path: String,
) -> Result<crate::services::application_service::PrepareApplicationResult, String> {
    crate::services::application_service::prepare_android_application(&device_id, &application_path)
}

#[tauri::command]
pub fn restart_android_application(
    device_id: String,
    application_path: String,
) -> Result<crate::services::application_service::PrepareApplicationResult, String> {
    crate::services::application_service::restart_android_application(&device_id, &application_path)
}

#[tauri::command]
pub fn get_appium_live_logs() -> Vec<crate::services::appium_log_service::AppiumLiveLine> {
    crate::services::appium_log_service::get()
}

#[tauri::command]
pub fn clear_appium_live_logs() {
    crate::services::appium_log_service::clear();
}

#[tauri::command]
pub fn delete_appium_session(session_id: String) -> Result<(), String> {
    crate::services::appium_service::delete_session(&session_id)
}

#[tauri::command]
pub fn get_android_spy_elements(
    session_id: String,
) -> Result<Vec<crate::models::spy::MobileElementSnapshot>, String> {
    crate::services::spy_service::get_android_elements(&session_id)
}

#[tauri::command]
pub fn get_android_inspector_snapshot(
    session_id: String,
    device_id: String,
) -> Result<crate::models::spy::InspectorSnapshot, String> {
    crate::services::spy_service::get_android_inspector_snapshot(&session_id, &device_id)
}

#[tauri::command]
pub fn tap_session(session_id: String, x: i32, y: i32) -> Result<(), String> {
    crate::services::appium_client::tap(&session_id, x, y)
}

#[tauri::command]
pub fn click_element(session_id: String, element_id: String) -> Result<(), String> {
    crate::services::appium_client::click_element_by_id(&session_id, &element_id)
}

#[tauri::command]
pub fn android_navigation_key(session_id: String, action: String) -> Result<(), String> {
    crate::services::appium_client::android_navigation_key(&session_id, &action)
}

#[tauri::command]
pub fn test_locator(
    session_id: String,
    strategy: String,
    selector: String,
) -> Result<usize, String> {
    crate::services::log_service::info(
        "locator",
        format!("Testing locator: strategy={strategy}, selector={selector}"),
    );

    let count =
        crate::services::appium_client::locator_match_count(&session_id, &strategy, &selector)?;

    crate::services::log_service::info(
        "locator",
        format!("Locator test completed: strategy={strategy}, matches={count}"),
    );

    Ok(count)
}

#[tauri::command]
pub fn analyze_android_element_locators(
    session_id: String,
    element_id: String,
    elements: Vec<crate::models::spy::MobileElementSnapshot>,
) -> Result<Vec<crate::models::spy::LocatorCandidate>, String> {
    crate::services::locator_service::analyze_android_element(&session_id, &element_id, &elements)
}

#[tauri::command]
pub fn get_android_current_package(session_id: String) -> Result<String, String> {
    crate::services::appium_client::android_current_package(&session_id)
}

#[tauri::command]
pub fn get_android_app_context(
    session_id: String,
) -> Result<crate::services::appium_client::AndroidAppContext, String> {
    crate::services::appium_client::android_current_context(&session_id)
}

#[tauri::command]
pub fn activate_android_app(session_id: String, package: String) -> Result<(), String> {
    crate::services::appium_client::activate_android_app(&session_id, &package)
}

#[tauri::command]
pub fn swipe_session(
    session_id: String,
    start_x: i32,
    start_y: i32,
    end_x: i32,
    end_y: i32,
    duration_ms: u64,
) -> Result<(), String> {
    crate::services::appium_client::swipe_session(
        &session_id,
        start_x,
        start_y,
        end_x,
        end_y,
        duration_ms,
    )
}

#[tauri::command]
pub fn terminate_android_app(session_id: String, package_name: String) -> Result<(), String> {
    crate::services::appium_client::terminate_android_app(&session_id, &package_name)
}

#[tauri::command]
pub fn add_runtime_log(level: String, source: String, message: String) -> Result<(), String> {
    match level.as_str() {
        "error" => {
            crate::services::log_service::error(&source, message);
        }

        _ => {
            crate::services::log_service::info(&source, message);
        }
    }

    Ok(())
}

#[tauri::command]
pub fn start_device_stream(
    device_id: String,
    platform: String,
) -> Result<crate::models::stream::DeviceStreamSession, String> {
    crate::services::stream_service::start(&device_id, &platform)
}

#[tauri::command]
pub fn stop_device_stream(stream_id: String) -> Result<(), String> {
    crate::services::stream_service::stop(&stream_id)
}

#[tauri::command]
pub fn get_android_stream_frame(device_id: String) -> Result<String, String> {
    crate::services::stream_service::android_frame(&device_id)
}

#[tauri::command]
pub fn save_mobile_recording(recording: serde_json::Value) -> Result<serde_json::Value, String> {
    crate::services::recording_service::save(recording)
}

#[tauri::command]
pub fn list_mobile_recordings() -> Result<Vec<serde_json::Value>, String> {
    crate::services::recording_service::list()
}

#[tauri::command]
pub fn delete_mobile_recording(recording_id: String) -> Result<(), String> {
    crate::services::recording_service::delete(&recording_id)
}

#[tauri::command]
pub fn export_mobile_recording(recording: serde_json::Value) -> Result<String, String> {
    crate::services::recording_service::export(recording)
}

#[tauri::command]
pub fn click_session_locator(
    session_id: String,
    strategy: String,
    locator: String,
) -> Result<crate::services::appium_client::LocatorClickResult, String> {
    crate::services::appium_client::click_locator(&session_id, &strategy, &locator)
}

#[tauri::command]
pub fn start_physical_input_capture(
    app: tauri::AppHandle,
    device_id: String,
) -> Result<crate::services::physical_input_service::PhysicalInputSession, String> {
    crate::services::physical_input_service::start(app, &device_id)
}

#[tauri::command]
pub fn stop_physical_input_capture(device_id: String) -> Result<(), String> {
    crate::services::physical_input_service::stop(&device_id)
}

#[tauri::command]
pub fn drain_physical_gestures(
    device_id: String,
) -> Result<Vec<crate::services::physical_input_service::PhysicalGesture>, String> {
    crate::services::physical_input_service::drain(&device_id)
}

#[tauri::command]
pub fn get_appium_runtime_config() -> crate::services::runtime_config::AppiumRuntimeConfig {
    crate::services::runtime_config::get_appium_config()
}

#[tauri::command]
pub fn set_appium_runtime_config(
    host: String,
    port: u16,
    base_path: String,
    capabilities: Vec<crate::services::runtime_config::AppiumCapability>,
) -> Result<crate::services::runtime_config::AppiumRuntimeConfig, String> {
    crate::services::runtime_config::set_appium_config(host, port, base_path, capabilities)
}

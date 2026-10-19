mod commands;
mod models;
mod services;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_environment_status,
            commands::get_devices,
            commands::start_ios_simulator,
            commands::stop_ios_simulator,
            commands::start_android_emulator,
            commands::stop_android_emulator,
            commands::get_logs,
            commands::clear_logs,
            commands::add_runtime_log,
            commands::get_appium_live_logs,
            commands::clear_appium_live_logs,
            commands::prepare_android_application,
            commands::recover_android_session,
            commands::restart_android_application,
            commands::delete_appium_session,
            commands::get_android_spy_elements,
            commands::get_android_inspector_snapshot,
            commands::tap_session,
            commands::click_element,
            commands::android_navigation_key,
            commands::type_element_text,
            commands::clear_element_text,
            commands::hide_android_keyboard,
            commands::swipe_session,
            commands::get_session_health,
            commands::get_android_current_package,
            commands::get_android_app_context,
            commands::activate_android_app,
            commands::terminate_android_app,
            commands::test_locator,
            commands::test_locator_detail,
            commands::analyze_android_element_locators,
            commands::start_device_stream,
            commands::stop_device_stream,
            commands::get_android_stream_frame,
            commands::save_mobile_recording,
            commands::list_mobile_recordings,
            commands::delete_mobile_recording,
            commands::export_mobile_recording,
            commands::click_session_locator,
            commands::start_physical_input_capture,
            commands::stop_physical_input_capture,
            commands::drain_physical_gestures,
            commands::get_appium_runtime_config,
            commands::set_appium_runtime_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running TestFlow Mobile");
}

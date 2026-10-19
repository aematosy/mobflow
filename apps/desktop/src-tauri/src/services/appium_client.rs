use std::time::{Duration, Instant};

use serde_json::Value;

use crate::services::{log_service, runtime_config};

const LOCATOR_REQUEST_TIMEOUT: Duration = Duration::from_millis(1200);

fn appium_error_message(status: u16, body: &str) -> String {
    if let Ok(json) = serde_json::from_str::<Value>(body) {
        if let Some(message) = json
            .get("value")
            .and_then(|value| value.get("message"))
            .and_then(Value::as_str)
        {
            return format!("Appium HTTP {status}: {message}");
        }
    }

    if body.trim().is_empty() {
        format!("Appium HTTP {status}")
    } else {
        format!("Appium HTTP {status}: {}", body.trim())
    }
}

pub fn page_source(session_id: &str) -> Result<String, String> {
    let url = format!(
        "{}/session/{session_id}/source",
        runtime_config::appium_url()
    );

    log_service::info("appium", format!("GET /session/{session_id}/source"));

    /*
     * ureq 3 normally converts HTTP 4xx/5xx into
     * Error::StatusCode before the response body can be
     * consumed here.
     *
     * Appium/UiAutomator2 puts the useful diagnostic in that
     * body, so HTTP status must remain a normal Response.
     */
    let response = ureq::get(&url)
        .config()
        .http_status_as_error(false)
        .build()
        .call();

    let mut response = match response {
        Ok(response) => response,

        Err(error) => {
            let message = format!("Unable to request Appium page source: {error}");

            log_service::error("appium", &message);

            return Err(message);
        }
    };

    let status = response.status().as_u16();

    let body = response.body_mut().read_to_string().map_err(|error| {
        let message = format!("Unable to read Appium response body: {error}");

        log_service::error("appium", &message);
        message
    })?;

    if !(200..300).contains(&status) {
        let message = appium_error_message(status, &body);

        log_service::error("appium", &message);
        return Err(message);
    }

    let json: Value = serde_json::from_str(&body).map_err(|error| {
        let message = format!("Unable to decode Appium page source JSON: {error}");

        log_service::error("appium", &message);
        message
    })?;

    let xml = json
        .get("value")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            let message = "Appium page source response contains no XML".to_string();

            log_service::error("appium", &message);
            message
        })?;

    log_service::info(
        "appium",
        format!("Page source received successfully: {} bytes", xml.len()),
    );

    Ok(xml.to_string())
}

pub fn screenshot(session_id: &str) -> Result<String, String> {
    let url = format!(
        "{}/session/{session_id}/screenshot",
        runtime_config::appium_url()
    );

    log_service::info("appium", format!("GET /session/{session_id}/screenshot"));

    let response = ureq::get(&url).call();

    let mut response = match response {
        Ok(response) => response,

        Err(ureq::Error::StatusCode(code)) => {
            let message = format!("Appium screenshot request failed with HTTP {code}");

            log_service::error("appium", &message);
            return Err(message);
        }

        Err(error) => {
            let message = format!("Unable to request Appium screenshot: {error}");

            log_service::error("appium", &message);
            return Err(message);
        }
    };

    let body = response.body_mut().read_to_string().map_err(|error| {
        let message = format!("Unable to read screenshot response: {error}");

        log_service::error("appium", &message);
        message
    })?;

    let json: Value = serde_json::from_str(&body).map_err(|error| {
        let message = format!("Unable to decode screenshot response: {error}");

        log_service::error("appium", &message);
        message
    })?;

    json.get("value")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .ok_or_else(|| {
            let message = "Appium screenshot response contains no image".to_string();

            log_service::error("appium", &message);
            message
        })
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocatorTestResult {
    pub match_count: usize,
    pub element_id: Option<String>,
    pub bounds: Option<crate::models::spy::ElementBounds>,
}

pub fn test_locator_detail(
    session_id: &str,
    strategy: &str,
    selector: &str,
) -> Result<LocatorTestResult, String> {
    let using = appium_locator_using(strategy)?;

    let url = format!(
        "{}/session/{session_id}/elements",
        runtime_config::appium_url()
    );

    let payload = serde_json::json!({
        "using": using,
        "value": selector
    });

    let started = Instant::now();

    log_service::info("locator", format!("Testing locator detail [{strategy}]"));

    let response = ureq::post(&url)
        .config()
        .timeout_global(Some(LOCATOR_REQUEST_TIMEOUT))
        .build()
        .send_json(payload);

    let elapsed_ms = started.elapsed().as_millis();

    let mut response = match response {
        Ok(response) => response,

        Err(ureq::Error::StatusCode(code)) => {
            let message = format!("Locator detail returned HTTP {code} after {elapsed_ms}ms");

            log_service::error("locator", &message);
            return Err(message);
        }

        Err(error) => {
            let message = format!("Locator detail failed after {elapsed_ms}ms: {error}");

            log_service::error("locator", &message);
            return Err(message);
        }
    };

    let body: Value = response.body_mut().read_json().map_err(|error| {
        let message = format!("Unable to decode locator detail response ")
            + &format!("after {elapsed_ms}ms: {error}");

        log_service::error("locator", &message);
        message
    })?;

    let elements = body.get("value").and_then(Value::as_array).ok_or_else(|| {
        let message = format!("Locator detail response contains no ")
            + &format!("element array after {elapsed_ms}ms");

        log_service::error("locator", &message);
        message
    })?;

    let match_count = elements.len();

    if match_count != 1 {
        log_service::info(
            "locator",
            format!("Locator detail [{strategy}] -> ")
                + &format!("{match_count} match(es) in {elapsed_ms}ms"),
        );

        return Ok(LocatorTestResult {
            match_count,
            element_id: None,
            bounds: None,
        });
    }

    let element_id = element_id_from_value(&elements[0]).ok_or_else(|| {
        let message = "Unique locator match contains no Appium element id".to_string();

        log_service::error("locator", &message);
        message
    })?;

    let rect_url = format!(
        "{}/session/{session_id}/element/{element_id}/rect",
        runtime_config::appium_url()
    );

    let rect_response = ureq::get(&rect_url)
        .config()
        .timeout_global(Some(LOCATOR_REQUEST_TIMEOUT))
        .build()
        .call();

    let mut rect_response = match rect_response {
        Ok(response) => response,

        Err(ureq::Error::StatusCode(code)) => {
            let message = format!("Element rect returned HTTP {code}");

            log_service::error("locator", &message);
            return Err(message);
        }

        Err(error) => {
            let message = format!("Unable to request element rect: {error}");

            log_service::error("locator", &message);
            return Err(message);
        }
    };

    let rect_body: Value = rect_response.body_mut().read_json().map_err(|error| {
        let message = format!("Unable to decode element rect response: {error}");

        log_service::error("locator", &message);
        message
    })?;

    let rect = rect_body
        .get("value")
        .ok_or_else(|| "Element rect response contains no value".to_string())?;

    let number = |name: &str| -> Result<i32, String> {
        let value = rect
            .get(name)
            .and_then(Value::as_f64)
            .ok_or_else(|| format!("Element rect contains no numeric {name}"))?;

        if !value.is_finite() || value < i32::MIN as f64 || value > i32::MAX as f64 {
            return Err(format!("Element rect {name} is outside i32 range"));
        }

        Ok(value.round() as i32)
    };

    let bounds = crate::models::spy::ElementBounds {
        x: number("x")?,
        y: number("y")?,
        width: number("width")?.max(0),
        height: number("height")?.max(0),
    };

    log_service::info(
        "locator",
        format!("Locator detail [{strategy}] -> unique element ")
            + &format!(
                "{element_id} at {},{} {}x{}",
                bounds.x, bounds.y, bounds.width, bounds.height,
            ),
    );

    Ok(LocatorTestResult {
        match_count,
        element_id: Some(element_id),
        bounds: Some(bounds),
    })
}

pub fn locator_match_count(
    session_id: &str,
    strategy: &str,
    selector: &str,
) -> Result<usize, String> {
    let url = format!(
        "{}/session/{session_id}/elements",
        runtime_config::appium_url()
    );

    let using = match strategy {
        "accessibility-id" => "accessibility id",

        "id" => "id",

        "xpath" => "xpath",

        "android-uiautomator" => "-android uiautomator",

        "ios-predicate" => "-ios predicate string",

        "ios-class-chain" => "-ios class chain",

        other => {
            return Err(format!("Unsupported locator strategy: {other}"));
        }
    };

    let payload = serde_json::json!({
        "using": using,
        "value": selector
    });

    let started = Instant::now();

    log_service::info("locator", format!("Validating locator [{strategy}]"));

    /*
     * Locator validation is user-facing and must never
     * block the Inspector indefinitely.
     *
     * This timeout applies only to locator findElements
     * requests. Snapshot/source/screenshot operations use
     * their own lifecycle.
     */
    /*
     * Keep HTTP error responses readable.
     *
     * Appium/UiAutomator2 returns the useful WebDriver
     * diagnostic inside the response body. Treating HTTP
     * 4xx/5xx as a transport error would discard it.
     */
    let response = ureq::post(&url)
        .config()
        .timeout_global(Some(LOCATOR_REQUEST_TIMEOUT))
        .http_status_as_error(false)
        .build()
        .send_json(payload);

    let elapsed_ms = started.elapsed().as_millis();

    let mut response = match response {
        Ok(response) => response,

        Err(error) => {
            let message =
                format!("Locator validation transport failed after {elapsed_ms}ms: {error}");

            log_service::error("locator", &message);

            return Err(message);
        }
    };

    let status = response.status().as_u16();

    let body = response
        .body_mut()
        .read_to_string()
        .map_err(|error| {
            let message = format!(
                "Unable to read locator validation response after {elapsed_ms}ms: {error}"
            );

            log_service::error("locator", &message);

            message
        })?;

    if !(200..300).contains(&status) {
        let appium_message =
            appium_error_message(status, &body);

        let message =
            format!("{appium_message} after {elapsed_ms}ms");

        log_service::error("locator", &message);

        return Err(message);
    }

    let body: Value =
        serde_json::from_str(&body).map_err(|error| {
            let message = format!(
                "Unable to decode locator validation response after {elapsed_ms}ms: {error}"
            );

            log_service::error("locator", &message);

            message
        })?;

    let elements =
        body.get("value")
            .and_then(Value::as_array)
            .ok_or_else(|| {
                let message = format!(
                    "Locator validation response contains no element array after {elapsed_ms}ms"
                );

                log_service::error("locator", &message);

                message
            })?;

    let match_count = elements.len();

    log_service::info(
        "locator",
        format!("Locator [{strategy}] -> {match_count} match(es) in {elapsed_ms}ms"),
    );

    Ok(match_count)
}

pub fn tap(session_id: &str, x: i32, y: i32) -> Result<(), String> {
    let url = format!(
        "{}/session/{session_id}/actions",
        runtime_config::appium_url()
    );

    log_service::info("interaction", format!("Tap requested at ({x}, {y})"));

    let payload = serde_json::json!({
        "actions": [{
            "type": "pointer",
            "id": "finger1",
            "parameters": {
                "pointerType": "touch"
            },
            "actions": [
                {
                    "type": "pointerMove",
                    "duration": 0,
                    "x": x,
                    "y": y,
                    "origin": "viewport"
                },
                {
                    "type": "pointerDown",
                    "button": 0
                },
                {
                    "type": "pause",
                    "duration": 80
                },
                {
                    "type": "pointerUp",
                    "button": 0
                }
            ]
        }]
    });

    let response = ureq::post(&url).send_json(payload);

    match response {
        Ok(_) => {
            log_service::info("interaction", format!("Tap completed at ({x}, {y})"));

            Ok(())
        }

        Err(ureq::Error::StatusCode(code)) => {
            let message = format!("Appium tap returned HTTP {code}");

            log_service::error("interaction", &message);

            Err(message)
        }

        Err(error) => {
            let message = format!("Unable to execute tap: {error}");

            log_service::error("interaction", &message);

            Err(message)
        }
    }
}

pub fn android_navigation_key(session_id: &str, action: &str) -> Result<(), String> {
    let keycode = match action {
        "back" => 4,
        "home" => 3,
        "recents" => 187,

        other => {
            return Err(format!("Unsupported Android navigation action: {other}"));
        }
    };

    let url = format!(
        "{}/session/{session_id}/appium/device/press_keycode",
        runtime_config::appium_url()
    );

    log_service::info(
        "interaction",
        format!("Android navigation requested: {action} ({keycode})"),
    );

    let payload = serde_json::json!({
        "keycode": keycode,
        "metastate": 0,
        "flags": 0
    });

    match ureq::post(&url).send_json(payload) {
        Ok(_) => {
            log_service::info(
                "interaction",
                format!("Android navigation completed: {action}"),
            );

            Ok(())
        }

        Err(ureq::Error::StatusCode(code)) => {
            let message = format!("Android navigation {action} returned HTTP {code}");

            log_service::error("interaction", &message);

            Err(message)
        }

        Err(error) => {
            let message = format!("Unable to execute Android navigation {action}: {error}");

            log_service::error("interaction", &message);

            Err(message)
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidAppContext {
    pub package: String,
    pub activity: String,
}

fn appium_string_value(session_id: &str, endpoint: &str) -> Result<String, String> {
    let url = format!(
        "{}/session/{session_id}/{endpoint}",
        runtime_config::appium_url()
    );

    let mut response = ureq::get(&url)
        .call()
        .map_err(|error| format!("Unable to request Appium {endpoint}: {error}"))?;

    let body: Value = response
        .body_mut()
        .read_json()
        .map_err(|error| format!("Unable to decode Appium {endpoint}: {error}"))?;

    body.get("value")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| format!("Appium {endpoint} response has no string value"))
}

pub fn android_current_context(session_id: &str) -> Result<AndroidAppContext, String> {
    let package = appium_string_value(session_id, "appium/device/current_package")?;

    let activity = appium_string_value(session_id, "appium/device/current_activity")?;

    log_service::info(
        "interaction",
        format!("Foreground Android context: {package} / {activity}"),
    );

    Ok(AndroidAppContext { package, activity })
}

pub fn activate_android_app(session_id: &str, package: &str) -> Result<(), String> {
    if package.trim().is_empty() {
        return Err("Cannot activate Android app: empty package".to_string());
    }

    let url = format!(
        "{}/session/{session_id}/appium/device/activate_app",
        runtime_config::appium_url()
    );

    log_service::info(
        "interaction",
        format!("Returning to application: {package}"),
    );

    let payload = serde_json::json!({
        "appId": package
    });

    ureq::post(&url).send_json(payload).map_err(|error| {
        let message = format!("Unable to activate Android app {package}: {error}");

        log_service::error("interaction", &message);

        message
    })?;

    log_service::info("interaction", format!("Application activated: {package}"));

    Ok(())
}

pub fn swipe_session(
    session_id: &str,
    start_x: i32,
    start_y: i32,
    end_x: i32,
    end_y: i32,
    duration_ms: u64,
) -> Result<(), String> {
    let url = format!(
        "{}/session/{session_id}/actions",
        runtime_config::appium_url()
    );

    log_service::info(
        "interaction",
        format!("Swipe requested: ({start_x},{start_y}) -> ({end_x},{end_y}), {duration_ms}ms"),
    );

    let payload = serde_json::json!({
        "actions": [{
            "type": "pointer",
            "id": "finger1",
            "parameters": {
                "pointerType": "touch"
            },
            "actions": [
                {
                    "type": "pointerMove",
                    "duration": 0,
                    "x": start_x,
                    "y": start_y,
                    "origin": "viewport"
                },
                {
                    "type": "pointerDown",
                    "button": 0
                },
                {
                    "type": "pointerMove",
                    "duration": duration_ms,
                    "x": end_x,
                    "y": end_y,
                    "origin": "viewport"
                },
                {
                    "type": "pointerUp",
                    "button": 0
                }
            ]
        }]
    });

    ureq::post(&url).send_json(payload).map_err(|error| {
        let message = format!("Unable to execute swipe: {error}");

        log_service::error("interaction", &message);

        message
    })?;

    log_service::info("interaction", "Swipe completed");

    Ok(())
}

pub fn terminate_android_app(session_id: &str, package_name: &str) -> Result<(), String> {
    let url = format!(
        "{}/session/{session_id}/appium/device/terminate_app",
        runtime_config::appium_url()
    );

    crate::services::log_service::info(
        "interaction",
        format!("Terminating AUT package: {package_name}"),
    );

    let payload = serde_json::json!({
        "appId": package_name
    });

    ureq::post(&url).send_json(payload).map_err(|error| {
        format!(
            "Unable to terminate Android application \
                 {package_name}: {error}"
        )
    })?;

    Ok(())
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocatorClickResult {
    pub strategy: String,
    pub value: String,
    pub element_id: String,
}

fn appium_locator_using(strategy: &str) -> Result<&'static str, String> {
    match strategy.trim().to_ascii_lowercase().as_str() {
        "id" => Ok("id"),
        "xpath" => Ok("xpath"),

        "accessibility-id" | "accessibility id" | "accessibility_id" => Ok("accessibility id"),

        "android-uiautomator" | "android uiautomator" | "-android uiautomator" => {
            Ok("-android uiautomator")
        }

        other => Err(format!("Unsupported Appium locator strategy: {other}")),
    }
}

fn element_id_from_value(value: &serde_json::Value) -> Option<String> {
    value
        .get("element-6066-11e4-a52e-4f735466cecf")
        .or_else(|| value.get("ELEMENT"))
        .and_then(serde_json::Value::as_str)
        .map(ToString::to_string)
}

pub fn click_locator(
    session_id: &str,
    strategy: &str,
    locator: &str,
) -> Result<LocatorClickResult, String> {
    let using = appium_locator_using(strategy)?;

    let find_url = format!(
        "{}/session/{session_id}/element",
        runtime_config::appium_url()
    );

    let response = ureq::post(&find_url)
        .send_json(serde_json::json!({
            "using": using,
            "value": locator,
        }))
        .map_err(|error| format!("Unable to resolve locator {strategy}={locator}: {error}"))?;

    let body: serde_json::Value = response
        .into_body()
        .read_json()
        .map_err(|error| format!("Unable to decode Appium element response: {error}"))?;

    let element = body
        .get("value")
        .ok_or_else(|| format!("Appium returned no element for {strategy}={locator}"))?;

    let element_id = element_id_from_value(element)
        .ok_or_else(|| format!("Appium response has no element id for {strategy}={locator}"))?;

    let click_url = format!(
        "{}/session/{session_id}/element/{element_id}/click",
        runtime_config::appium_url()
    );

    ureq::post(&click_url)
        .send_json(serde_json::json!({}))
        .map_err(|error| format!("Unable to click Appium element {strategy}={locator}: {error}"))?;

    Ok(LocatorClickResult {
        strategy: strategy.to_string(),
        value: locator.to_string(),
        element_id,
    })
}

pub fn click_element_by_id(session_id: &str, element_id: &str) -> Result<(), String> {
    if session_id.trim().is_empty() {
        return Err("Cannot click element without Appium session".to_string());
    }

    if element_id.trim().is_empty() {
        return Err("Cannot click element without element id".to_string());
    }

    let url = format!(
        "{}/session/{session_id}/element/{element_id}/click",
        runtime_config::appium_url(),
    );

    log_service::info(
        "interaction",
        format!("Element click requested: {element_id}"),
    );

    match ureq::post(&url).send_json(serde_json::json!({})) {
        Ok(_) => {
            log_service::info(
                "interaction",
                format!("Element click completed: {element_id}"),
            );

            Ok(())
        }

        Err(ureq::Error::StatusCode(code)) => {
            let message = format!("Appium element click returned HTTP {code}");

            log_service::error("interaction", &message);

            Err(message)
        }

        Err(error) => {
            let message = format!("Unable to execute element click: {error}");

            log_service::error("interaction", &message);

            Err(message)
        }
    }
}

/*
 * Lightweight AUT foreground guard.
 *
 * Inspector snapshot validation only needs package identity.
 * Do not pay for current_activity when the caller does not
 * consume it.
 */
pub fn android_current_package(session_id: &str) -> Result<String, String> {
    appium_string_value(session_id, "appium/device/current_package")
}

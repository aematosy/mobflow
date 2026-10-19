use serde_json::Value;

use crate::{
    models::spy::MobileElementSnapshot,
    services::{log_service, runtime_config},
};

/*
 * Element Input Service
 * =====================
 *
 * Owns semantic text-entry interactions with live Appium
 * elements.
 *
 * Snapshot ids such as "android-33" are NOT Appium element
 * references. Every operation resolves the target against the
 * active session using a verified semantic locator.
 *
 * This service deliberately contains no application-specific
 * widget names, ids, text values or coordinates.
 */

fn appium_locator_using(strategy: &str) -> Result<&'static str, String> {
    match strategy.trim().to_ascii_lowercase().as_str() {
        "id" => Ok("id"),
        "xpath" => Ok("xpath"),
        "accessibility-id" | "accessibility id" | "accessibility_id" => {
            Ok("accessibility id")
        }
        "android-uiautomator" | "android uiautomator" | "-android uiautomator" => {
            Ok("-android uiautomator")
        }
        other => Err(format!(
            "Unsupported Appium locator strategy for input: {other}"
        )),
    }
}

fn element_id_from_value(value: &Value) -> Option<String> {
    value
        .get("element-6066-11e4-a52e-4f735466cecf")
        .or_else(|| value.get("ELEMENT"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
}

/*
 * Lightweight live target resolution for Interact.
 *
 * This is deliberately independent from Locator Intelligence.
 * Text entry must not trigger contextual locator analysis,
 * scoring or template generation.
 *
 * Every candidate is accepted only when Appium resolves
 * exactly one live element.
 */
fn native_candidates(
    target: &MobileElementSnapshot,
) -> Vec<(&'static str, String)> {
    let mut candidates = Vec::new();

    if let Some(resource_id) = target
        .resource_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        candidates.push((
            "id",
            resource_id.to_string(),
        ));
    }

    if let Some(accessibility_id) = target
        .accessibility_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        candidates.push((
            "accessibility-id",
            accessibility_id.to_string(),
        ));
    }

    if let Some(text) = target
        .text
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        let escaped = text
            .replace('\\', "\\\\")
            .replace('"', "\\\"");

        candidates.push((
            "android-uiautomator",
            format!(
                "new UiSelector().text(\"{escaped}\")"
            ),
        ));
    }

    candidates
}

fn resolve_unique_candidate(
    session_id: &str,
    strategy: &str,
    selector: &str,
) -> Result<Option<String>, String> {
    let using =
        appium_locator_using(strategy)?;

    let url = format!(
        "{}/session/{session_id}/elements",
        runtime_config::appium_url(),
    );

    let response = ureq::post(&url)
        .send_json(serde_json::json!({
            "using": using,
            "value": selector,
        }))
        .map_err(|error| {
            format!(
                "Unable to resolve editable target using {strategy}: {error}"
            )
        })?;

    let body: Value = response
        .into_body()
        .read_json()
        .map_err(|error| {
            format!(
                "Unable to decode editable target response: {error}"
            )
        })?;

    let elements = body
        .get("value")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            "Editable target response contains no element array"
                .to_string()
        })?;

    if elements.len() != 1 {
        log_service::info(
            "interaction",
            format!(
                "Editable candidate [{strategy}] resolved {} elements",
                elements.len(),
            ),
        );

        return Ok(None);
    }

    let element_id =
        element_id_from_value(&elements[0])
            .ok_or_else(|| {
                "Unique editable target contains no Appium element id"
                    .to_string()
            })?;

    Ok(Some(element_id))
}

fn resolve_element_id(
    session_id: &str,
    target: &MobileElementSnapshot,
) -> Result<String, String> {
    if session_id.trim().is_empty() {
        return Err(
            "Cannot resolve editable element without Appium session"
                .to_string(),
        );
    }

    if !target.editable {
        return Err(format!(
            "Element {} is not editable according to the live hierarchy",
            target.id
        ));
    }

    if !target.enabled || !target.displayed {
        return Err(format!(
            "Editable element {} is not currently actionable",
            target.id
        ));
    }

    let candidates =
        native_candidates(target);

    if candidates.is_empty() {
        return Err(format!(
            "Editable target {} has no native semantic identity",
            target.id
        ));
    }

    for (strategy, selector) in candidates {
        log_service::info(
            "interaction",
            format!(
                "Resolving editable target {} using {}",
                target.id,
                strategy,
            ),
        );

        if let Some(element_id) =
            resolve_unique_candidate(
                session_id,
                strategy,
                &selector,
            )?
        {
            log_service::info(
                "interaction",
                format!(
                    "Editable target {} resolved uniquely using {}",
                    target.id,
                    strategy,
                ),
            );

            return Ok(element_id);
        }
    }

    Err(format!(
        "Editable target {} could not be resolved uniquely",
        target.id
    ))
}

pub fn type_text(
    session_id: &str,
    target: &MobileElementSnapshot,
    text: &str,
) -> Result<(), String> {
    if text.is_empty() {
        return Err("Cannot type empty text".to_string());
    }

    let element_id =
        resolve_element_id(session_id, target)?;

    let url = format!(
        "{}/session/{session_id}/element/{element_id}/value",
        runtime_config::appium_url(),
    );

    log_service::info(
        "interaction",
        format!(
            "Typing text into editable target {}",
            target.id
        ),
    );

    /*
     * W3C/Appium accepts `text`; `value` is also supplied for
     * compatibility with drivers that still consume the
     * character-array representation.
     */
    let value = text
        .chars()
        .map(|character| character.to_string())
        .collect::<Vec<_>>();

    ureq::post(&url)
        .send_json(serde_json::json!({
            "text": text,
            "value": value,
        }))
        .map_err(|error| {
            format!(
                "Unable to type into editable target {}: {error}",
                target.id
            )
        })?;

    log_service::info(
        "interaction",
        format!(
            "Text entry completed for target {}",
            target.id
        ),
    );

    Ok(())
}

pub fn clear_text(
    session_id: &str,
    target: &MobileElementSnapshot,
) -> Result<(), String> {
    let element_id =
        resolve_element_id(session_id, target)?;

    let url = format!(
        "{}/session/{session_id}/element/{element_id}/clear",
        runtime_config::appium_url(),
    );

    log_service::info(
        "interaction",
        format!(
            "Clearing editable target {}",
            target.id
        ),
    );

    ureq::post(&url)
        .send_json(serde_json::json!({}))
        .map_err(|error| {
            format!(
                "Unable to clear editable target {}: {error}",
                target.id
            )
        })?;

    log_service::info(
        "interaction",
        format!(
            "Editable target cleared: {}",
            target.id
        ),
    );

    Ok(())
}

pub fn hide_android_keyboard(
    session_id: &str,
) -> Result<(), String> {
    if session_id.trim().is_empty() {
        return Err(
            "Cannot hide keyboard without Appium session"
                .to_string(),
        );
    }

    let url = format!(
        "{}/session/{session_id}/appium/device/hide_keyboard",
        runtime_config::appium_url(),
    );

    log_service::info(
        "interaction",
        "Hide Android keyboard requested",
    );

    ureq::post(&url)
        .send_json(serde_json::json!({}))
        .map_err(|error| {
            format!("Unable to hide Android keyboard: {error}")
        })?;

    log_service::info(
        "interaction",
        "Android keyboard hidden",
    );

    Ok(())
}

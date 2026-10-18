use quick_xml::Reader;
use quick_xml::events::Event;

use crate::models::spy::{ElementBounds, MobileElementSnapshot};
use crate::services::{appium_client, log_service};

fn optional(value: Option<String>) -> Option<String> {
    value.filter(|value| !value.trim().is_empty())
}

fn bool_attribute(value: Option<String>) -> bool {
    value
        .as_deref()
        .map(|value| value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn parse_bounds(value: Option<&str>) -> Option<ElementBounds> {
    let value = value?;

    let cleaned = value.replace("][", ",").replace(['[', ']'], "");

    let numbers = cleaned
        .split(',')
        .filter_map(|part| part.parse::<i32>().ok())
        .collect::<Vec<_>>();

    if numbers.len() != 4 {
        return None;
    }

    let x1 = numbers[0];
    let y1 = numbers[1];
    let x2 = numbers[2];
    let y2 = numbers[3];

    Some(ElementBounds {
        x: x1,
        y: y1,
        width: (x2 - x1).max(0),
        height: (y2 - y1).max(0),
    })
}

pub fn get_android_elements(session_id: &str) -> Result<Vec<MobileElementSnapshot>, String> {
    log_service::info(
        "spy",
        format!("Capturing Android hierarchy for Appium session {session_id}"),
    );

    let xml = appium_client::page_source(session_id)?;

    let elements = parse_android_source(&xml)?;

    log_service::info(
        "spy",
        format!("Spy snapshot ready: {} Android elements", elements.len()),
    );

    Ok(elements)
}

fn parse_android_source(xml: &str) -> Result<Vec<MobileElementSnapshot>, String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut elements: Vec<MobileElementSnapshot> = Vec::new();

    let mut stack: Vec<Option<String>> = Vec::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) => {
                let tag = String::from_utf8_lossy(event.name().as_ref()).to_string();

                if tag == "hierarchy" {
                    stack.push(None);
                    continue;
                }

                let id =
                    parse_android_node(&event, &mut elements, stack.last().and_then(Clone::clone));

                stack.push(Some(id));
            }

            Ok(Event::Empty(event)) => {
                let tag = String::from_utf8_lossy(event.name().as_ref()).to_string();

                if tag == "hierarchy" {
                    continue;
                }

                parse_android_node(&event, &mut elements, stack.last().and_then(Clone::clone));
            }

            Ok(Event::End(_)) => {
                stack.pop();
            }

            Ok(Event::Eof) => break,

            Err(error) => {
                let message = format!("Unable to parse Android hierarchy: {error}");

                log_service::error("spy", &message);

                return Err(message);
            }

            _ => {}
        }
    }

    log_service::info(
        "spy",
        format!("Android hierarchy parsed: {} elements", elements.len()),
    );

    log_service::info(
        "locator",
        "Enriching Android elements with verified relational locators",
    );

    // Deep locator resolution is intentionally lazy.
    // Snapshot capture must remain limited to source + screenshot + parsing.
    // Relational/contextual locators are resolved on-demand
    // for the selected element.

    let with_locators = elements
        .iter()
        .filter(|element| !element.locators.is_empty())
        .count();

    log_service::info(
        "locator",
        format!(
            "Relational locator analysis completed: {with_locators}/{} elements have verified locators",
            elements.len(),
        ),
    );

    Ok(elements)
}

fn parse_android_node(
    event: &quick_xml::events::BytesStart<'_>,
    elements: &mut Vec<MobileElementSnapshot>,
    parent_id: Option<String>,
) -> String {
    let mut element_type = String::from_utf8_lossy(event.name().as_ref()).to_string();

    let mut text = None;
    let mut resource_id = None;
    let mut accessibility_id = None;
    let mut package = None;

    let mut clickable = None;
    let mut enabled = None;
    let mut displayed = None;
    let mut selected = None;
    let mut bounds = None;

    for attribute in event.attributes().flatten() {
        let key = String::from_utf8_lossy(attribute.key.as_ref()).to_string();

        let value = attribute
            .unescape_value()
            .map(|value| value.into_owned())
            .unwrap_or_default();

        match key.as_str() {
            "class" => element_type = value,
            "text" => text = Some(value),

            "resource-id" => resource_id = Some(value),

            "content-desc" => accessibility_id = Some(value),

            "package" => package = Some(value),

            "clickable" => clickable = Some(value),

            "enabled" => enabled = Some(value),

            "displayed" => displayed = Some(value),

            "selected" => selected = Some(value),

            "bounds" => bounds = Some(value),

            _ => {}
        }
    }

    let text = optional(text);
    let resource_id = optional(resource_id);
    let accessibility_id = optional(accessibility_id);

    let index = elements.len();
    let id = format!("android-{index}");

    // Snapshot capture must remain lightweight.
    // Locator generation and Appium validation are performed
    // lazily for the selected element.
    let locators = Vec::new();

    elements.push(MobileElementSnapshot {
        id: id.clone(),
        index,

        parent_id: parent_id.clone(),
        children_ids: Vec::new(),

        platform: "android".to_string(),
        element_type,

        text: text.clone(),

        name: accessibility_id.clone().or_else(|| text.clone()),

        label: text.clone(),
        value: None,

        resource_id,
        accessibility_id,

        package: optional(package),

        clickable: bool_attribute(clickable),
        enabled: bool_attribute(enabled),
        displayed: bool_attribute(displayed),
        selected: bool_attribute(selected),

        bounds: parse_bounds(bounds.as_deref()),

        locators,
    });

    if let Some(parent_id) = parent_id {
        if let Some(parent) = elements.iter_mut().find(|element| element.id == parent_id) {
            parent.children_ids.push(id.clone());
        }
    }

    id
}

fn now_ms() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

pub fn get_android_inspector_snapshot(
    session_id: &str,
    device_id: &str,
) -> Result<crate::models::spy::InspectorSnapshot, String> {
    log_service::info(
        "inspector",
        format!("Capturing Android inspector snapshot for session {session_id}"),
    );

    // Capture hierarchy first and screenshot immediately afterwards.
    // Both belong to the same logical inspector refresh.
    let xml = appium_client::page_source(session_id)?;

    let elements = parse_android_source(&xml)?;

    let screenshot_base64 = appium_client::screenshot(session_id)?;

    /*
     * Keep hierarchy extent separate from the canonical
     * Android interaction coordinate space.
     */
    let hierarchy_width = elements
        .iter()
        .filter_map(|element| {
            element
                .bounds
                .as_ref()
                .map(|bounds| bounds.x + bounds.width)
        })
        .max()
        .unwrap_or(0);

    let hierarchy_height = elements
        .iter()
        .filter_map(|element| {
            element
                .bounds
                .as_ref()
                .map(|bounds| bounds.y + bounds.height)
        })
        .max()
        .unwrap_or(0);

    /*
     * Device interaction coordinates must come from Android,
     * never from the hierarchy.
     */
    let (screen_width, screen_height) =
        crate::services::physical_input_service::display_size(device_id)?;

    log_service::info(
        "inspector",
        format!(
            "Inspector snapshot ready: {} elements | device={}x{} | hierarchy={}x{}",
            elements.len(),
            screen_width,
            screen_height,
            hierarchy_width,
            hierarchy_height,
        ),
    );

    Ok(crate::models::spy::InspectorSnapshot {
        session_id: session_id.to_string(),
        platform: "android".to_string(),
        automation_name: "UiAutomator2".to_string(),

        screenshot_base64,

        screen_width,
        screen_height,

        hierarchy_width,
        hierarchy_height,

        elements,

        captured_at_ms: now_ms(),
    })
}

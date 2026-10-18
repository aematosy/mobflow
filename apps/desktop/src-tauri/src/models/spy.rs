use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocatorCandidate {
    pub strategy: String,
    pub value: String,
    pub score: u8,
    pub recommended: bool,
    pub reason: String,
    pub match_count: Option<usize>,
    pub unique: bool,
    pub stable: bool,
    pub category: String,

    /*
     * Optional reusable locator metadata.
     *
     * value              -> concrete locator verified against Appium
     * template           -> reusable locator template
     * parameter_name     -> semantic parameter expected by template
     * parameter_example  -> concrete value used during verification
     */
    pub template: Option<String>,
    pub parameter_name: Option<String>,
    pub parameter_example: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileElementSnapshot {
    pub id: String,
    pub index: usize,

    pub parent_id: Option<String>,
    pub children_ids: Vec<String>,

    pub platform: String,
    pub element_type: String,

    pub text: Option<String>,
    pub name: Option<String>,
    pub label: Option<String>,
    pub value: Option<String>,

    pub resource_id: Option<String>,
    pub accessibility_id: Option<String>,
    pub package: Option<String>,

    pub clickable: bool,
    pub enabled: bool,
    pub displayed: bool,
    pub selected: bool,

    pub bounds: Option<ElementBounds>,

    pub locators: Vec<LocatorCandidate>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectorSnapshot {
    pub session_id: String,
    pub platform: String,
    pub automation_name: String,

    pub screenshot_base64: String,

    /*
     * Canonical Android interaction coordinate space.
     * Sourced from `adb shell wm size`.
     */
    pub screen_width: i32,
    pub screen_height: i32,

    /*
     * Coordinate extent reported by the UiAutomator2
     * hierarchy. This is NOT assumed to equal the physical
     * Android display.
     */
    pub hierarchy_width: i32,
    pub hierarchy_height: i32,

    pub elements: Vec<MobileElementSnapshot>,

    pub captured_at_ms: u128,
}

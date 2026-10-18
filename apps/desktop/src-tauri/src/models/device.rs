use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Platform {
    Android,
    Ios,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DeviceKind {
    Physical,
    Emulator,
    Simulator,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    // Runtime identity:
    // emulator-5554, physical UDID, simulator UDID, etc.
    pub id: String,

    // Stable TestFlow identity:
    // Pixel_7, Pixel_10_Pro, iOS simulator UDID, physical UDID.
    pub logical_id: String,

    // Human-readable display name.
    pub name: String,

    pub platform: Platform,
    pub kind: DeviceKind,
    pub os_version: Option<String>,
    pub state: String,
    pub available: bool,

    // Underlying hardware/runtime model when available.
    pub model: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInventory {
    pub android: Vec<Device>,
    pub ios: Vec<Device>,
}

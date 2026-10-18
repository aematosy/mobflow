use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub name: String,
    pub installed: bool,
    pub version: Option<String>,
    pub path: Option<String>,
    pub required: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentStatus {
    pub operating_system: String,
    pub architecture: String,
    pub appium: ToolStatus,
    pub adb: ToolStatus,
    pub android_sdk: ToolStatus,
    pub xcode: ToolStatus,
    pub maestro: ToolStatus,
}

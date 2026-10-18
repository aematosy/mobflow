use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceStreamSession {
    pub id: String,
    pub device_id: String,
    pub platform: String,
    pub provider: String,
    pub state: String,
    pub message: Option<String>,
}

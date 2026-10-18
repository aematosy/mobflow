use std::sync::{OnceLock, RwLock};

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppiumRuntimeConfig {
    pub host: String,
    pub port: u16,
    pub base_path: String,
    pub capabilities: Vec<AppiumCapability>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppiumCapability {
    pub key: String,
    pub value: Value,
}

impl Default for AppiumRuntimeConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 4723,
            base_path: "/".to_string(),
            capabilities: Vec::new(),
        }
    }
}

static APPIUM_CONFIG: OnceLock<RwLock<AppiumRuntimeConfig>> = OnceLock::new();

fn store() -> &'static RwLock<AppiumRuntimeConfig> {
    APPIUM_CONFIG.get_or_init(|| RwLock::new(AppiumRuntimeConfig::default()))
}

fn normalize_base_path(value: &str) -> String {
    let trimmed = value.trim();

    if trimmed.is_empty() || trimmed == "/" {
        return "/".to_string();
    }

    let with_leading = if trimmed.starts_with('/') {
        trimmed.to_string()
    } else {
        format!("/{trimmed}")
    };

    with_leading.trim_end_matches('/').to_string()
}

pub fn get_appium_config() -> AppiumRuntimeConfig {
    store()
        .read()
        .map(|config| config.clone())
        .unwrap_or_default()
}

const PROTECTED_CAPABILITIES: &[&str] = &[
    "platformName",
    "appium:automationName",
    "appium:udid",
    "appium:deviceName",
    "appium:appPackage",
    "appium:appActivity",
];

fn validate_capabilities(capabilities: &[AppiumCapability]) -> Result<(), String> {
    let mut seen = std::collections::HashSet::new();

    for capability in capabilities {
        let key = capability.key.trim();

        if key.is_empty() {
            return Err("Capability key cannot be empty".to_string());
        }

        if PROTECTED_CAPABILITIES.contains(&key) {
            return Err(format!("Capability '{key}' is managed by MobFlow"));
        }

        if !seen.insert(key.to_string()) {
            return Err(format!("Duplicate capability: {key}"));
        }
    }

    Ok(())
}

pub fn set_appium_config(
    host: String,
    port: u16,
    base_path: String,
    capabilities: Vec<AppiumCapability>,
) -> Result<AppiumRuntimeConfig, String> {
    let host = host.trim().to_string();

    if host.is_empty() {
        return Err("Appium host cannot be empty".to_string());
    }

    if port == 0 {
        return Err("Appium port must be greater than 0".to_string());
    }

    validate_capabilities(&capabilities)?;

    let next = AppiumRuntimeConfig {
        host,
        port,
        base_path: normalize_base_path(&base_path),
        capabilities,
    };

    let mut config = store()
        .write()
        .map_err(|_| "Unable to acquire Appium runtime configuration".to_string())?;

    *config = next.clone();

    Ok(next)
}

pub fn appium_url() -> String {
    let config = get_appium_config();

    let root = format!("http://{}:{}", config.host, config.port,);

    if config.base_path == "/" {
        root
    } else {
        format!("{root}{}", config.base_path)
    }
}

pub fn appium_status_url() -> String {
    format!("{}/status", appium_url())
}

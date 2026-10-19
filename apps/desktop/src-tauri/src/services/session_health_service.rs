use serde::Serialize;
use serde_json::Value;

use crate::services::{
    log_service,
    runtime_config,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionHealth {
    pub session_id: String,
    pub alive: bool,
    pub automation_name: Option<String>,
    pub platform_name: Option<String>,
}

fn capability_string(
    value: &Value,
    key: &str,
) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
}

pub fn check_session(
    session_id: &str,
) -> Result<SessionHealth, String> {
    let session_id = session_id.trim();

    if session_id.is_empty() {
        return Ok(SessionHealth {
            session_id: String::new(),
            alive: false,
            automation_name: None,
            platform_name: None,
        });
    }

    let url = format!(
        "{}/session/{session_id}",
        runtime_config::appium_url(),
    );

    log_service::info(
        "session",
        format!(
            "Checking Appium session health: {session_id}"
        ),
    );

    let mut response = match ureq::get(&url).call() {
        Ok(response) => response,

        Err(ureq::Error::StatusCode(404)) => {
            log_service::error(
                "session",
                format!(
                    "Appium session lost: {session_id}"
                ),
            );

            return Ok(SessionHealth {
                session_id: session_id.to_string(),
                alive: false,
                automation_name: None,
                platform_name: None,
            });
        }

        Err(ureq::Error::StatusCode(code)) => {
            let message = format!(
                "Unable to check Appium session \
                 {session_id}: HTTP {code}"
            );

            log_service::error(
                "session",
                &message,
            );

            return Err(message);
        }

        Err(error) => {
            let message = format!(
                "Unable to check Appium session \
                 {session_id}: {error}"
            );

            log_service::error(
                "session",
                &message,
            );

            return Err(message);
        }
    };

    let body: Value =
        response
            .body_mut()
            .read_json()
            .map_err(|error| {
                let message = format!(
                    "Unable to decode Appium session health \
                     response for {session_id}: {error}"
                );

                log_service::error(
                    "session",
                    &message,
                );

                message
            })?;

    let value =
        body.get("value").unwrap_or(&body);

    /*
     * W3C GET /session/{id} returns the current session
     * capabilities when the session is alive.
     *
     * Health is intentionally independent from AUT ownership.
     * The application may crash or leave foreground while the
     * underlying Appium session remains perfectly healthy.
     */
    let automation_name =
        capability_string(
            value,
            "appium:automationName",
        )
        .or_else(|| {
            capability_string(
                value,
                "automationName",
            )
        });

    let platform_name =
        capability_string(
            value,
            "platformName",
        );

    log_service::info(
        "session",
        format!(
            "Appium session healthy: {session_id}"
        ),
    );

    Ok(SessionHealth {
        session_id: session_id.to_string(),
        alive: true,
        automation_name,
        platform_name,
    })
}

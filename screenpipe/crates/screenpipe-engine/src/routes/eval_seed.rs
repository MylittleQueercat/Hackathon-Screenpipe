// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! Eval harness only: write synthetic history through the same DB calls as
//! capture. `/add` encodes one image per frame and stores its text as OCR, so
//! seeded work would be missing from `content_type=accessibility`.
//! Answers 404 unless the engine runs with `SCREENPIPE_EVAL_SEED=1`.

use crate::server::AppState;
use axum::{extract::State, http::StatusCode, Json};
use chrono::{DateTime, Utc};
use screenpipe_db::{InsertUiEvent, UiEventType};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;

type ApiError = (StatusCode, Json<Value>);

#[derive(Deserialize)]
pub(crate) struct SeedFrame {
    timestamp: DateTime<Utc>,
    app_name: String,
    window_name: String,
    browser_url: Option<String>,
    #[serde(default = "focused")]
    focused: bool,
    capture_trigger: String,
    accessibility_text: String,
    #[serde(default)]
    events: Vec<SeedEvent>,
}

fn focused() -> bool {
    true
}

#[derive(Deserialize)]
pub(crate) struct SeedEvent {
    timestamp: DateTime<Utc>,
    event_type: String,
    element_role: Option<String>,
    element_name: Option<String>,
    element_value: Option<String>,
    text_content: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct SeedRequest {
    device_name: String,
    snapshot_path: String,
    frames: Vec<SeedFrame>,
}

fn error(status: StatusCode, message: String) -> ApiError {
    (status, Json(json!({ "error": message })))
}

pub(crate) async fn seed(
    State(state): State<Arc<AppState>>,
    Json(request): Json<SeedRequest>,
) -> Result<Json<Value>, ApiError> {
    if std::env::var("SCREENPIPE_EVAL_SEED").as_deref() != Ok("1") {
        return Err(error(StatusCode::NOT_FOUND, "not found".into()));
    }
    let mut frame_ids = Vec::with_capacity(request.frames.len());
    let mut events = Vec::new();
    for frame in &request.frames {
        let frame_id = state
            .db
            .insert_snapshot_frame(
                &request.device_name,
                frame.timestamp,
                &request.snapshot_path,
                Some(&frame.app_name),
                Some(&frame.window_name),
                frame.browser_url.as_deref(),
                frame.focused,
                Some(&frame.capture_trigger),
                Some(&frame.accessibility_text),
                Some("accessibility"),
                None,
                None,
                None,
            )
            .await
            .map_err(|e| error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        frame_ids.push(frame_id);
        for event in &frame.events {
            let event_type: UiEventType = event
                .event_type
                .parse()
                .map_err(|_| error(StatusCode::BAD_REQUEST, format!("event_type {}", event.event_type)))?;
            events.push(InsertUiEvent {
                timestamp: event.timestamp,
                session_id: None,
                relative_ms: 0,
                event_type,
                x: None,
                y: None,
                delta_x: None,
                delta_y: None,
                button: None,
                click_count: None,
                key_code: None,
                modifiers: None,
                text_content: event.text_content.clone(),
                app_name: Some(frame.app_name.clone()),
                app_pid: None,
                window_title: Some(frame.window_name.clone()),
                browser_url: frame.browser_url.clone(),
                element_role: event.element_role.clone(),
                element_name: event.element_name.clone(),
                element_value: event.element_value.clone(),
                element_description: None,
                element_automation_id: None,
                element_bounds: None,
                element_ancestors: None,
                frame_id: Some(frame_id),
            });
        }
    }
    let event_ids = state
        .db
        .insert_ui_events_batch(&events)
        .await
        .map_err(|e| error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(json!({ "frames": frame_ids, "events": event_ids.len() })))
}

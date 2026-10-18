// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
};
use screenpipe_audio::audio_manager::AudioManagerBuilder;
use screenpipe_core::workflows::workspace;
use screenpipe_db::DatabaseManager;
use screenpipe_engine::SCServer;
use serde_json::{json, Value};
use std::{net::SocketAddr, sync::Arc};
use tower::ServiceExt;

async fn call(router: &axum::Router, method: &str, path: &str, body: Option<Value>) -> Value {
    let request = Request::builder()
        .method(method)
        .uri(path)
        .header("Authorization", "Bearer workflow-test-key")
        .header("Content-Type", "application/json")
        .body(body.map_or_else(Body::empty, |b| Body::from(b.to_string())))
        .unwrap();
    let response = router.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    serde_json::from_slice(&to_bytes(response.into_body(), 4 << 20).await.unwrap()).unwrap()
}

async fn frame_at(db: &DatabaseManager, at: chrono::DateTime<chrono::Utc>) {
    db.insert_frame(
        "fixture-monitor",
        Some(at),
        None,
        Some("Editor"),
        Some("notes.txt"),
        true,
        Some(0),
    )
    .await
    .unwrap();
}

#[tokio::test]
async fn workflow_discover_waits_until_something_new_is_recorded() {
    let dir = tempfile::tempdir().unwrap();
    let db = Arc::new(
        DatabaseManager::new(
            dir.path().join("db.sqlite").to_str().unwrap(),
            Default::default(),
        )
        .await
        .unwrap(),
    );
    db.insert_video_chunk("fixture.mp4", "fixture-monitor")
        .await
        .unwrap();
    let through = chrono::Utc::now() - chrono::Duration::hours(2);
    frame_at(&db, through - chrono::Duration::minutes(5)).await;
    let audio = Arc::new(
        AudioManagerBuilder::new()
            .is_disabled(true)
            .output_path(dir.path().join("audio"))
            .build(db.clone())
            .await
            .unwrap(),
    );
    let mut server = SCServer::new(
        db.clone(),
        SocketAddr::from(([127, 0, 0, 1], 0)),
        dir.path().to_path_buf(),
        true,
        true,
        audio,
        false,
        "balanced".into(),
    );
    server.workflow_catalog_dir = Some(dir.path().join("workflows"));
    server.api_auth = true;
    server.api_auth_key = Some("workflow-test-key".into());
    let router = server.try_create_router().await.unwrap();

    // The last cycle completed and checked through `through`.
    let mut ws = workspace::empty();
    workspace::start(&mut ws, &json!({}));
    ws["cycle"]["status"] = json!("complete");
    ws["cycle"]["end"] = json!(through.to_rfc3339());
    let catalog = json!({"schemaVersion":5,"checkedThrough":through.to_rfc3339(),
        "analysis":{"workflows":[]},"agentWorkspace":ws});
    tokio::fs::create_dir_all(dir.path().join("workflows"))
        .await
        .unwrap();
    tokio::fs::write(
        dir.path().join("workflows/catalog.json"),
        catalog.to_string(),
    )
    .await
    .unwrap();

    let discover = "/workflows/workspace?task=workflow-discover";
    let idle = call(&router, "GET", discover, None).await;
    assert_eq!(idle["ready"], false, "{idle}");
    assert!(idle["idle"]
        .as_str()
        .unwrap()
        .starts_with("Nothing was recorded after"));
    let start = json!({"task":"workflow-discover","action":"start"});
    let declined = call(&router, "POST", "/workflows/workspace", Some(start.clone())).await;
    assert!(declined["idle"]
        .as_str()
        .unwrap()
        .ends_with("No cycle was started; stop here."));
    assert_eq!(declined["cycle"]["status"], "complete");

    frame_at(&db, through + chrono::Duration::minutes(30)).await;
    let busy = call(&router, "GET", discover, None).await;
    assert_eq!(busy["ready"], true, "{busy}");
    assert!(busy["idle"].is_null());
    let started = call(&router, "POST", "/workflows/workspace", Some(start)).await;
    assert_eq!(started["cycle"]["status"], "running");
}

#[tauri::command]
fn backend_status() -> serde_json::Value {
    serde_json::json!({
        "desktop": "ok",
        "python": "not-started"
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![backend_status])
        .run(tauri::generate_context!())
        .expect("error while running Rulesmd Editor");
}

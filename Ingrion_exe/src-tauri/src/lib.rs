// INGRION Tauri Backend
// Minimal Rust backend - most logic runs in the React frontend
// Tauri plugins handle: SQLite, Filesystem, HTTP, Notifications

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Ensure app data directory exists
            let app_data = app.path().app_data_dir().expect("Failed to get app data dir");
            let ingrion_dir = app_data.join("INGRION");
            if !ingrion_dir.exists() {
                std::fs::create_dir_all(&ingrion_dir).expect("Failed to create INGRION dir");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running INGRION application");
}

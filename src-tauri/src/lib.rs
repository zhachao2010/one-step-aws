mod commands;
mod download_engine;
mod md5_engine;
mod s3_client;
mod state;
mod url_parser;

use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

/// Stores the initial deep link URL so the frontend can retrieve it after mount.
struct InitialUrl(Mutex<Option<String>>);

#[tauri::command]
fn get_initial_url(state: tauri::State<'_, InitialUrl>) -> Option<String> {
    state.0.lock().unwrap().take()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(InitialUrl(Mutex::new(None)))
        .setup(|app| {
            // Handle deep links on launch — store for frontend to poll
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                if let Some(url) = urls.first() {
                    let url_str = url.as_str().to_string();
                    // Store in state for frontend to retrieve
                    let initial = app.state::<InitialUrl>();
                    *initial.0.lock().unwrap() = Some(url_str);
                }
            }

            // Handle deep links while running — emit event directly
            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                if let Some(url) = event.urls().first() {
                    let url_str = url.as_str().to_string();
                    app_handle.emit("deep-link", &url_str).ok();
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::parse_download_url,
            commands::fetch_project_info,
            commands::start_download,
            get_initial_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

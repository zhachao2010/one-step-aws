mod commands;
mod download_engine;
mod md5_engine;
mod s3_client;
mod state;
mod url_parser;

use std::sync::Mutex;
use std::io::Write;
use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

fn debug_log(msg: &str) {
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true).append(true)
        .open("/tmp/onestep-debug.log")
    {
        let _ = writeln!(f, "[{}] {}", chrono::Local::now().format("%H:%M:%S"), msg);
    }
}

/// Stores the initial deep link URL so the frontend can retrieve it after mount.
struct InitialUrl(Mutex<Option<String>>);

#[tauri::command]
fn get_initial_url(state: tauri::State<'_, InitialUrl>) -> Option<String> {
    let url = state.0.lock().unwrap().take();
    debug_log(&format!("[OneStepAWS] get_initial_url called, returning: {:?}", url.as_ref().map(|u| &u[..40.min(u.len())])));
    url
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(InitialUrl(Mutex::new(None)))
        .setup(|app| {
            debug_log(&format!("[OneStepAWS] setup() started"));

            // Handle deep links on launch — store for frontend to poll
            match app.deep_link().get_current() {
                Ok(Some(urls)) => {
                    debug_log(&format!("[OneStepAWS] get_current() returned {} URLs", urls.len()));
                    if let Some(url) = urls.first() {
                        let url_str = url.as_str().to_string();
                        debug_log(&format!("[OneStepAWS] Initial URL: {}", &url_str[..80.min(url_str.len())]));
                        let initial = app.state::<InitialUrl>();
                        *initial.0.lock().unwrap() = Some(url_str);
                    }
                }
                Ok(None) => debug_log(&format!("[OneStepAWS] get_current() returned None")),
                Err(e) => debug_log(&format!("[OneStepAWS] get_current() error: {:?}", e)),
            }

            // Handle deep links while running — emit event AND store as fallback
            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let urls = event.urls();
                debug_log(&format!("[OneStepAWS] on_open_url fired with {} URLs", urls.len()));
                if let Some(url) = urls.first() {
                    let url_str = url.as_str().to_string();
                    debug_log(&format!("[OneStepAWS] Runtime URL: {}", &url_str[..80.min(url_str.len())]));
                    // Store in InitialUrl as fallback (frontend may not have listener ready yet)
                    let initial = app_handle.state::<InitialUrl>();
                    *initial.0.lock().unwrap() = Some(url_str.clone());
                    // Also emit event for when frontend is already listening
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

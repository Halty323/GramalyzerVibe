/// The app is the website in a native window. Two plugins make that work: the HTTP client, which reaches any
/// Gramalyzer server and AI provider without browser CORS, and the opener, which sends outside links to the browser.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("Gramalyzer failed to start");
}

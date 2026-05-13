use agent_studio_open_core::{
    registered_ipc_commands, validate_platform_keychain_list_request,
    validate_platform_keychain_request, IpcCommand, PlatformKeychainKey,
};
use auraone_platform_keychain::{Keychain, NativeKeychainBackend};
use tauri::Manager;

const STARTUP_PROBE_FLAG: &str = "--benchmark-startup-probe";

#[tauri::command]
fn agent_studio_registered_commands() -> Vec<IpcCommand> {
    registered_ipc_commands()
}

#[tauri::command]
fn platform_keychain_set(
    app: tauri::AppHandle,
    key: PlatformKeychainKey,
    value: String,
    secret: Option<bool>,
) -> Result<(), String> {
    let key = validate_platform_keychain_request(key, secret)?;
    platform_keychain(&app)?
        .set(&key, &value)
        .map_err(redact_error)
}

#[tauri::command]
fn platform_keychain_get(
    app: tauri::AppHandle,
    key: PlatformKeychainKey,
    secret: Option<bool>,
) -> Result<Option<String>, String> {
    let key = validate_platform_keychain_request(key, secret)?;
    platform_keychain(&app)?
        .get(&key)
        .map(|value| value.map(|secret| secret.expose().to_string()))
        .map_err(redact_error)
}

#[tauri::command]
fn platform_keychain_delete(app: tauri::AppHandle, key: PlatformKeychainKey) -> Result<(), String> {
    let key = validate_platform_keychain_request(key, Some(true))?;
    platform_keychain(&app)?.delete(&key).map_err(redact_error)
}

#[tauri::command]
fn platform_keychain_list(
    app: tauri::AppHandle,
    service: String,
    scope: String,
) -> Result<Vec<String>, String> {
    let (service, scope) = validate_platform_keychain_list_request(service, scope)?;
    platform_keychain(&app)?
        .list(&service, &scope)
        .map_err(redact_error)
}

fn platform_keychain(app: &tauri::AppHandle) -> Result<Keychain<NativeKeychainBackend>, String> {
    let fallback_path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data dir: {error}"))?
        .join("secrets")
        .join("keychain-fallback.json");
    Ok(Keychain::new(NativeKeychainBackend::for_current_os(
        fallback_path,
    )))
}

fn redact_error(error: impl std::fmt::Display) -> String {
    format!("platform keychain operation failed: {error}")
}

fn main() {
    if std::env::args().any(|arg| arg == STARTUP_PROBE_FLAG) {
        println!(
            "{{\"product\":\"Agent Studio Open\",\"probe\":\"packaged-startup\",\"ok\":true}}"
        );
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            agent_studio_registered_commands,
            platform_keychain_set,
            platform_keychain_get,
            platform_keychain_delete,
            platform_keychain_list
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Agent Studio Open desktop shell");
}

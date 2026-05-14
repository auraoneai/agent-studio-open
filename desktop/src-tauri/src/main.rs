use agent_studio_open_core::{
    registered_ipc_commands, validate_platform_keychain_list_request,
    validate_platform_keychain_request, IpcCommand, PlatformKeychainKey,
};
use auraone_platform_keychain::{Keychain, NativeKeychainBackend};
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const STARTUP_PROBE_FLAG: &str = "--benchmark-startup-probe";

struct OtlpReceiverState {
    child: Mutex<Option<Child>>,
}

#[derive(Debug, Deserialize)]
struct McpConnectRequest {
    transport: String,
    command: Option<String>,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TraceStoreQueryRequest {
    store: String,
    query: String,
}

#[derive(Debug, Deserialize)]
struct TraceStoreWriteRequest {
    trace: String,
    format: String,
    store: String,
}

#[derive(Debug, Deserialize)]
struct ReplayRunRequest {
    replay: String,
    assertions: String,
}

#[derive(Debug, Deserialize)]
struct CompareRunRequest {
    baseline: String,
    candidate: String,
}

#[derive(Debug, Deserialize)]
struct A2AContractsRequest {
    card: Value,
    transcript: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct OtlpToggleRequest {
    enabled: bool,
    store: String,
    host: Option<String>,
    port: Option<u16>,
    grpc: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct ExportBundleRequest {
    kind: String,
    input: String,
    out: String,
}

#[tauri::command]
fn agent_studio_registered_commands() -> Vec<IpcCommand> {
    registered_ipc_commands()
}

#[tauri::command]
fn sidecar_health() -> Result<Value, String> {
    run_agentstudio_json(&["--json", "self-test"])
}

#[tauri::command]
fn mcp_connect(request: McpConnectRequest) -> Result<Value, String> {
    let mut args = vec!["--json".to_string(), "connect".to_string()];
    match request.transport.as_str() {
        "stdio" => {
            let command = request
                .command
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "stdio command is required".to_string())?;
            args.extend([
                "stdio".to_string(),
                "--command".to_string(),
                command.to_string(),
            ]);
            for item in request.args.unwrap_or_default() {
                if !item.trim().is_empty() {
                    args.extend(["--arg".to_string(), item]);
                }
            }
            if let Some(cwd) = request.cwd.filter(|value| !value.trim().is_empty()) {
                args.extend(["--cwd".to_string(), cwd]);
            }
        }
        "http" | "sse" => {
            let url = request
                .url
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| format!("{} URL is required", request.transport))?;
            args.extend([request.transport, url.to_string()]);
        }
        "websocket" | "ws" => {
            let url = request
                .url
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "websocket URL is required".to_string())?;
            args.extend(["ws".to_string(), url.to_string()]);
        }
        other => return Err(format!("unsupported MCP transport: {other}")),
    }
    run_agentstudio_json_strings(args)
}

#[tauri::command]
fn mcp_manifest(request: McpConnectRequest) -> Result<Value, String> {
    mcp_connect(request)
}

#[tauri::command]
fn trace_store_query(request: TraceStoreQueryRequest) -> Result<Value, String> {
    run_agentstudio_json_strings(vec![
        "--json".to_string(),
        "store".to_string(),
        "search".to_string(),
        request.store,
        request.query,
    ])
}

#[tauri::command]
fn trace_store_write(request: TraceStoreWriteRequest) -> Result<Value, String> {
    run_agentstudio_json_strings(vec![
        "--json".to_string(),
        "import-trace".to_string(),
        request.trace,
        "--format".to_string(),
        request.format,
        "--store".to_string(),
        request.store,
    ])
}

#[tauri::command]
fn replay_run(request: ReplayRunRequest) -> Result<Value, String> {
    run_agentstudio_json_strings(vec![
        "--json".to_string(),
        "replay".to_string(),
        request.replay,
        "--assert".to_string(),
        request.assertions,
    ])
}

#[tauri::command]
fn compare_run(request: CompareRunRequest) -> Result<Value, String> {
    run_agentstudio_json_strings(vec![
        "--json".to_string(),
        "compare".to_string(),
        "--baseline".to_string(),
        request.baseline,
        "--candidate".to_string(),
        request.candidate,
    ])
}

#[tauri::command]
fn a2a_run_contracts(app: tauri::AppHandle, request: A2AContractsRequest) -> Result<Value, String> {
    let dir = runtime_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|error| format!("failed to create runtime dir: {error}"))?;
    let token = unique_token();
    let card_path = dir.join(format!("a2a-card-{token}.json"));
    fs::write(
        &card_path,
        serde_json::to_vec_pretty(&request.card).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("failed to write A2A card: {error}"))?;
    let mut args = vec![
        "--json".to_string(),
        "a2a".to_string(),
        card_path.to_string_lossy().to_string(),
    ];
    let transcript_path = if let Some(transcript) = request.transcript {
        let path = dir.join(format!("a2a-transcript-{token}.json"));
        fs::write(
            &path,
            serde_json::to_vec_pretty(&transcript).map_err(|error| error.to_string())?,
        )
        .map_err(|error| format!("failed to write A2A transcript: {error}"))?;
        args.extend([
            "--transcript".to_string(),
            path.to_string_lossy().to_string(),
        ]);
        Some(path)
    } else {
        None
    };
    let result = run_agentstudio_json_strings(args);
    let _ = fs::remove_file(card_path);
    if let Some(path) = transcript_path {
        let _ = fs::remove_file(path);
    }
    result
}

#[tauri::command]
fn otlp_receiver_toggle(
    state: tauri::State<OtlpReceiverState>,
    request: OtlpToggleRequest,
) -> Result<Value, String> {
    let mut guard = state
        .child
        .lock()
        .map_err(|_| "failed to lock OTLP receiver state".to_string())?;
    if request.enabled {
        if let Some(child) = guard.as_mut() {
            if child
                .try_wait()
                .map_err(|error| error.to_string())?
                .is_none()
            {
                return Ok(serde_json::json!({ "running": true, "store": request.store }));
            }
        }
        let mut args = vec![
            "otlp".to_string(),
            "receive".to_string(),
            "--store".to_string(),
            request.store.clone(),
            "--host".to_string(),
            request.host.unwrap_or_else(|| "127.0.0.1".to_string()),
            "--port".to_string(),
            request.port.unwrap_or(4318).to_string(),
        ];
        if request.grpc.unwrap_or(false) {
            args.push("--grpc".to_string());
        }
        let child = agentstudio_command()
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("failed to start OTLP receiver: {error}"))?;
        *guard = Some(child);
        Ok(serde_json::json!({ "running": true, "store": request.store }))
    } else {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        Ok(serde_json::json!({ "running": false }))
    }
}

#[tauri::command]
fn export_bundle(request: ExportBundleRequest) -> Result<Value, String> {
    let mut args = vec!["--json".to_string(), "export".to_string(), request.kind];
    args.push(request.input);
    args.extend(["--out".to_string(), request.out]);
    run_agentstudio_json_strings(args)
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

fn run_agentstudio_json(args: &[&str]) -> Result<Value, String> {
    run_agentstudio_json_strings(args.iter().map(|arg| (*arg).to_string()).collect())
}

fn run_agentstudio_json_strings(args: Vec<String>) -> Result<Value, String> {
    let output = agentstudio_command()
        .args(args)
        .output()
        .map_err(|error| format!("failed to launch agentstudio CLI: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "agentstudio CLI failed with status {}: {}{}",
            output.status,
            String::from_utf8_lossy(&output.stderr),
            String::from_utf8_lossy(&output.stdout)
        ));
    }
    serde_json::from_slice(&output.stdout).map_err(|error| {
        format!(
            "agentstudio CLI returned invalid JSON: {error}; stdout={}",
            String::from_utf8_lossy(&output.stdout)
        )
    })
}

fn agentstudio_command() -> Command {
    if let Ok(path) = std::env::var("AGENTSTUDIO_CLI") {
        return Command::new(path);
    }
    if let Ok(current) = std::env::current_exe() {
        if let Some(dir) = current.parent() {
            let sibling = dir.join(if cfg!(windows) {
                "agentstudio.exe"
            } else {
                "agentstudio"
            });
            if sibling.exists() {
                return Command::new(sibling);
            }
        }
    }
    Command::new("agentstudio")
}

fn runtime_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data dir: {error}"))?
        .join("runtime"))
}

fn unique_token() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("{}-{millis}", std::process::id())
}

fn main() {
    if std::env::args().any(|arg| arg == STARTUP_PROBE_FLAG) {
        println!(
            "{{\"product\":\"Agent Studio Open\",\"probe\":\"packaged-startup\",\"ok\":true}}"
        );
        return;
    }

    tauri::Builder::default()
        .manage(OtlpReceiverState {
            child: Mutex::new(None),
        })
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
            sidecar_health,
            mcp_connect,
            mcp_manifest,
            trace_store_query,
            trace_store_write,
            replay_run,
            compare_run,
            a2a_run_contracts,
            otlp_receiver_toggle,
            export_bundle,
            platform_keychain_set,
            platform_keychain_get,
            platform_keychain_delete,
            platform_keychain_list
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Agent Studio Open desktop shell");
}

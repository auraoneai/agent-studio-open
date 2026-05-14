use auraone_platform_keychain::KeychainKey;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Transport {
    Stdio,
    Sse,
    Http,
    WebSocket,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Edition {
    Desktop,
    Browser,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConnectionRequest {
    pub name: String,
    pub transport: Transport,
    pub endpoint: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct IpcCommand {
    pub name: &'static str,
    pub description: &'static str,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
pub struct PlatformKeychainKey {
    pub service: String,
    pub scope: String,
    pub identifier: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SandboxPlatform {
    Linux,
    MacOs,
    Unsupported,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SandboxLaunch {
    pub program: String,
    pub args: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CliLaunch {
    pub program: String,
    pub args: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ModelStreamEvent {
    Delta(String),
    ToolCallDelta {
        id: String,
        name: String,
        arguments_json: String,
    },
    Done,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ModelStreamState {
    pub content: String,
    pub tool_call_fragments: Vec<String>,
    pub done: bool,
}

pub fn registered_ipc_commands() -> Vec<IpcCommand> {
    vec![
        IpcCommand {
            name: "mcp_connect",
            description: "Connect to MCP stdio, SSE, HTTP, or WebSocket transports through the CLI runtime.",
        },
        IpcCommand {
            name: "mcp_manifest",
            description: "Fetch tools, resources, prompts, server logs, and risk findings through MCP discovery.",
        },
        IpcCommand {
            name: "trace_store_query",
            description: "Read .ast trace sessions and full-text index results through the CLI runtime.",
        },
        IpcCommand {
            name: "trace_store_write",
            description: "Persist imported sessions to the local .ast store through the CLI runtime.",
        },
        IpcCommand {
            name: "replay_run",
            description: "Invoke tool-call-replay through the CLI runtime.",
        },
        IpcCommand {
            name: "a2a_run_contracts",
            description: "Invoke a2a-contract-test and return contract results.",
        },
        IpcCommand {
            name: "otlp_receiver_toggle",
            description: "Start or stop the localhost-only OTLP HTTP/gRPC receiver.",
        },
        IpcCommand {
            name: "compare_run",
            description: "Compare two trace stores through the CLI runtime.",
        },
        IpcCommand {
            name: "export_bundle",
            description:
                "Generate GitHub Action, JUnit, PR comment, trace card, and intake exports.",
        },
        IpcCommand {
            name: "sidecar_health",
            description: "Check Python sidecar venv, wrapper availability, and service health.",
        },
        IpcCommand {
            name: "platform_keychain_set",
            description: "Store approved provider secrets through the inherited platform keychain.",
        },
        IpcCommand {
            name: "platform_keychain_get",
            description: "Read approved provider secrets through the inherited platform keychain.",
        },
        IpcCommand {
            name: "platform_keychain_delete",
            description:
                "Delete approved provider secrets through the inherited platform keychain.",
        },
        IpcCommand {
            name: "platform_keychain_list",
            description:
                "List approved provider secret identifiers through the inherited platform keychain.",
        },
    ]
}

pub fn planned_ipc_commands() -> Vec<IpcCommand> {
    Vec::new()
}

impl TryFrom<PlatformKeychainKey> for KeychainKey {
    type Error = String;

    fn try_from(value: PlatformKeychainKey) -> Result<Self, Self::Error> {
        KeychainKey::new(value.service, value.scope, value.identifier)
            .map_err(|error| error.to_string())
    }
}

pub fn validate_platform_keychain_request(
    key: PlatformKeychainKey,
    secret: Option<bool>,
) -> Result<KeychainKey, String> {
    if secret != Some(true) {
        return Err("keychain IPC requires secret=true".to_string());
    }
    key.try_into()
}

pub fn validate_platform_keychain_list_request(
    service: String,
    scope: String,
) -> Result<(String, String), String> {
    KeychainKey::new(&service, &scope, "list").map_err(|error| error.to_string())?;
    Ok((service, scope))
}

pub fn validate_connection(edition: Edition, request: &ConnectionRequest) -> Result<(), String> {
    if matches!(edition, Edition::Browser) && matches!(request.transport, Transport::Stdio) {
        return Err("Browser edition cannot use stdio MCP transport.".to_string());
    }
    if request.name.trim().is_empty() {
        return Err("Connection name is required.".to_string());
    }
    if request.endpoint.trim().is_empty() {
        return Err("Connection endpoint is required.".to_string());
    }
    Ok(())
}

pub fn otlp_bind_address(remote_bind: bool, port: u16) -> String {
    let host = if remote_bind { "0.0.0.0" } else { "127.0.0.1" };
    format!("{host}:{port}")
}

pub fn default_python_executable() -> &'static str {
    if cfg!(windows) {
        "python"
    } else {
        "python3"
    }
}

pub fn agentstudio_cli_launch(python_executable: Option<&str>, args: &[String]) -> CliLaunch {
    let program = python_executable
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| default_python_executable().to_string());
    let mut launch_args = vec!["-m".to_string(), "agentstudio.cli".to_string()];
    launch_args.extend(args.iter().cloned());
    CliLaunch {
        program,
        args: launch_args,
    }
}

pub fn sandbox_stdio_launch(
    platform: SandboxPlatform,
    command: &str,
    args: &[String],
    writable_workdir: Option<&str>,
) -> Result<SandboxLaunch, String> {
    if command.trim().is_empty() {
        return Err("sandbox command is required".to_string());
    }
    match platform {
        SandboxPlatform::Linux => {
            let mut sandbox_args = vec![
                "--unshare-all".to_string(),
                "--die-with-parent".to_string(),
                "--ro-bind".to_string(),
                "/usr".to_string(),
                "/usr".to_string(),
                "--proc".to_string(),
                "/proc".to_string(),
                "--dev".to_string(),
                "/dev".to_string(),
            ];
            if let Some(workdir) = writable_workdir {
                sandbox_args.extend([
                    "--bind".to_string(),
                    workdir.to_string(),
                    workdir.to_string(),
                ]);
            }
            sandbox_args.extend(["--".to_string(), command.to_string()]);
            sandbox_args.extend(args.iter().cloned());
            Ok(SandboxLaunch {
                program: "bwrap".to_string(),
                args: sandbox_args,
            })
        }
        SandboxPlatform::MacOs => {
            let mut profile =
                "(version 1)(deny default)(allow process-exec)(allow file-read*)".to_string();
            if let Some(workdir) = writable_workdir {
                profile.push_str(&format!(
                    "(allow file-write* (subpath \"{}\"))",
                    escape_sandbox_path(workdir)
                ));
            }
            let mut sandbox_args = vec!["-p".to_string(), profile, command.to_string()];
            sandbox_args.extend(args.iter().cloned());
            Ok(SandboxLaunch {
                program: "sandbox-exec".to_string(),
                args: sandbox_args,
            })
        }
        SandboxPlatform::Unsupported => {
            Err("stdio sandboxing is supported on Linux and macOS only".to_string())
        }
    }
}

fn escape_sandbox_path(path: &str) -> String {
    path.replace('\\', "\\\\").replace('"', "\\\"")
}

pub fn reduce_model_stream(events: &[ModelStreamEvent]) -> ModelStreamState {
    let mut state = ModelStreamState {
        content: String::new(),
        tool_call_fragments: Vec::new(),
        done: false,
    };
    for event in events {
        match event {
            ModelStreamEvent::Delta(delta) => state.content.push_str(delta),
            ModelStreamEvent::ToolCallDelta {
                id,
                name,
                arguments_json,
            } => state
                .tool_call_fragments
                .push(format!("{id}:{name}:{arguments_json}")),
            ModelStreamEvent::Done => state.done = true,
        }
    }
    state
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registers_implemented_agent_studio_ipc_surface() {
        let commands = registered_ipc_commands();
        let names: Vec<&str> = commands.iter().map(|command| command.name).collect();
        assert!(names.contains(&"mcp_connect"));
        assert!(names.contains(&"mcp_manifest"));
        assert!(names.contains(&"trace_store_query"));
        assert!(names.contains(&"trace_store_write"));
        assert!(names.contains(&"replay_run"));
        assert!(names.contains(&"a2a_run_contracts"));
        assert!(names.contains(&"otlp_receiver_toggle"));
        assert!(names.contains(&"compare_run"));
        assert!(names.contains(&"export_bundle"));
        assert!(names.contains(&"sidecar_health"));
        assert!(names.contains(&"platform_keychain_set"));
        assert!(names.contains(&"platform_keychain_get"));
        assert!(names.contains(&"platform_keychain_delete"));
        assert!(names.contains(&"platform_keychain_list"));
        assert!(commands.iter().all(
            |command| !command.name.trim().is_empty() && !command.description.trim().is_empty()
        ));
    }

    #[test]
    fn has_no_unimplemented_planned_ipc_left() {
        assert!(planned_ipc_commands().is_empty());
    }

    #[test]
    fn browser_rejects_stdio_transport() {
        let request = ConnectionRequest {
            name: "local".to_string(),
            transport: Transport::Stdio,
            endpoint: "python -m server".to_string(),
        };
        assert!(validate_connection(Edition::Browser, &request).is_err());
        assert!(validate_connection(Edition::Desktop, &request).is_ok());
    }

    #[test]
    fn otlp_binds_to_localhost_by_default() {
        assert_eq!(otlp_bind_address(false, 4318), "127.0.0.1:4318");
        assert_eq!(otlp_bind_address(true, 4318), "0.0.0.0:4318");
    }

    #[test]
    fn validates_platform_keychain_scope_and_secret_marker() {
        let key = PlatformKeychainKey {
            service: "agent-studio-open".to_string(),
            scope: "byo-api-keys".to_string(),
            identifier: "anthropic".to_string(),
        };
        assert!(validate_platform_keychain_request(key.clone(), Some(true)).is_ok());
        assert!(validate_platform_keychain_request(key.clone(), Some(false)).is_err());

        let mut content_key = key;
        content_key.scope = "project-content".to_string();
        assert!(validate_platform_keychain_request(content_key, Some(true)).is_err());
        assert!(validate_platform_keychain_list_request(
            "agent-studio-open".to_string(),
            "byo-api-keys".to_string()
        )
        .is_ok());
        assert!(validate_platform_keychain_list_request(
            "agent-studio-open".to_string(),
            "project-content".to_string()
        )
        .is_err());
    }

    #[test]
    fn builds_agentstudio_python_cli_launcher() {
        let launch = agentstudio_cli_launch(
            Some("/opt/agentstudio/python"),
            &["connect".to_string(), "stdio".to_string()],
        );
        assert_eq!(launch.program, "/opt/agentstudio/python");
        assert_eq!(
            launch.args,
            vec![
                "-m".to_string(),
                "agentstudio.cli".to_string(),
                "connect".to_string(),
                "stdio".to_string()
            ]
        );
    }

    #[test]
    fn cli_launcher_falls_back_to_platform_python() {
        let launch = agentstudio_cli_launch(Some("  "), &[]);
        assert_eq!(launch.program, default_python_executable());
        assert_eq!(
            launch.args,
            vec!["-m".to_string(), "agentstudio.cli".to_string()]
        );
    }

    #[test]
    fn builds_linux_bubblewrap_stdio_launcher() {
        let launch = sandbox_stdio_launch(
            SandboxPlatform::Linux,
            "python",
            &["-m".to_string(), "fixture".to_string()],
            Some("/tmp/agentstudio"),
        )
        .expect("linux launcher");
        assert_eq!(launch.program, "bwrap");
        assert!(launch.args.contains(&"--unshare-all".to_string()));
        assert!(launch.args.ends_with(&[
            "--".to_string(),
            "python".to_string(),
            "-m".to_string(),
            "fixture".to_string()
        ]));
    }

    #[test]
    fn builds_macos_sandbox_exec_stdio_launcher() {
        let launch = sandbox_stdio_launch(
            SandboxPlatform::MacOs,
            "python",
            &["server.py".to_string()],
            Some("/tmp/agentstudio"),
        )
        .expect("macos launcher");
        assert_eq!(launch.program, "sandbox-exec");
        assert_eq!(launch.args[0], "-p");
        assert!(launch.args[1].contains("deny default"));
        assert!(launch.args[1].contains("/tmp/agentstudio"));
        assert_eq!(launch.args[2], "python");
    }

    #[test]
    fn reduces_streaming_model_response_events() {
        let state = reduce_model_stream(&[
            ModelStreamEvent::Delta("Refund ".to_string()),
            ModelStreamEvent::Delta("queued".to_string()),
            ModelStreamEvent::ToolCallDelta {
                id: "call-1".to_string(),
                name: "refund_order".to_string(),
                arguments_json: "{\"order_id\":\"ORD-100\"}".to_string(),
            },
            ModelStreamEvent::Done,
        ]);
        assert_eq!(state.content, "Refund queued");
        assert_eq!(state.tool_call_fragments.len(), 1);
        assert!(state.done);
    }
}

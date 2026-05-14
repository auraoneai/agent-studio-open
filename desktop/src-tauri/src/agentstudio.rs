use std::env;
use std::path::{Path, PathBuf};
use std::process::{self, Command};

use agent_studio_open_core::agentstudio_cli_launch;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let python = env::var("AGENTSTUDIO_PYTHON").ok();
    let launch = agentstudio_cli_launch(python.as_deref(), &args);
    let mut command = Command::new(&launch.program);
    command.args(&launch.args);
    if let Some(paths) = agentstudio_pythonpath() {
        command.env("PYTHONPATH", paths);
    }
    let status = command.status();
    match status {
        Ok(status) => process::exit(status.code().unwrap_or(1)),
        Err(error) => {
            eprintln!(
                "agentstudio could not launch the Python CLI via '{}': {}",
                launch.program, error
            );
            eprintln!(
                "Set AGENTSTUDIO_PYTHON or PYTHONPATH to the Python environment that has the Agent Studio Open packages installed."
            );
            process::exit(127);
        }
    }
}

fn agentstudio_pythonpath() -> Option<String> {
    let mut paths = existing_engine_paths();
    if let Some(existing) = env::var_os("PYTHONPATH") {
        paths.extend(env::split_paths(&existing));
    }
    if paths.is_empty() {
        return None;
    }
    env::join_paths(paths)
        .ok()
        .and_then(|value| value.into_string().ok())
}

fn existing_engine_paths() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(repo_root) = source_repo_root() {
        append_repo_engine_paths(&mut candidates, &repo_root);
        append_vendor_engine_paths(&mut candidates, &repo_root);
    }
    if let Some(resources) = bundled_resources_dir() {
        append_repo_engine_paths(&mut candidates, &resources);
        append_repo_engine_paths(&mut candidates, &resources.join("agent-studio-open"));
        append_repo_engine_paths(
            &mut candidates,
            &resources.join("opensource").join("agent-studio-open"),
        );
        append_vendor_engine_paths(&mut candidates, &resources);
        append_vendor_engine_paths(&mut candidates, &resources.join("agent-studio-open"));
        append_tauri_resource_engine_paths(&mut candidates, &resources);
    }
    candidates
        .into_iter()
        .filter(|path| path.exists())
        .collect()
}

fn append_repo_engine_paths(paths: &mut Vec<PathBuf>, repo_root: &Path) {
    paths.push(repo_root.join("cli").join("src"));
    if let Some(open_source_root) = repo_root.parent() {
        paths.push(open_source_root.join("tool-call-replay").join("src"));
        paths.push(open_source_root.join("agent-trace-card").join("src"));
        paths.push(open_source_root.join("otel-eval-bridge").join("src"));
        paths.push(open_source_root.join("mcp-risk-linter").join("src"));
        paths.push(open_source_root.join("a2a-contract-test").join("src"));
    }
}

fn append_vendor_engine_paths(paths: &mut Vec<PathBuf>, repo_root: &Path) {
    let vendor_root = repo_root.join("vendor");
    paths.push(vendor_root.join("tool-call-replay").join("src"));
    paths.push(vendor_root.join("agent-trace-card").join("src"));
    paths.push(vendor_root.join("otel-eval-bridge").join("src"));
    paths.push(vendor_root.join("mcp-risk-linter").join("src"));
    paths.push(vendor_root.join("a2a-contract-test").join("src"));
}

fn append_tauri_resource_engine_paths(paths: &mut Vec<PathBuf>, resources: &Path) {
    paths.push(resources.join("_up_").join("_up_").join("cli").join("src"));
    let open_source_root = resources.join("_up_").join("_up_").join("_up_");
    paths.push(open_source_root.join("tool-call-replay").join("src"));
    paths.push(open_source_root.join("agent-trace-card").join("src"));
    paths.push(open_source_root.join("otel-eval-bridge").join("src"));
    paths.push(open_source_root.join("mcp-risk-linter").join("src"));
    paths.push(open_source_root.join("a2a-contract-test").join("src"));
}

fn source_repo_root() -> Option<PathBuf> {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    manifest_dir.parent()?.parent().map(Path::to_path_buf)
}

fn bundled_resources_dir() -> Option<PathBuf> {
    let exe = env::current_exe().ok()?;
    let macos_dir = exe.parent()?;
    let contents_dir = macos_dir.parent()?;
    let resources = contents_dir.join("Resources");
    resources.exists().then_some(resources)
}

use std::env;
use std::process::{self, Command};

use agent_studio_open_core::agentstudio_cli_launch;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let python = env::var("AGENTSTUDIO_PYTHON").ok();
    let launch = agentstudio_cli_launch(python.as_deref(), &args);
    let status = Command::new(&launch.program).args(&launch.args).status();
    match status {
        Ok(status) => process::exit(status.code().unwrap_or(1)),
        Err(error) => {
            eprintln!(
                "agentstudio could not launch the Python CLI via '{}': {}",
                launch.program, error
            );
            eprintln!(
                "Set AGENTSTUDIO_PYTHON to the Python interpreter that has the agentstudio package installed."
            );
            process::exit(127);
        }
    }
}

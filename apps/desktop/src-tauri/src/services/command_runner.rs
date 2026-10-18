use std::process::Command;
use std::time::Instant;

use crate::services::log_service;

pub struct CommandResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

fn display_command(program: &str, args: &[&str]) -> String {
    let mut parts = Vec::with_capacity(args.len() + 1);
    parts.push(program.to_string());

    for arg in args {
        if arg.contains(' ') {
            parts.push(format!("{arg:?}"));
        } else {
            parts.push((*arg).to_string());
        }
    }

    parts.join(" ")
}

pub fn run(program: &str, args: &[&str]) -> CommandResult {
    let command = display_command(program, args);
    let started = Instant::now();

    let result = match Command::new(program).args(args).output() {
        Ok(output) => CommandResult {
            success: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
        },
        Err(error) => CommandResult {
            success: false,
            stdout: String::new(),
            stderr: error.to_string(),
        },
    };

    log_service::command(
        command,
        result.success,
        started.elapsed().as_millis(),
        result.stdout.clone(),
        result.stderr.clone(),
    );

    result
}

pub fn run_with_timeout(
    program: &str,
    args: &[&str],
    timeout: std::time::Duration,
) -> CommandResult {
    let command = display_command(program, args);

    let started = std::time::Instant::now();

    let mut child = match std::process::Command::new(program)
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(child) => child,

        Err(error) => {
            let result = CommandResult {
                success: false,
                stdout: String::new(),
                stderr: error.to_string(),
            };

            log_service::command(
                command,
                false,
                started.elapsed().as_millis(),
                result.stdout.clone(),
                result.stderr.clone(),
            );

            return result;
        }
    };

    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                let output = match child.wait_with_output() {
                    Ok(output) => output,

                    Err(error) => {
                        let result = CommandResult {
                            success: false,
                            stdout: String::new(),
                            stderr: error.to_string(),
                        };

                        log_service::command(
                            command,
                            false,
                            started.elapsed().as_millis(),
                            result.stdout.clone(),
                            result.stderr.clone(),
                        );

                        return result;
                    }
                };

                let result = CommandResult {
                    success: output.status.success(),

                    stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),

                    stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
                };

                log_service::command(
                    command,
                    result.success,
                    started.elapsed().as_millis(),
                    result.stdout.clone(),
                    result.stderr.clone(),
                );

                return result;
            }

            Ok(None) => {}

            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();

                let result = CommandResult {
                    success: false,
                    stdout: String::new(),
                    stderr: format!("Unable to monitor command: {error}"),
                };

                log_service::command(
                    command,
                    false,
                    started.elapsed().as_millis(),
                    result.stdout.clone(),
                    result.stderr.clone(),
                );

                return result;
            }
        }

        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();

            let result = CommandResult {
                success: false,
                stdout: String::new(),
                stderr: format!("Command timed out after {} seconds", timeout.as_secs(),),
            };

            log_service::command(
                command,
                false,
                started.elapsed().as_millis(),
                result.stdout.clone(),
                result.stderr.clone(),
            );

            return result;
        }

        std::thread::sleep(std::time::Duration::from_millis(100));
    }
}

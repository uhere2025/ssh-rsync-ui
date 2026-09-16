mod ssh;
mod transfer;

use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, State};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Hints {
    hosts: Vec<String>,
    identities: Vec<String>,
    default_destination: String,
    rsync: Option<String>,
    ssh: Option<String>,
}

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/".into()))
}

fn version_of(bin: &str, arg: &str) -> Option<String> {
    let out = std::process::Command::new(bin).arg(arg).output().ok()?;
    let text = if out.stdout.is_empty() {
        String::from_utf8_lossy(&out.stderr)
    } else {
        String::from_utf8_lossy(&out.stdout)
    };
    text.lines().next().map(|l| l.trim().to_string())
}

/// `Host` aliases from ~/.ssh/config, patterns excluded.
fn config_hosts() -> Vec<String> {
    let Ok(text) = std::fs::read_to_string(home().join(".ssh/config")) else {
        return Vec::new();
    };
    let mut hosts: Vec<String> = Vec::new();
    for line in text.lines() {
        let l = line.trim();
        if let Some(rest) = l.strip_prefix("Host ").or_else(|| l.strip_prefix("host ")) {
            for name in rest.split_whitespace() {
                if !name.contains('*') && !name.contains('?') && !name.starts_with('!') {
                    hosts.push(name.to_string());
                }
            }
        }
    }
    hosts.sort();
    hosts.dedup();
    hosts
}

fn identities() -> Vec<String> {
    let dir = home().join(".ssh");
    let Ok(rd) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut keys: Vec<String> = rd
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.starts_with("id_") && !n.ends_with(".pub"))
        .map(|n| dir.join(n).to_string_lossy().to_string())
        .collect();
    keys.sort();
    keys
}

#[tauri::command]
fn environment() -> Hints {
    let downloads = home().join("Downloads");
    let dest = if downloads.is_dir() {
        downloads
    } else {
        home()
    };
    Hints {
        hosts: config_hosts(),
        identities: identities(),
        default_destination: dest.to_string_lossy().to_string(),
        rsync: version_of("rsync", "--version"),
        ssh: version_of("ssh", "-V"),
    }
}

#[tauri::command]
async fn test_connection(connection: ssh::Connection) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || ssh::home_dir(&connection))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn list_dir(connection: ssh::Connection, path: String) -> Result<ssh::Listing, String> {
    tauri::async_runtime::spawn_blocking(move || ssh::list_dir(&connection, &path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn start_transfer(
    app: AppHandle,
    jobs: State<'_, transfer::Jobs>,
    request: transfer::TransferRequest,
) -> Result<transfer::StartedJob, String> {
    transfer::start(app, &jobs, request)
}

#[tauri::command]
fn cancel_transfer(app: AppHandle, job_id: String) -> Result<(), String> {
    transfer::cancel(&app, &job_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(transfer::Jobs::default())
        .invoke_handler(tauri::generate_handler![
            environment,
            test_connection,
            list_dir,
            start_transfer,
            cancel_transfer
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

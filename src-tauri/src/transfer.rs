//! rsync job: argument building, live progress parsing, cancellation.
//!
//! Selections are sent to rsync through `--files-from=-` (NUL separated) with a
//! computed common root, so one rsync process handles any mix of files and
//! directories while keeping their relative layout under the destination.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

use crate::ssh::Connection;

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Default)]
pub struct Jobs {
    children: Mutex<HashMap<String, Child>>,
    cancelled: Mutex<HashSet<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferRequest {
    pub connection: Connection,
    pub sources: Vec<String>,
    pub destination: String,
    #[serde(default)]
    pub compress: bool,
    #[serde(default)]
    pub dry_run: bool,
    #[serde(default)]
    pub checksum: bool,
    #[serde(default)]
    pub skip_newer: bool,
    #[serde(default)]
    pub whole_file: bool,
    #[serde(default)]
    pub bwlimit: Option<String>,
    #[serde(default)]
    pub excludes: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartedJob {
    pub job_id: String,
    pub root: String,
    pub files: Vec<String>,
    pub command: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressEvent {
    job_id: String,
    percent: f64,
    bytes: u64,
    rate: String,
    eta: String,
    files_done: Option<u64>,
    files_total: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LogEvent {
    job_id: String,
    level: String, // "info" | "error"
    line: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DoneEvent {
    job_id: String,
    code: Option<i32>,
    cancelled: bool,
    message: String,
}

/// Longest common *directory* prefix, compared component-wise.
fn common_root(paths: &[String]) -> String {
    let dirs: Vec<Vec<&str>> = paths
        .iter()
        .map(|p| {
            let mut c: Vec<&str> = p.trim_end_matches('/').split('/').collect();
            c.pop();
            c
        })
        .collect();
    let mut prefix = dirs[0].clone();
    for d in &dirs[1..] {
        let n = prefix
            .iter()
            .zip(d.iter())
            .take_while(|(a, b)| a == b)
            .count();
        prefix.truncate(n);
    }
    if prefix.len() <= 1 {
        "/".to_string()
    } else {
        prefix.join("/")
    }
}

fn relative_to(root: &str, path: &str) -> String {
    let p = path.trim_end_matches('/');
    let rel = if root == "/" {
        p.trim_start_matches('/')
    } else {
        p.strip_prefix(root).unwrap_or(p).trim_start_matches('/')
    };
    rel.to_string()
}

fn build(req: &TransferRequest) -> Result<(Vec<String>, String, Vec<String>), String> {
    req.connection.validate()?;
    if req.sources.is_empty() {
        return Err("Nothing selected.".into());
    }
    for s in &req.sources {
        if !s.starts_with('/') {
            return Err(format!("Remote path is not absolute: {s}"));
        }
    }
    if req.destination.trim().is_empty() {
        return Err("Pick a destination folder.".into());
    }

    let root = common_root(&req.sources);
    let mut files: Vec<String> = req
        .sources
        .iter()
        .map(|s| relative_to(&root, s))
        .filter(|s| !s.is_empty())
        .collect();
    files.sort();
    files.dedup();
    if files.is_empty() {
        return Err("Selection resolved to an empty file list.".into());
    }

    let mut args: Vec<String> = vec![
        "-a".into(),        // archive: recurse + preserve metadata
        "-r".into(),        // --files-from cancels -a's recursion
        "-s".into(),        // don't let the remote shell expand paths
        "--partial".into(), // keep partial files so a retry resumes
        "--from0".into(),   // NUL-separated --files-from
        "--files-from=-".into(),
        "--info=progress2".into(),
        "--no-inc-recursive".into(), // needed for a meaningful total percentage
        "--out-format=%n".into(),
    ];
    if req.compress {
        args.push("-z".into());
    }
    if req.dry_run {
        args.push("-n".into());
    }
    if req.checksum {
        args.push("-c".into());
    }
    if req.skip_newer {
        args.push("-u".into());
    }
    if req.whole_file {
        // Skip the delta scan: the sender and receiver would otherwise read and
        // checksum an existing destination file end to end before sending a byte.
        args.push("-W".into());
    }
    if let Some(b) = req
        .bwlimit
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        if !b.chars().all(|c| c.is_ascii_alphanumeric() || c == '.') {
            return Err("Bandwidth limit must look like 500, 2M or 1.5m.".into());
        }
        args.push(format!("--bwlimit={b}"));
    }
    for ex in req
        .excludes
        .iter()
        .map(|e| e.trim())
        .filter(|e| !e.is_empty())
    {
        args.push(format!("--exclude={ex}"));
    }

    let opts = req.connection.ssh_opts().join(" ");
    args.push("-e".into());
    args.push(format!("ssh {opts}"));

    let src_root = if root == "/" {
        "/".to_string()
    } else {
        format!("{root}/")
    };
    args.push(format!("{}:{}", req.connection.target(), src_root));
    args.push(req.destination.trim().trim_end_matches('/').to_string() + "/");

    Ok((args, root, files))
}

fn num(tok: &str) -> Option<u64> {
    let t: String = tok.chars().filter(|c| c.is_ascii_digit()).collect();
    if t.is_empty() || !tok.chars().all(|c| c.is_ascii_digit() || c == ',') {
        None
    } else {
        t.parse().ok()
    }
}

/// `  32,768  12%   31.24MB/s    0:00:07 (xfr#1, to-chk=12/34)`
fn parse_progress(job_id: &str, line: &str) -> Option<ProgressEvent> {
    let t: Vec<&str> = line.split_whitespace().collect();
    if t.len() < 4 || !t[1].ends_with('%') {
        return None;
    }
    let bytes = num(t[0])?;
    let percent: f64 = t[1].trim_end_matches('%').parse().ok()?;
    let (mut done, mut total) = (None, None);
    if let Some(tok) = t
        .iter()
        .find(|x| x.contains("to-chk=") || x.contains("ir-chk="))
    {
        let v = tok.split('=').nth(1).unwrap_or("").trim_end_matches(')');
        let mut p = v.split('/');
        let left: Option<u64> = p.next().and_then(|x| x.parse().ok());
        let all: Option<u64> = p.next().and_then(|x| x.parse().ok());
        if let (Some(l), Some(a)) = (left, all) {
            done = Some(a.saturating_sub(l));
            total = Some(a);
        }
    }
    Some(ProgressEvent {
        job_id: job_id.to_string(),
        percent,
        bytes,
        rate: t[2].to_string(),
        eta: t[3].to_string(),
        files_done: done,
        files_total: total,
    })
}

fn log(app: &AppHandle, job_id: &str, level: &str, line: &str) {
    let _ = app.emit(
        "transfer://log",
        LogEvent {
            job_id: job_id.to_string(),
            level: level.to_string(),
            line: line.to_string(),
        },
    );
}

fn exit_message(code: Option<i32>) -> String {
    match code {
        Some(0) => "Transfer complete.".into(),
        Some(23) => "Finished with errors: some files could not be transferred (code 23).".into(),
        Some(24) => "Finished: some source files vanished during transfer (code 24).".into(),
        Some(c) => format!("rsync exited with code {c}."),
        None => "rsync was terminated.".into(),
    }
}

pub fn start(app: AppHandle, jobs: &Jobs, req: TransferRequest) -> Result<StartedJob, String> {
    let (args, root, files) = build(&req)?;
    std::fs::create_dir_all(req.destination.trim())
        .map_err(|e| format!("Cannot create destination folder: {e}"))?;

    let mut cmd = Command::new("rsync");
    cmd.args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // Own process group: rsync forks a generator and spawns ssh, and cancel has
    // to reach all of them, not just the pid we hold.
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Could not run rsync: {e}"))?;

    let job_id = format!("job-{}", NEXT_ID.fetch_add(1, Ordering::Relaxed));
    let mut stdin = child.stdin.take().ok_or("rsync stdin unavailable")?;
    let stdout = child.stdout.take().ok_or("rsync stdout unavailable")?;
    let stderr = child.stderr.take().ok_or("rsync stderr unavailable")?;

    // Register before the reader threads start: finish() must find the child
    // even when a tiny transfer ends immediately.
    jobs.children.lock().unwrap().insert(job_id.clone(), child);

    let list = files.clone();
    std::thread::spawn(move || {
        for f in list {
            if stdin.write_all(f.as_bytes()).is_err() || stdin.write_all(&[0u8]).is_err() {
                break;
            }
        }
        let _ = stdin.flush();
    });

    let err_app = app.clone();
    let err_id = job_id.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            if !line.trim().is_empty() {
                log(&err_app, &err_id, "error", line.trim_end());
            }
        }
    });

    // Progress lines are \r-separated, file lines \n-separated: split on both.
    let out_app = app.clone();
    let out_id = job_id.clone();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut buf: Vec<u8> = Vec::new();
        let mut chunk = [0u8; 4096];
        loop {
            let n = match reader.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => n,
            };
            buf.extend_from_slice(&chunk[..n]);
            let mut start = 0;
            for i in 0..buf.len() {
                if buf[i] == b'\r' || buf[i] == b'\n' {
                    let line = String::from_utf8_lossy(&buf[start..i]).trim().to_string();
                    start = i + 1;
                    if line.is_empty() {
                        continue;
                    }
                    match parse_progress(&out_id, &line) {
                        Some(p) => {
                            let _ = out_app.emit("transfer://progress", p);
                        }
                        None => log(&out_app, &out_id, "info", &line),
                    }
                }
            }
            buf.drain(..start);
        }
        finish(&out_app, &out_id);
    });

    let command = format!("rsync {}", args.join(" "));
    Ok(StartedJob {
        job_id,
        root,
        files,
        command,
    })
}

/// Called once rsync's stdout closes: reap the child and report the outcome.
fn finish(app: &AppHandle, job_id: &str) {
    let jobs = app_jobs(app);
    let child = jobs.children.lock().unwrap().remove(job_id);
    let code = child.and_then(|mut c| c.wait().ok()).and_then(|s| s.code());
    let cancelled = jobs.cancelled.lock().unwrap().remove(job_id);
    let message = if cancelled {
        "Cancelled. Partially transferred files were kept (--partial).".to_string()
    } else {
        exit_message(code)
    };
    let _ = app.emit(
        "transfer://done",
        DoneEvent {
            job_id: job_id.to_string(),
            code,
            cancelled,
            message,
        },
    );
}

fn app_jobs(app: &AppHandle) -> tauri::State<'_, Jobs> {
    use tauri::Manager;
    app.state::<Jobs>()
}

/// SIGKILL to the parent pid alone leaves rsync's forked sibling transferring,
/// so the UI reports "cancelled" while bytes keep landing. Signal the group.
#[cfg(unix)]
fn signal_group(pid: u32, sig: i32) {
    unsafe {
        libc::kill(-(pid as i32), sig);
    }
}

pub fn cancel(app: &AppHandle, job_id: &str) -> Result<(), String> {
    let jobs = app_jobs(app);
    jobs.cancelled.lock().unwrap().insert(job_id.to_string());
    let pid = match jobs.children.lock().unwrap().get(job_id) {
        Some(child) => child.id(),
        None => return Ok(()), // already finished
    };

    #[cfg(unix)]
    {
        // SIGTERM, not SIGKILL: rsync then cleans up and leaves the partial file
        // in place, which is what the cancel message promises.
        signal_group(pid, libc::SIGTERM);
        let app = app.clone();
        let id = job_id.to_string();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(3));
            if app_jobs(&app).children.lock().unwrap().contains_key(&id) {
                signal_group(pid, libc::SIGKILL);
            }
        });
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        if let Some(child) = jobs.children.lock().unwrap().get_mut(job_id) {
            child
                .kill()
                .map_err(|e| format!("Could not stop rsync: {e}"))?;
        }
    }
    Ok(())
}

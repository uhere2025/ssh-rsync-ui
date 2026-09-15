//! SSH-side helpers: connection descriptor, remote directory listing.
//!
//! Every remote invocation goes through `Command` argument vectors, so nothing
//! the UI sends can be re-interpreted as a local shell command. The single
//! string that *is* evaluated by a remote shell (the listing script) has all
//! user-supplied paths single-quote escaped by `sq()`.

use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub host: String,
    #[serde(default)]
    pub user: Option<String>,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub identity_file: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub kind: String, // "dir" | "file"
    pub is_link: bool,
    pub size: u64,
    pub mtime: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
    pub path: String,
    pub entries: Vec<Entry>,
}

fn clean(v: &Option<String>) -> Option<String> {
    v.as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Single-quote a string for safe interpolation into a remote POSIX shell line.
fn sq(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

impl Connection {
    /// Reject values that a leading `-` or embedded whitespace would turn into
    /// extra ssh/rsync options.
    pub fn validate(&self) -> Result<(), String> {
        let host = self.host.trim();
        if host.is_empty() {
            return Err("Host is required.".into());
        }
        if host.starts_with('-') || host.split_whitespace().count() != 1 {
            return Err("Host must be a single word and cannot start with '-'.".into());
        }
        if let Some(u) = clean(&self.user) {
            if u.starts_with('-') || u.split_whitespace().count() != 1 || u.contains('@') {
                return Err("User must be a single word without '@'.".into());
            }
        }
        if let Some(id) = clean(&self.identity_file) {
            // rsync splits the -e string on whitespace and does no unquoting,
            // so a key path with spaces cannot be passed through reliably.
            if id.split_whitespace().count() != 1 {
                return Err("Identity file path must not contain spaces.".into());
            }
        }
        Ok(())
    }

    /// `user@host` or a bare host / ssh_config alias.
    pub fn target(&self) -> String {
        match clean(&self.user) {
            Some(u) => format!("{}@{}", u, self.host.trim()),
            None => self.host.trim().to_string(),
        }
    }

    /// Options shared by `ssh` and by rsync's `-e` remote shell string.
    pub fn ssh_opts(&self) -> Vec<String> {
        let mut o = vec![
            "-o".into(),
            "BatchMode=yes".into(),
            "-o".into(),
            "ConnectTimeout=10".into(),
        ];
        if let Some(p) = self.port {
            o.push("-p".into());
            o.push(p.to_string());
        }
        if let Some(id) = clean(&self.identity_file) {
            o.push("-o".into());
            o.push("IdentitiesOnly=yes".into());
            o.push("-i".into());
            o.push(id);
        }
        o
    }
}

fn friendly(stderr: &str) -> String {
    let s = stderr.trim();
    let low = s.to_lowercase();
    if low.contains("host key verification failed") {
        return format!(
            "{s}\n\nThe host is not in known_hosts yet. Connect once from a terminal \
             (`ssh <host>`) and accept the fingerprint, then retry."
        );
    }
    if low.contains("permission denied") {
        return format!(
            "{s}\n\nKey auth failed. Make sure the key is loaded (`ssh-add -l`) or pick an \
             identity file — password prompts are disabled (BatchMode)."
        );
    }
    if s.is_empty() {
        "ssh failed with no output.".into()
    } else {
        s.to_string()
    }
}

/// Run one remote shell snippet, returning stdout.
fn run_ssh(conn: &Connection, script: &str) -> Result<String, String> {
    conn.validate()?;
    let out = Command::new("ssh")
        .args(conn.ssh_opts())
        .arg(conn.target())
        .arg(script)
        .output()
        .map_err(|e| format!("Could not run ssh: {e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
        if out.status.code() == Some(3) {
            return Err("Cannot open that directory (missing or not readable).".into());
        }
        return Err(friendly(&stderr));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

/// Resolve `~` locally-ish: the remote shell expands `$HOME` for us.
fn remote_target(path: &str) -> String {
    let p = path.trim();
    if p.is_empty() || p == "~" {
        "\"$HOME\"".to_string()
    } else if let Some(rest) = p.strip_prefix("~/") {
        format!("\"$HOME\"/{}", sq(rest))
    } else {
        sq(p)
    }
}

pub fn home_dir(conn: &Connection) -> Result<String, String> {
    let out = run_ssh(conn, "cd -P -- \"$HOME\" && pwd")?;
    Ok(out.trim().to_string())
}

pub fn list_dir(conn: &Connection, path: &str) -> Result<Listing, String> {
    // `pwd` after `cd -P` gives a canonical absolute path, so the UI never
    // builds paths out of `..` segments. GNU find is preferred; `ls -lAL` is
    // the fallback for BusyBox/BSD remotes.
    let script = format!(
        "LC_ALL=C; export LC_ALL; cd -P -- {t} 2>/dev/null || exit 3; pwd; \
         if find . -maxdepth 0 -printf '' >/dev/null 2>&1; then echo '#FIND'; \
         find . -maxdepth 1 -mindepth 1 -printf '%y\\t%Y\\t%s\\t%T@\\t%f\\n'; \
         else echo '#LS'; ls -lAL; fi",
        t = remote_target(path)
    );
    let out = run_ssh(conn, &script)?;
    let mut lines = out.split('\n');
    let cwd = lines
        .next()
        .unwrap_or("")
        .trim_end_matches('\r')
        .to_string();
    if cwd.is_empty() {
        return Err("Remote listing returned no path.".into());
    }
    let fmt = lines.next().unwrap_or("").trim().to_string();

    let mut entries: Vec<Entry> = Vec::new();
    for line in lines {
        let line = line.trim_end_matches('\r');
        if line.is_empty() {
            continue;
        }
        let e = if fmt == "#FIND" {
            parse_find(line, &cwd)
        } else {
            parse_ls(line, &cwd)
        };
        if let Some(e) = e {
            entries.push(e);
        }
    }
    entries.sort_by(|a, b| match (a.kind.as_str(), b.kind.as_str()) {
        ("dir", "file") => std::cmp::Ordering::Less,
        ("file", "dir") => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(Listing { path: cwd, entries })
}

pub fn join(dir: &str, name: &str) -> String {
    if dir.ends_with('/') {
        format!("{dir}{name}")
    } else {
        format!("{dir}/{name}")
    }
}

/// `%y \t %Y \t %s \t %T@ \t %f` — %y is the entry type, %Y the type it points
/// at when it is a symlink.
fn parse_find(line: &str, cwd: &str) -> Option<Entry> {
    let mut it = line.splitn(5, '\t');
    let y = it.next()?;
    let deref = it.next()?;
    let size: u64 = it.next()?.parse().unwrap_or(0);
    let mtime: f64 = it.next()?.parse().unwrap_or(0.0);
    let name = it.next()?.to_string();
    if name.is_empty() {
        return None;
    }
    let is_link = y == "l";
    let effective = if is_link { deref } else { y };
    Some(Entry {
        path: join(cwd, &name),
        name,
        kind: if effective == "d" { "dir" } else { "file" }.into(),
        is_link,
        size,
        mtime,
    })
}

/// Fallback parse of `ls -lAL` (symlinks already dereferenced by -L).
fn parse_ls(line: &str, cwd: &str) -> Option<Entry> {
    if line.starts_with("total ") {
        return None;
    }
    let cols: Vec<&str> = line.split_whitespace().collect();
    if cols.len() < 9 {
        return None;
    }
    let kind = if line.starts_with('d') { "dir" } else { "file" };
    let size: u64 = cols[4].parse().unwrap_or(0);
    let name = cols[8..].join(" ");
    if name == "." || name == ".." || name.is_empty() {
        return None;
    }
    Some(Entry {
        path: join(cwd, &name),
        name,
        kind: kind.into(),
        is_link: false,
        size,
        mtime: 0.0,
    })
}

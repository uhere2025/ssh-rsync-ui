# rsync downloader

Desktop UI for pulling files off a remote host: browse the remote filesystem over SSH,
tick what you want, watch rsync bring it down.

Stack: Tauri 2 (Rust) → React 19 + MUI → `ssh` / `rsync` binaries.

## Setup

One-time system deps (Tauri's webview on Ubuntu 24.04):

```
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Then:

```
npm install
npm run tauri dev      # dev window with hot reload
npm run tauri build    # bundles to src-tauri/target/release/bundle/
```

## Use

1. Host field takes `server.example.com` or an `~/.ssh/config` alias (aliases are
   suggested from that file). User/port/identity are optional overrides.
2. Connect lands in the remote `$HOME`. Navigate by clicking folders, the
   breadcrumbs, or by typing a path.
3. Tick files/folders. Selections persist across directories, so you can gather
   from several places before downloading.
4. Pick a destination folder, hit Download. Progress, rate, ETA and rsync output
   stream live; Cancel kills rsync and keeps partial files.

Auth is key/agent only — `BatchMode=yes` is always set, so no password prompt can
block the UI. If a host is not in `known_hosts` yet, `ssh <host>` once in a
terminal to accept the fingerprint.

## How a download runs

```
selection ──► common parent dir ──► rsync --files-from=- (NUL separated)
                                          source  user@host:<common root>/
                                          dest    <chosen folder>/
```

Relative layout under the common root is preserved: selecting `/var/log/a.log`
and `/var/log/b.log` gives `<dest>/a.log` and `<dest>/b.log`; selecting
`/var/log` gives `<dest>/log/...`.

Fixed flags: `-a -r -s --partial --from0 --info=progress2 --no-inc-recursive`.
UI toggles map to `-z`, `-n`, `-c`, `-u`, `--bwlimit=`, `--exclude=`.

## Layout

```
src-tauri/src/ssh.rs        connection descriptor, remote listing (find, ls fallback)
src-tauri/src/transfer.rs   rsync args, progress parsing, job registry, cancel
src-tauri/src/lib.rs        tauri commands + ~/.ssh/config & key discovery
src/App.tsx                 state, event wiring
src/components/             ConnectionBar, RemoteBrowser, SelectionPanel, TransferPanel
```

Backend events: `transfer://progress`, `transfer://log`, `transfer://done`.

## Notes / limits

- Remote listing needs a POSIX shell; GNU `find -printf` is used when available,
  `ls -lAL` otherwise (no mtimes in that mode).
- Identity file paths cannot contain spaces — rsync splits its `-e` string on
  whitespace and does no unquoting.
- Upload direction is not implemented; this pulls only.

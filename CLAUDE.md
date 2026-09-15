# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```
npm run tauri dev      # dev window, Vite HMR on :1420 (fixed port, strictPort)
npm run tauri build    # → src-tauri/target/release/bundle/
npm run build          # tsc + vite build only (frontend typecheck)
cargo check            # in src-tauri/ — fastest Rust feedback loop
cargo clippy           # in src-tauri/
```

No test suite, no linter config. Verification is `tsc` (via `npm run build`) + `cargo check`.

Ubuntu 24.04 system deps for the webview are listed in README.md.

## Architecture

```
React 19 + MUI  ──invoke──►  Tauri 2 commands  ──►  ssh / rsync child processes
     ▲                              │
     └────── transfer://* events ───┘
```

The app is a thin UI over the system `ssh` and `rsync` binaries. No SSH library — everything
shells out. Pull direction only; upload is not implemented.

### Rust side (`src-tauri/src/`)

- `lib.rs` — all five `#[tauri::command]`s (`environment`, `test_connection`, `list_dir`,
  `start_transfer`, `cancel_transfer`), plus `~/.ssh/config` alias scraping and `id_*` key
  discovery. Blocking ssh calls go through `spawn_blocking`.
- `ssh.rs` — `Connection` descriptor, `ssh_opts()` (shared by ssh and rsync's `-e`), remote
  listing. Listing runs one remote shell script: `cd -P && pwd` for a canonical path, then GNU
  `find -printf` when available, `ls -lAL` fallback (no mtimes there).
- `transfer.rs` — rsync arg building, job registry (`Jobs`: child map + cancelled set in
  `Mutex`es, managed state), progress parsing, cancel.

### Transfer model

Selection (any mix of files/dirs from any directories) → `common_root()` → rsync with
`--files-from=-` fed NUL-separated relative paths on stdin. One rsync process per job; relative
layout under the common root is preserved at the destination.

Fixed flags: `-a -r -s --partial --from0 --info=progress2 --no-inc-recursive --out-format=%n`.
`-r` is required because `--files-from` cancels `-a`'s recursion; `--no-inc-recursive` is what
makes the total percentage meaningful. UI toggles append `-z`, `-n`, `-c`, `-u`, `--bwlimit=`,
`--exclude=`.

Three threads per job: stdin writer, stderr reader, stdout reader. The stdout reader splits on
both `\r` (progress) and `\n` (file lines), and calls `finish()` when the pipe closes — that is
the single place the child is reaped and `transfer://done` is emitted. The child is registered
in `Jobs` *before* the threads spawn so a tiny transfer cannot finish before `finish()` can find
it.

Events (`transfer://progress`, `transfer://log`, `transfer://done`) are global; every payload
carries `jobId` and `App.tsx` filters against `jobRef.current`.

### Frontend (`src/`)

- `App.tsx` — all state lives here; components are presentational and take props. Connection,
  destination and options persist to `localStorage` under `ssh-rsync-ui/v1`.
- `api.ts` — the only file that touches `@tauri-apps/api`. `types.ts` mirrors the Rust structs.
- `theme.ts` — single `CONTROL = 40px` height token so every control in a toolbar row shares
  top and bottom edges; `DENSE = 32px` for in-row icon buttons. Comments there explain each
  override; do not reintroduce per-component height tweaks.

## Constraints to preserve

- **Auth is key/agent only.** `BatchMode=yes` is always set so no password prompt can block the
  UI. Unknown hosts fail until the user accepts the fingerprint from a terminal — `friendly()`
  in `ssh.rs` turns those two failures into actionable messages.
- **No shell injection surface.** Everything goes out as `Command` argv vectors. The one string
  a remote shell evaluates is the listing script, where user paths pass through `sq()`.
  `Connection::validate()` rejects values that a leading `-` or embedded whitespace would turn
  into extra ssh/rsync options.
- **Identity paths cannot contain spaces** — rsync splits its `-e` string on whitespace and does
  no unquoting. Validated, not worked around.
- Rust structs use `#[serde(rename_all = "camelCase")]`; keep `types.ts` in sync when changing
  a payload.

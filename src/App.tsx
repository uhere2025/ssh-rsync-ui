import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import HelpOutlinedIcon from "@mui/icons-material/HelpOutlined";
import { open } from "@tauri-apps/plugin-dialog";
import ConnectionBar, { type ConnState } from "./components/ConnectionBar";
import RemoteBrowser from "./components/RemoteBrowser";
import SelectionPanel from "./components/SelectionPanel";
import SetupGuide from "./components/SetupGuide";
import TransferPanel, { type LogLine } from "./components/TransferPanel";
import * as api from "./api";
import type {
  Connection,
  Entry,
  Environment,
  ProgressEvent,
  StartedJob,
  TransferOptions,
} from "./types";

const STORE = "ssh-rsync-ui/v1";

const defaultOptions: TransferOptions = {
  compress: true,
  dryRun: false,
  checksum: false,
  skipNewer: false,
  wholeFile: false,
  bwlimit: "",
  excludes: [],
};

type Persisted = {
  connection: Connection;
  destination: string;
  options: TransferOptions;
};

// rsync says nothing while it builds the file list, so the wait before the
// first progress line looks like a hang. Name what is actually happening.
function startNotice(job: StartedJob, options: TransferOptions): LogLine[] {
  const n = job.files.length;
  const lines = [
    `Building file list for ${n} item${n === 1 ? "" : "s"} under ${job.root} ` +
      `- no data moves until both sides have enumerated the selection.`,
  ];
  if (options.checksum) {
    lines.push(
      "Checksum mode is on: every selected file is read and hashed on both " +
        "ends before anything transfers.",
    );
  }
  if (!options.wholeFile) {
    lines.push(
      "Files that already exist at the destination are scanned for deltas " +
        "first; enable Whole file to skip that.",
    );
  }
  return lines.map((line) => ({ level: "info", line }));
}

function loadPersisted(): Partial<Persisted> {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}");
  } catch {
    return {};
  }
}

export default function App() {
  const saved = useMemo(loadPersisted, []);

  const [env, setEnv] = useState<Environment | null>(null);
  const [connection, setConnection] = useState<Connection>(
    saved.connection ?? { host: "", user: "", port: null, identityFile: "" },
  );
  const [connState, setConnState] = useState<ConnState>("idle");
  const [connError, setConnError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);

  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const [selected, setSelected] = useState<Map<string, Entry>>(new Map());

  const [destination, setDestination] = useState(saved.destination ?? "");
  const [options, setOptions] = useState<TransferOptions>(
    { ...defaultOptions, ...saved.options },
  );

  const [job, setJob] = useState<StartedJob | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [transferError, setTransferError] = useState<string | null>(null);
  const jobRef = useRef<string | null>(null);

  useEffect(() => {
    api
      .environment()
      .then((e) => {
        setEnv(e);
        setDestination((d) => d || e.defaultDestination);
      })
      .catch((e) => setEnvError(String(e)));
  }, []);

  useEffect(() => {
    const payload: Persisted = { connection, destination, options };
    localStorage.setItem(STORE, JSON.stringify(payload));
  }, [connection, destination, options]);

  // Transfer events are global; keep only the ones for the active job.
  useEffect(() => {
    const mine = (id: string) => jobRef.current === id;
    const unlisten = Promise.all([
      api.onProgress((e) => mine(e.jobId) && setProgress(e)),
      api.onLog(
        (e) =>
          mine(e.jobId) &&
          setLogs((prev) =>
            [...prev, { level: e.level, line: e.line }].slice(-500),
          ),
      ),
      api.onDone((e) => {
        if (!mine(e.jobId)) return;
        setRunning(false);
        setResult({ ok: e.code === 0 && !e.cancelled, message: e.message });
      }),
    ]);
    return () => {
      unlisten.then((fns) => fns.forEach((f) => f()));
    };
  }, []);

  const browse = useCallback(
    async (target: string) => {
      setListLoading(true);
      setListError(null);
      try {
        const listing = await api.listDir(connection, target);
        setPath(listing.path);
        setEntries(listing.entries);
      } catch (e) {
        setListError(String(e));
      } finally {
        setListLoading(false);
      }
    },
    [connection],
  );

  const connect = useCallback(async () => {
    setConnState("connecting");
    setConnError(null);
    try {
      const home = await api.testConnection(connection);
      setConnState("connected");
      await browse(home);
    } catch (e) {
      setConnState("error");
      setConnError(String(e));
      setEntries([]);
    }
  }, [connection, browse]);

  const toggle = (entry: Entry) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.set(entry.path, entry);
      return next;
    });

  const toggleMany = (items: Entry[], select: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const e of items) {
        if (select) next.set(e.path, e);
        else next.delete(e.path);
      }
      return next;
    });

  const pickFolder = async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      defaultPath: destination || undefined,
    });
    if (typeof picked === "string") setDestination(picked);
  };

  const start = async () => {
    setTransferError(null);
    setResult(null);
    setProgress(null);
    setLogs([]);
    try {
      const started = await api.startTransfer(
        connection,
        [...selected.keys()],
        destination,
        options,
      );
      jobRef.current = started.jobId;
      setJob(started);
      setRunning(true);
      // rsync builds the whole file list before it moves a byte
      // (--no-inc-recursive), and says nothing while it does. Without this the
      // wait before the first progress line looks like a hang.
      setLogs(startNotice(started, options));
    } catch (e) {
      setTransferError(String(e));
    }
  };

  const cancel = async () => {
    if (jobRef.current) await api.cancelTransfer(jobRef.current);
  };

  const missingTools = env && (!env.rsync || !env.ssh);

  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        p: 1.5,
        boxSizing: "border-box",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      <ConnectionBar
        value={connection}
        onChange={setConnection}
        hosts={env?.hosts ?? []}
        identities={env?.identities ?? []}
        state={connState}
        error={connError}
        onConnect={connect}
        onHelp={() => setGuideOpen(true)}
      />

      {envError && (
        <Alert severity="error" sx={{ flexShrink: 0, whiteSpace: "pre-wrap" }}>
          Could not inspect the local environment: {envError}
        </Alert>
      )}

      {missingTools && (
        <Alert severity="error" sx={{ flexShrink: 0 }}>
          {!env?.ssh && "ssh not found. "}
          {!env?.rsync && "rsync not found. "}
          Install them and restart the app.
        </Alert>
      )}

      <Box
        sx={{
          display: "flex",
          gap: 1.5,
          flex: 1,
          minHeight: 0,
          flexDirection: { xs: "column", md: "row" },
        }}
      >
        <Box sx={{ display: "flex", flex: 1.4, minWidth: 0, minHeight: 0 }}>
          {connState === "connected" || entries.length > 0 ? (
            <RemoteBrowser
              path={path}
              entries={entries}
              loading={listLoading}
              error={listError}
              selected={new Set(selected.keys())}
              showHidden={showHidden}
              onShowHidden={setShowHidden}
              onNavigate={browse}
              onRefresh={() => browse(path)}
              onHome={() => browse("~")}
              onToggle={toggle}
              onToggleMany={toggleMany}
            />
          ) : (
            <Box
              sx={{
                flex: 1,
                display: "grid",
                placeItems: "center",
                color: "text.secondary",
              }}
            >
              <Stack spacing={1} sx={{ alignItems: "center" }}>
                <Typography variant="h6">Not connected</Typography>
                <Typography variant="body2">
                  Enter a host (or an ~/.ssh/config alias) and press Connect.
                </Typography>
                <Typography variant="caption">
                  Auth uses your ssh keys / agent — password prompts are disabled.
                </Typography>
                <Button
                  startIcon={<HelpOutlinedIcon />}
                  onClick={() => setGuideOpen(true)}
                >
                  Setup guide
                </Button>
              </Stack>
            </Box>
          )}
        </Box>

        <Stack
          spacing={1.5}
          sx={{
            width: { xs: "auto", md: 430 },
            flexShrink: 0,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          <SelectionPanel
            items={[...selected.values()]}
            onRemove={(p) =>
              setSelected((prev) => {
                const next = new Map(prev);
                next.delete(p);
                return next;
              })
            }
            onClear={() => setSelected(new Map())}
          />
          <TransferPanel
            destination={destination}
            onDestination={setDestination}
            onBrowse={pickFolder}
            options={options}
            onOptions={setOptions}
            selectedCount={selected.size}
            connected={connState === "connected"}
            running={running}
            job={job}
            progress={progress}
            logs={logs}
            result={result}
            error={transferError}
            onStart={start}
            onCancel={cancel}
          />
        </Stack>
      </Box>

      <SetupGuide
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        host={connection.host}
        user={connection.user ?? ""}
      />
    </Box>
  );
}

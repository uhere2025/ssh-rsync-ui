import { useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import StopIcon from "@mui/icons-material/Stop";
import type { ProgressEvent, StartedJob, TransferOptions } from "../types";
import { bytes } from "../format";

export type LogLine = { level: "info" | "error"; line: string };

type Props = {
  destination: string;
  onDestination: (v: string) => void;
  onBrowse: () => void;
  options: TransferOptions;
  onOptions: (o: TransferOptions) => void;
  selectedCount: number;
  connected: boolean;
  running: boolean;
  job: StartedJob | null;
  progress: ProgressEvent | null;
  logs: LogLine[];
  result: { ok: boolean; message: string } | null;
  error: string | null;
  onStart: () => void;
  onCancel: () => void;
};

export default function TransferPanel(p: Props) {
  const [excludeDraft, setExcludeDraft] = useState(p.options.excludes.join(", "));
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [p.logs]);

  const set = (patch: Partial<TransferOptions>) =>
    p.onOptions({ ...p.options, ...patch });

  const toggle = (
    key: "compress" | "dryRun" | "checksum" | "skipNewer",
    label: string,
    hint: string,
  ) => (
    <Tooltip title={hint}>
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={p.options[key]}
            onChange={(e) => set({ [key]: e.target.checked })}
          />
        }
        label={<Typography variant="body2">{label}</Typography>}
      />
    </Tooltip>
  );

  return (
    <Paper variant="outlined" sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <TextField
          size="small"
          label="Download to"
          value={p.destination}
          onChange={(e) => p.onDestination(e.target.value)}
          sx={{ flex: 1 }}
        />
        <Tooltip title="Choose folder">
          <IconButton onClick={p.onBrowse}>
            <FolderOpenIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 2 }}>
        {toggle("compress", "Compress", "rsync -z: compress data in transit")}
        {toggle("skipNewer", "Skip newer", "rsync -u: keep newer local files")}
        {toggle("checksum", "Checksum", "rsync -c: compare by checksum, not size/time")}
        {toggle("dryRun", "Dry run", "rsync -n: simulate, transfer nothing")}
      </Box>

      <Accordion disableGutters elevation={0} sx={{ "&:before": { display: "none" } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0, minHeight: 0 }}>
          <Typography variant="body2" color="text.secondary">
            More options
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 0 }}>
          <Stack spacing={1.5}>
            <TextField
              size="small"
              label="Bandwidth limit"
              placeholder="e.g. 2M"
              value={p.options.bwlimit}
              onChange={(e) => set({ bwlimit: e.target.value })}
            />
            <TextField
              size="small"
              label="Exclude patterns (comma separated)"
              placeholder="*.tmp, node_modules"
              value={excludeDraft}
              onChange={(e) => setExcludeDraft(e.target.value)}
              onBlur={() =>
                set({
                  excludes: excludeDraft
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Button
          variant="contained"
          startIcon={<DownloadIcon />}
          disabled={
            !p.connected ||
            p.running ||
            p.selectedCount === 0 ||
            !p.destination.trim()
          }
          onClick={p.onStart}
        >
          {p.options.dryRun ? "Dry run" : "Download"}
          {p.selectedCount > 0 ? ` (${p.selectedCount})` : ""}
        </Button>
        <Button
          color="error"
          startIcon={<StopIcon />}
          disabled={!p.running}
          onClick={p.onCancel}
        >
          Cancel
        </Button>
        {p.job && (
          <Chip
            size="small"
            variant="outlined"
            label={`root ${p.job.root}`}
            sx={{ maxWidth: 260 }}
          />
        )}
      </Stack>

      {p.error && (
        <Alert severity="error" sx={{ whiteSpace: "pre-wrap" }}>
          {p.error}
        </Alert>
      )}
      {p.result && (
        <Alert severity={p.result.ok ? "success" : "warning"}>
          {p.result.message}
        </Alert>
      )}

      {(p.running || p.progress) && (
        <Box>
          <LinearProgress
            variant={p.progress ? "determinate" : "indeterminate"}
            value={p.progress?.percent ?? 0}
          />
          <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {Math.round(p.progress?.percent ?? 0)}%
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {bytes(p.progress?.bytes ?? 0)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {p.progress?.rate ?? ""}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {p.progress?.eta ? `ETA ${p.progress.eta}` : ""}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {p.progress?.filesTotal
                ? `${p.progress.filesDone}/${p.progress.filesTotal} files`
                : ""}
            </Typography>
          </Stack>
        </Box>
      )}

      <Box
        ref={logRef}
        sx={{
          height: 170,
          overflow: "auto",
          bgcolor: "background.default",
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          p: 1,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        {p.logs.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            rsync output appears here.
          </Typography>
        ) : (
          p.logs.map((l, i) => (
            <Box
              key={i}
              sx={{
                color: l.level === "error" ? "error.main" : "text.secondary",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {l.line}
            </Box>
          ))
        )}
      </Box>

      {p.job && (
        <Tooltip title={p.job.command}>
          <Typography variant="caption" color="text.disabled" noWrap>
            {p.job.command}
          </Typography>
        </Tooltip>
      )}
    </Paper>
  );
}

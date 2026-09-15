import {
  Alert,
  Autocomplete,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  Paper,
  Stack,
  TextField,
} from "@mui/material";
import HelpOutlinedIcon from "@mui/icons-material/HelpOutlined";
import LinkIcon from "@mui/icons-material/Link";
import type { Connection } from "../types";

export type ConnState = "idle" | "connecting" | "connected" | "error";

type Props = {
  value: Connection;
  onChange: (c: Connection) => void;
  hosts: string[];
  identities: string[];
  state: ConnState;
  error: string | null;
  onConnect: () => void;
  onHelp: () => void;
};

export default function ConnectionBar({
  value,
  onChange,
  hosts,
  identities,
  state,
  error,
  onConnect,
  onHelp,
}: Props) {
  const busy = state === "connecting";
  const set = (patch: Partial<Connection>) => onChange({ ...value, ...patch });

  return (
    <Paper variant="outlined" sx={{ p: 2, flexShrink: 0 }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        useFlexGap
        spacing={1.5}
        sx={{ alignItems: { md: "center" }, flexWrap: { md: "wrap" } }}
      >
        <Autocomplete
          freeSolo
          options={hosts}
          inputValue={value.host}
          onInputChange={(_e, v) => set({ host: v })}
          sx={{ minWidth: 220, flex: 1 }}
          renderInput={(params) => (
            <TextField
              {...params}
              size="small"
              label="Host or ssh_config alias"
              placeholder="server.example.com"
            />
          )}
        />
        <TextField
          label="User"
          placeholder="(from ssh config)"
          sx={{ width: 160 }}
          value={value.user ?? ""}
          onChange={(e) => set({ user: e.target.value })}
        />
        <TextField
          label="Port"
          placeholder="22"
          sx={{ width: 96 }}
          value={value.port ?? ""}
          slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 5 } }}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "");
            const n = parseInt(digits, 10);
            set({ port: n >= 1 && n <= 65535 ? n : null });
          }}
        />
        <Autocomplete
          freeSolo
          options={identities}
          inputValue={value.identityFile ?? ""}
          onInputChange={(_e, v) => set({ identityFile: v })}
          sx={{ minWidth: 200, flex: 1 }}
          renderInput={(params) => (
            <TextField
              {...params}
              size="small"
              label="Identity file"
              placeholder="(agent / ssh config)"
            />
          )}
        />
        {/* Action, status and help stay one row of their own, so stacking the
            fields on a narrow window does not stretch them to full width. */}
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", flexShrink: 0 }}
        >
          <Button
            variant="contained"
            onClick={onConnect}
            disabled={busy || !value.host.trim()}
            startIcon={
              busy ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                <LinkIcon />
              )
            }
            sx={{ whiteSpace: "nowrap", flexShrink: 0 }}
          >
            {state === "connected" ? "Reconnect" : "Connect"}
          </Button>
          <Chip
            size="small"
            label={
              state === "connected"
                ? "connected"
                : state === "error"
                  ? "failed"
                  : busy
                    ? "connecting"
                    : "offline"
            }
            color={
              state === "connected"
                ? "success"
                : state === "error"
                  ? "error"
                  : "default"
            }
            variant={state === "connected" ? "filled" : "outlined"}
          />
          <Tooltip title="Setup guide">
            <IconButton onClick={onHelp}>
              <HelpOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      {error && (
        <Alert
          severity="error"
          sx={{ mt: 1.5, whiteSpace: "pre-wrap" }}
          action={
            <Button color="inherit" size="small" onClick={onHelp}>
              Setup guide
            </Button>
          }
        >
          {error}
        </Alert>
      )}
    </Paper>
  );
}

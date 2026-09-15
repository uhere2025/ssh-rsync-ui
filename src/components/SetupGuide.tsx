import { useState, type ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

type Props = {
  open: boolean;
  onClose: () => void;
  host: string;
  user: string;
};

function Command({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — the text is selectable anyway */
    }
  };
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{
        alignItems: "center",
        bgcolor: "background.default",
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        pl: 1.5,
        pr: 0.5,
        py: 0.5,
      }}
    >
      <Box
        component="code"
        sx={{
          flex: 1,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          userSelect: "text",
        }}
      >
        {children}
      </Box>
      <Tooltip title={copied ? "Copied" : "Copy"}>
        <IconButton size="small" onClick={copy}>
          {copied ? (
            <CheckIcon fontSize="small" color="success" />
          ) : (
            <ContentCopyIcon fontSize="small" />
          )}
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        {n}. {title}
      </Typography>
      <Stack spacing={1}>{children}</Stack>
    </Box>
  );
}

export default function SetupGuide({ open, onClose, host, user }: Props) {
  const h = host.trim() || "server.example.com";
  const target = user.trim() ? `${user.trim()}@${h}` : h;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle>Setup guide</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          <Alert severity="info">
            This app authenticates with SSH keys only — password prompts are
            disabled (<code>BatchMode=yes</code>) so a hidden prompt can never
            freeze the transfer. One-time key setup below.
          </Alert>

          <Step n={1} title="Create a key (skip if ~/.ssh/id_ed25519 exists)">
            <Command>ssh-keygen -t ed25519</Command>
            <Typography variant="caption" color="text.secondary">
              Press Enter three times for the defaults. A passphrase is optional
              — see Troubleshooting if you set one.
            </Typography>
          </Step>

          <Step n={2} title="Install the key on the remote host">
            <Command>{`ssh-copy-id ${target}`}</Command>
            <Typography variant="caption" color="text.secondary">
              Asks for the remote password once. This is the only step that needs
              a terminal.
            </Typography>
          </Step>

          <Step n={3} title="Verify — must print OK with no prompt">
            <Command>{`ssh ${target} true && echo OK`}</Command>
          </Step>

          <Divider />

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Connect
            </Typography>
            <Table size="small">
              <TableBody>
                {[
                  ["Host", "IP, hostname, or an ~/.ssh/config alias"],
                  ["User", "remote username — blank uses your ssh config"],
                  ["Port", "blank means 22"],
                  [
                    "Identity file",
                    "blank auto-detects ~/.ssh/id_* and the agent",
                  ],
                ].map(([k, v]) => (
                  <TableRow key={k}>
                    <TableCell sx={{ width: 140, border: 0 }}>
                      <Typography variant="body2">{k}</Typography>
                    </TableCell>
                    <TableCell sx={{ border: 0 }}>
                      <Typography variant="body2" color="text.secondary">
                        {v}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Download
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Connect lands in the remote <code>$HOME</code>. Click folders,
              breadcrumbs, or type a path to navigate. Tick files and folders —
              the selection survives navigation, so you can gather from several
              directories. Set <b>Download to</b>, then press Download; progress,
              rate, ETA and rsync output stream live, and Cancel stops rsync
              while keeping partial files for a later resume.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Everything is pulled under one common parent folder: selecting{" "}
              <code>/var/log/a.log</code> and <code>/var/log/b.log</code> gives{" "}
              <code>a.log</code> and <code>b.log</code> in the destination;
              selecting <code>/var/log</code> gives a <code>log/</code> folder.
            </Typography>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Troubleshooting
            </Typography>
            <Stack spacing={1.5}>
              <Box>
                <Typography variant="body2">
                  <b>Permission denied (publickey,password)</b> — no usable key.
                  Run steps 1–3.
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" gutterBottom>
                  <b>Key has a passphrase</b> — load it once per login session:
                </Typography>
                <Command>ssh-add ~/.ssh/id_ed25519</Command>
              </Box>
              <Box>
                <Typography variant="body2" gutterBottom>
                  <b>Host key verification failed</b> — accept the fingerprint
                  once:
                </Typography>
                <Command>{`ssh ${target}`}</Command>
              </Box>
              <Box>
                <Typography variant="body2">
                  <b>rsync: command not found</b> — rsync must exist on both
                  ends: <code>sudo apt install rsync</code> on the remote host.
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2">
                  <b>Identity file with spaces</b> — not supported; rsync splits
                  its remote-shell string on whitespace. Move the key to a path
                  without spaces.
                </Typography>
              </Box>
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

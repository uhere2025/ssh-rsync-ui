import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Breadcrumbs,
  Checkbox,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  LinearProgress,
  Link,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import FolderIcon from "@mui/icons-material/Folder";
import HomeIcon from "@mui/icons-material/Home";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import LinkIcon from "@mui/icons-material/Link";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import type { Entry } from "../types";
import { bytes, crumbs, parentOf, when } from "../format";

type Props = {
  path: string;
  entries: Entry[];
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  showHidden: boolean;
  onShowHidden: (v: boolean) => void;
  onNavigate: (path: string) => void;
  onRefresh: () => void;
  onHome: () => void;
  onToggle: (entry: Entry) => void;
  onToggleMany: (entries: Entry[], select: boolean) => void;
};

export default function RemoteBrowser({
  path,
  entries,
  loading,
  error,
  selected,
  showHidden,
  onShowHidden,
  onNavigate,
  onRefresh,
  onHome,
  onToggle,
  onToggleMany,
}: Props) {
  const [filter, setFilter] = useState("");
  const [pathDraft, setPathDraft] = useState(path);

  // Follow navigation that did not come from this field.
  useEffect(() => setPathDraft(path), [path]);

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (showHidden || !e.name.startsWith(".")) &&
        (!f || e.name.toLowerCase().includes(f)),
    );
  }, [entries, filter, showHidden]);

  const allSelected =
    visible.length > 0 && visible.every((e) => selected.has(e.path));
  const someSelected = visible.some((e) => selected.has(e.path));

  return (
    <Paper
      variant="outlined"
      sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", p: 1.5 }}>
        <Tooltip title="Home">
          <span>
            <IconButton size="small" onClick={onHome} disabled={loading}>
              <HomeIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Parent folder">
          <span>
            <IconButton
              size="small"
              onClick={() => onNavigate(parentOf(path))}
              disabled={loading || path === "/"}
            >
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Refresh">
          <span>
            <IconButton size="small" onClick={onRefresh} disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <TextField
          size="small"
          value={pathDraft}
          onChange={(e) => setPathDraft(e.target.value)}
          onFocus={() => setPathDraft(path)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onNavigate(pathDraft.trim());
          }}
          placeholder="/var/log"
          sx={{ flex: 1 }}
        />
        <TextField
          size="small"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter"
          sx={{ width: 180 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={showHidden}
              onChange={(e) => onShowHidden(e.target.checked)}
            />
          }
          label={<Typography variant="body2">Hidden</Typography>}
        />
      </Stack>

      <Box sx={{ px: 1.5, pb: 1 }}>
        <Breadcrumbs maxItems={6} sx={{ fontSize: 13 }}>
          {crumbs(path).map((c) => (
            <Link
              key={c.path}
              component="button"
              underline="hover"
              color={c.path === path ? "text.primary" : "primary"}
              onClick={() => onNavigate(c.path)}
              sx={{ fontSize: 13 }}
            >
              {c.label}
            </Link>
          ))}
        </Breadcrumbs>
      </Box>

      {loading && <LinearProgress />}
      <Divider />

      {error ? (
        <Alert severity="error" sx={{ m: 1.5, whiteSpace: "pre-wrap" }}>
          {error}
        </Alert>
      ) : (
        <Box sx={{ overflow: "auto", flex: 1, minHeight: 0 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    checked={allSelected}
                    indeterminate={someSelected && !allSelected}
                    onChange={(e) => onToggleMany(visible, e.target.checked)}
                    disabled={visible.length === 0}
                  />
                </TableCell>
                <TableCell>Name</TableCell>
                <TableCell align="right" sx={{ width: 110 }}>
                  Size
                </TableCell>
                <TableCell sx={{ width: 190 }}>Modified</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((e) => (
                <TableRow key={e.path} hover selected={selected.has(e.path)}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={selected.has(e.path)}
                      onChange={() => onToggle(e)}
                    />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      {e.kind === "dir" ? (
                        <FolderIcon fontSize="small" color="primary" />
                      ) : (
                        <InsertDriveFileOutlinedIcon
                          fontSize="small"
                          color="disabled"
                        />
                      )}
                      {e.kind === "dir" ? (
                        <Link
                          component="button"
                          underline="hover"
                          onClick={() => onNavigate(e.path)}
                          sx={{ textAlign: "left" }}
                        >
                          {e.name}
                        </Link>
                      ) : (
                        <Typography variant="body2">{e.name}</Typography>
                      )}
                      {e.isLink && (
                        <Tooltip title="symlink">
                          <LinkIcon fontSize="inherit" color="disabled" />
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="caption" color="text.secondary">
                      {e.kind === "dir" ? "—" : bytes(e.size)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {when(e.mtime)}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                      Nothing to show here.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      )}
    </Paper>
  );
}

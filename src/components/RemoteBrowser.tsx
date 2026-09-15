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
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <Stack
        direction="row"
        useFlexGap
        spacing={1}
        sx={{ alignItems: "center", flexWrap: "wrap", p: 1.5 }}
      >
        <Tooltip title="Home">
          <Box component="span" sx={{ display: "inline-flex" }}>
            <IconButton onClick={onHome} disabled={loading}>
              <HomeIcon fontSize="small" />
            </IconButton>
          </Box>
        </Tooltip>
        <Tooltip title="Parent folder">
          <Box component="span" sx={{ display: "inline-flex" }}>
            <IconButton
              onClick={() => onNavigate(parentOf(path))}
              disabled={loading || path === "/"}
            >
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
          </Box>
        </Tooltip>
        <Tooltip title="Refresh">
          <Box component="span" sx={{ display: "inline-flex" }}>
            <IconButton onClick={onRefresh} disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Box>
        </Tooltip>
        <TextField
          size="small"
          value={pathDraft}
          onChange={(e) => setPathDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onNavigate(pathDraft.trim());
          }}
          placeholder="/var/log"
          sx={{ flex: "1 1 200px", minWidth: 160 }}
        />
        <TextField
          size="small"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter"
          sx={{ width: 150, flexShrink: 0 }}
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
          sx={{ flexShrink: 0, mr: 0 }}
        />
      </Stack>

      <Box sx={{ px: 1.5, pb: 1 }}>
        <Breadcrumbs
          maxItems={6}
          separator="›"
          sx={{ typography: "body2", minHeight: 24, alignItems: "center" }}
        >
          {crumbs(path).map((c) => (
            <Link
              key={c.path}
              component="button"
              underline="hover"
              color={c.path === path ? "text.primary" : "primary"}
              onClick={() => onNavigate(c.path)}
            >
              {c.label}
            </Link>
          ))}
        </Breadcrumbs>
      </Box>

      <Box sx={{ height: 4, flexShrink: 0 }}>
        {loading && <LinearProgress sx={{ height: 4 }} />}
      </Box>
      <Divider />

      {error ? (
        <Alert severity="error" sx={{ m: 1.5, whiteSpace: "pre-wrap" }}>
          {error}
        </Alert>
      ) : (
        <Box sx={{ overflow: "auto", flex: 1, minHeight: 0 }}>
          <Table size="small" stickyHeader sx={{ tableLayout: "fixed" }}>
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
                <TableCell align="right" sx={{ width: 92, whiteSpace: "nowrap" }}>
                  Size
                </TableCell>
                <TableCell sx={{ width: 150, whiteSpace: "nowrap" }}>
                  Modified
                </TableCell>
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
                  <TableCell sx={{ overflow: "hidden" }}>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: "center", minWidth: 0 }}
                    >
                      {e.kind === "dir" ? (
                        <FolderIcon
                          fontSize="small"
                          color="primary"
                          sx={{ flexShrink: 0 }}
                        />
                      ) : (
                        <InsertDriveFileOutlinedIcon
                          fontSize="small"
                          color="disabled"
                          sx={{ flexShrink: 0 }}
                        />
                      )}
                      {e.kind === "dir" ? (
                        <Link
                          component="button"
                          variant="body2"
                          underline="hover"
                          onClick={() => onNavigate(e.path)}
                          title={e.name}
                          sx={{
                            textAlign: "left",
                            minWidth: 0,
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {e.name}
                        </Link>
                      ) : (
                        <Typography variant="body2" noWrap title={e.name}>
                          {e.name}
                        </Typography>
                      )}
                      {e.isLink && (
                        <Tooltip title="symlink">
                          <LinkIcon
                            fontSize="inherit"
                            color="disabled"
                            sx={{ flexShrink: 0 }}
                          />
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    <Typography variant="caption" color="text.secondary">
                      {e.kind === "dir" ? "—" : bytes(e.size)}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
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

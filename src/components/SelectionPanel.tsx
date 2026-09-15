import {
  Box,
  Button,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import CloseIcon from "@mui/icons-material/Close";
import type { Entry } from "../types";
import { bytes } from "../format";

type Props = {
  items: Entry[];
  onRemove: (path: string) => void;
  onClear: () => void;
};

export default function SelectionPanel({ items, onRemove, onClear }: Props) {
  const files = items.filter((i) => i.kind === "file");
  const dirs = items.length - files.length;
  const known = files.reduce((a, b) => a + b.size, 0);

  return (
    <Paper
      variant="outlined"
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: "1 1 auto",
        minWidth: 0,
        minHeight: 168,
        overflow: "hidden",
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ alignItems: "center", flexShrink: 0, minHeight: 32, p: 1.5, pb: 1 }}
      >
        <Typography variant="subtitle2" sx={{ flex: 1, minWidth: 0 }} noWrap>
          Selection
        </Typography>
        <Chip
          size="small"
          label={`${files.length} files`}
          sx={{ flexShrink: 0 }}
        />
        {dirs > 0 && (
          <Chip size="small" label={`${dirs} folders`} sx={{ flexShrink: 0 }} />
        )}
        <Button
          size="small"
          startIcon={<ClearAllIcon />}
          onClick={onClear}
          disabled={items.length === 0}
          sx={{ flexShrink: 0 }}
        >
          Clear
        </Button>
      </Stack>

      <Box
        sx={{ overflowY: "auto", overflowX: "hidden", flex: 1, minHeight: 0 }}
      >
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            Tick files or folders on the left. Selections survive navigation, so
            you can collect from several directories before downloading.
          </Typography>
        ) : (
          <List dense disablePadding>
            {items.map((i) => (
              <ListItem
                key={i.path}
                secondaryAction={
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={() => onRemove(i.path)}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemText
                  primary={i.name}
                  secondary={`${i.path}${i.kind === "file" ? ` · ${bytes(i.size)}` : " · folder"}`}
                  slotProps={{
                    primary: { variant: "body2", noWrap: true },
                    secondary: {
                      variant: "caption",
                      noWrap: true,
                      title: i.path,
                    },
                  }}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      {files.length > 0 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ px: 2, py: 1, flexShrink: 0 }}
        >
          {bytes(known)} in files{dirs > 0 ? " (folders not counted)" : ""}
        </Typography>
      )}
    </Paper>
  );
}

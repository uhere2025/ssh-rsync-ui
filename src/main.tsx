import React from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import App from "./App";

// One control height for the whole app: inputs, buttons and icon buttons all
// line up in the mixed rows the panels are built from.
const CONTROL = 38;

const theme = createTheme({
  colorSchemes: { dark: true, light: true },
  shape: { borderRadius: 8 },
  typography: { fontSize: 13 },
  components: {
    MuiTextField: { defaultProps: { size: "small" } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        // Padding is set on the root so text, outlined and contained buttons
        // indent their label identically when they sit next to each other.
        root: { minHeight: CONTROL, paddingInline: 14 },
        startIcon: { marginRight: 6, marginLeft: -2 },
      },
    },
    MuiIconButton: {
      defaultProps: { size: "small" },
      styleOverrides: { sizeSmall: { width: 30, height: 30 } },
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);

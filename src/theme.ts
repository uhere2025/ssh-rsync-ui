import { createTheme } from "@mui/material";

// One control height for the whole app. 40px is what MUI's small outlined
// input measures, so buttons and icon buttons are sized to it rather than the
// other way round: every control in a toolbar row shares the same top and
// bottom edge instead of only being centre-aligned.
const CONTROL = 40;
// Dense square for icon buttons inside lists and table rows.
const DENSE = 32;

export const theme = createTheme({
  colorSchemes: { dark: true, light: true },
  shape: { borderRadius: 8 },
  typography: {
    fontSize: 13,
    // No webfont ships with the app, so MUI's Roboto default silently falls
    // back to Helvetica. Ask for the platform's UI font by name instead.
    fontFamily: [
      "system-ui",
      "-apple-system",
      "Segoe UI",
      "Cantarell",
      "Ubuntu",
      "Helvetica Neue",
      "sans-serif",
    ].join(", "),
  },
  components: {
    MuiTextField: { defaultProps: { size: "small" } },
    MuiInputBase: {
      // A small outlined field measures 38.34px on its own, which is where the
      // old half-pixel drift against the buttons came from. Pin it to the token
      // instead; the root is a centring flex box, so the text stays centred.
      styleOverrides: { root: { minHeight: CONTROL } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        // Padding is set on the root so text, outlined and contained buttons
        // indent their label identically when they sit next to each other.
        root: { minHeight: CONTROL, paddingInline: 14 },
        // MUI sizes button icons at 20px against a 14px label; our label is
        // 13px, so the icons come down with it and the pair reads as one unit.
        startIcon: {
          marginRight: 6,
          marginLeft: -2,
          "& > *:nth-of-type(1)": { fontSize: 18 },
        },
        endIcon: { "& > *:nth-of-type(1)": { fontSize: 18 } },
        sizeSmall: { minHeight: DENSE, paddingInline: 10 },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        // Default (medium) matches the inputs it stands beside in a toolbar;
        // small is the dense square for list and table rows.
        sizeMedium: { width: CONTROL, height: CONTROL },
        sizeSmall: { width: DENSE, height: DENSE },
      },
    },
    MuiLink: {
      // component="button" renders a real <button>, and a button does not
      // inherit the page font: without this, folder names in the table and the
      // breadcrumb segments render in the UA's own button font, a different
      // family and line-height from the text beside them.
      styleOverrides: {
        button: {
          font: "inherit",
          letterSpacing: "inherit",
          verticalAlign: "baseline",
        },
      },
    },
    MuiFormControlLabel: {
      // MUI's -11px inset lines a full-size checkbox up with body text; our
      // switches sit in flex rows where it just pulls them out of the row.
      styleOverrides: { root: { marginLeft: 0, marginRight: 0 } },
    },
    MuiChip: {
      styleOverrides: { sizeSmall: { height: 26 } },
    },
  },
});

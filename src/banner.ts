/**
 * CLI startup banner for the CBA-MCP server.
 * Printed to stderr at launch so it never pollutes the MCP stdio JSON stream.
 */

// ANSI colour helpers — gracefully degrade if terminal doesn't support colour
const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  cyan:   "\x1b[36m",
  yellow: "\x1b[33m",
  green:  "\x1b[32m",
  white:  "\x1b[97m",
};

const B = C.cyan + C.bold;   // border colour
const L = C.yellow + C.bold; // logo colour
const T = C.white + C.bold;  // title colour
const D = C.dim;              // dim text
const R = C.reset;            // reset

// Width of the inner content area (between the border pipes)
const W = 71;

/** Pad a string to exactly W chars, centred. */
function centre(text: string, colour = ""): string {
  // Strip ANSI codes to calculate visible length
  const visLen = text.replace(/\x1b\[[0-9;]*m/g, "").length;
  const pad = Math.max(0, W - visLen);
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return `${B}║${R}${" ".repeat(left)}${colour}${text}${R}${" ".repeat(right)}${B}║${R}`;
}

/** A blank border row. */
const BLANK = `${B}║${R}${" ".repeat(W)}${B}║${R}`;

/** The full border top / divider / bottom. */
const TOP = `${B}╔${"═".repeat(W)}╗${R}`;
const MID = `${B}╠${"═".repeat(W)}╣${R}`;
const BOT = `${B}╚${"═".repeat(W)}╝${R}`;

// ASCII art logo — "CBFA  MCP"
const LOGO: string[] = [
  " ██████╗██████╗ ███████╗ █████╗      ███╗   ███╗ ██████╗██████╗  ",
  "██╔════╝██╔══██╗██╔════╝██╔══██╗     ████╗ ████║██╔════╝██╔══██╗ ",
  "██║     ██████╔╝█████╗  ███████║     ██╔████╔██║██║     ██████╔╝ ",
  "██║     ██╔══██╗██╔══╝  ██╔══██║     ██║╚██╔╝██║██║     ██╔═══╝  ",
  "╚██████╗██████╔╝██║     ██║  ██║     ██║ ╚═╝ ██║╚██████╗██║      ",
  " ╚═════╝╚═════╝ ╚═╝     ╚═╝  ╚═╝     ╚═╝     ╚═╝ ╚═════╝╚═╝      ",
];

export function printBanner(): void {
  const lines: string[] = [
    "",
    TOP,
    BLANK,
    ...LOGO.map((row) => centre(row, L)),
    BLANK,
    MID,
    BLANK,
    centre("S E R V E R   ·   v 1 . 0 . 0", T),
    centre("Custom Branded Apps Intelligence Platform", D),
    BLANK,
    centre("© 2026  ABC Fitness Solutions", D),
    BLANK,
    BOT,
    "",
  ];

  process.stderr.write(lines.join("\n") + "\n");
}

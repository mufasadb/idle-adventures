// The web event log: stored as structured DATA, formatted to HTML at draw time.
import type { GameEvent } from "../engine/types";
import type { Pos } from "./route";
import { formatEvent, name, round1 } from "../render/render";

// Log stored as DATA (exm), not pre-rendered HTML — so a reload can re-format, filter,
// or restyle past entries. Reduce events keep their GameEvent (re-rendered live via
// formatEvent); one-off UI notices are notes; an auto-walk summary is its own variant.
export type LogEntry =
  | { t: "event"; e: GameEvent }
  | { t: "note"; text: string }
  | { t: "walk"; steps: number; pos: Pos; net: number; ate: number; gathered: number };

// Render a stored log entry to HTML at draw time (exm): events re-format live via the
// shared formatEvent (run-ended's \n → <br>), notes are verbatim, a walk rebuilds its
// summary from the structured fields.
export function formatLogEntry(entry: LogEntry): string {
  switch (entry.t) {
    case "event": return formatEvent(entry.e, name).replace(/\n/g, "<br>");
    case "note": return entry.text;
    case "walk": {
      const delta = entry.net >= 0 ? `−${round1(entry.net)}e` : `+${round1(-entry.net)}e`;
      const ateClause = entry.ate > 0 ? ` · auto-ate ${entry.ate}× ration` : "";
      const gatheredClause = entry.gathered > 0 ? ` · auto-gathered ${entry.gathered}× node${entry.gathered !== 1 ? "s" : ""}` : "";
      return `🚶 walked ${entry.steps} tile${entry.steps !== 1 ? "s" : ""} → (${entry.pos.x},${entry.pos.y}) · ${delta}${ateClause}${gatheredClause}`;
    }
  }
}

export function logView(log: LogEntry[]): string {
  return `<section class="logbox"><h2>Log</h2>${log.length ? log.map((l) => `<div class="logline">${formatLogEntry(l)}</div>`).join("") : `<span class="muted">—</span>`}</section>`;
}

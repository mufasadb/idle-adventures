# Idle Adventures — UX Prototype Decisions

**Prototype file:** `docs/ux-prototype/prototype.html`
**Based on:** Gameplay loop vision from bead ia-5oo
**Screens covered:** 6 screens (Town Hub, Bank, Skills, Expedition Prep, Active Grid, Mining Minigame)

---

## Screens Prototyped

### Screen 1 — Town Hub (Home)
The town screen is the player's permanent anchor. Design intent: **launch pad, not dashboard**.

- Expedition CTA is always the primary, full-width button — shown above all secondary tiles
- Last expedition loot summary appears below the CTA to reinforce the reward loop before the player even taps "go"
- Quick stats (Food / Items / Maps) give an at-a-glance readiness signal without opening sub-screens
- Player XP bar in the character card provides continuous progression feedback on the home screen
- Secondary actions (Bank, Skills, Smithing, Cooking) are 2-column grid tiles — visually secondary but discoverable

### Screen 2 — Bank / Resource View
The bank grows to hundreds of item types. Design challenge: **inventory scale without scroll fatigue**.

- Category tabs (All / Ores / Herbs / Fish / Gems / Food) + search bar at the top
- Items displayed as a 4-column icon grid with emoji + count + name
- Tapping an item shows an inline detail panel (no modal) with contextual actions (Smelt / Sell)
- Undiscovered item types shown as greyed `?` tiles — visible but not revealed — to surface curiosity
- Item actions (Smelt, Sell) surface the crafting connection without leaving the Bank screen

### Screen 3 — Skills / Progression
Skills communicate progression state and unlock roadmap simultaneously.

- Combat level shown as a summary card at top — combat is a cross-skill aggregate
- Skills grouped into Gathering / Crafting / Exploration sections
- Each skill row: icon + name + unlock milestone text + XP bar + level number
- Locked skills shown at 50% opacity with `🔒 Requires X` instead of hidden — "there is more to discover"
- Unlock prerequisites stated inline (no tooltip hunting)

### Screen 4 — Expedition Prep
Before committing to an expedition, the player sets three variables: **where, what, how long, how engaged**.

- Map selection shown at top (destination drives everything else)
- Alternative map surfaced inline ("Frostpeak Valley T2 also available — Swap") — prevents dead-end when preferred map is unavailable
- Loadout slots: Vehicle / Food (6) / Misc (2) — filled slots show emoji + quantity
- Food slots show "24 actions" total in real-time as slots are filled — the action budget is the session timer
- Active/Passive mode toggle is full-width, shows yield percentages: "85–100%" vs "70%"
- Action Budget card shows `24 actions ≈ 14 min` — makes session length legible before committing
- Start button disabled until a map is selected

### Screen 5 — Active Expedition Grid
The 10×10 grid is the core gameplay interface. Design challenge: **decision density without confusion**.

- Node types use distinct background colours (ore=warm brown, herb=green, fish=blue, combat=red, gem=purple)
- Player character shown on grid as 🧙 with current position always visible
- Planned path highlighted in blue — not yet committed
- Budget bar (green → warning yellow) runs at top of grid area as an ambient progress indicator
- Three-button action bar: Erase (undo last path segment) / Confirm Path / Return Home
- "Return" is styled danger-red and right-most to reduce accidental taps
- Grid legend shown below map for first-time orientation

### Screen 6 — Mining Minigame (Active Mode)
Minigames are the core active engagement mechanic. Design challenge: **skill expression without exclusion**.

- 10-dot hit history row shows past hits (green), misses (red), next beat (pulsing blue ring)
- Yield meter shows current performance (% of max) in real-time — players understand the cost of each miss
- Countdown timer to next beat (0.4s shown as a progress bar) makes timing readable rather than guesswork
- Large "TAP TO STRIKE" button fills the lower half of the screen — fat-finger friendly on mobile
- **Skip (70%)** always visible at bottom-right — passive players have an immediate exit with a stated floor yield
- Expected resource count shown ("3–5 Iron Ore at current yield") — connects the minigame to the reward

---

## Core UX Principles Applied

### 1. Expedition is always the hero
Every screen leads back to expedition. Town is a toolkit for preparation, not a destination.

### 2. Session legibility
Players should be able to answer "how long will this take?" before committing. The action budget (`24 actions ≈ 14 min`) is the mechanism.

### 3. Active vs Passive is a first-class choice
Mode toggle is in Expedition Prep (pre-trip), not buried in settings. Each trip can be a different engagement level.

### 4. Plan → Confirm → Execute
The grid uses a two-phase flow: plan the path (blue preview), then confirm. This reduces frustration from mis-taps on a dense grid and teaches the packing puzzle iteratively.

### 5. No screen is a trap
Every minigame has a Skip option. Every path can be erased. The Return button is always visible. Players who get interrupted IRL have a graceful exit at any point.

### 6. Curiosity loops over gating
Locked content is shown greyed (not hidden). Unknown resources appear as `?` tiles. The world communicates that there is more without spoiling what it is.

---

## Stitch Prototype Notes

The HTML prototype at `docs/ux-prototype/prototype.html` serves as the complete screen reference for a Google Stitch recreation. To recreate in Stitch:

1. Open [Google Stitch](https://stitch.withgoogle.com)
2. Create a new mobile prototype (390×844 canvas, dark theme)
3. Import the 6 screen designs as individual frames using the layouts described above
4. Link screens: Town → Bank (Bank tile tap), Town → Skills (Skills tile tap), Town → Expedition Prep (CTA tap), Expedition Prep → Active Grid (Begin Expedition tap), Active Grid → Mining Minigame (on node arrival)
5. Add the mode toggle interaction on Expedition Prep (tap Passive → updates yield text)
6. Add the path-confirm flow on the grid (tap cells → highlight → Confirm tap → execute)

The prototype HTML file can be opened directly in a browser for stakeholder review without Stitch access.

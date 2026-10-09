# Game UI/UX principles — reference sheet for the reviewer

Source material, not opinions about any particular game. Each entry: the principle, where it comes from, and the test it implies for a screen.

## 1. Celia Hodent — *The Gamer's Brain* (2017), UX pillars (Epic/Fortnite UX)
Usability pillars:
- **Signs and feedback** — every player action gets an immediate, proportionate response; every state the player must know about has a visible sign. Test: tap anything — does something visibly happen within ~100ms? Is every important state shown, not inferred?
- **Clarity** — the signal must be perceivable and unambiguous at a glance (contrast, size, salience, no visual noise competing with it). Test: squint at the screen; does the one thing that matters still pop?
- **Form follows function** — an element's look should tell you what it does (a button looks pressable, a hazard looks dangerous, a locked thing looks locked). Test: would a new player guess what this element does from its shape alone?
- **Consistency** — the same thing looks and behaves the same everywhere; different things look different. Test: list every place a concept appears (cost, lock, selection, close) — is it drawn the same way each time?
- **Minimum workload** — reduce cognitive load (what must be remembered/computed) and physical load (taps, travel). Show the answer, not the inputs to compute it. Test: does the player do arithmetic or remember something from another screen?
- **Error prevention / recovery** — make mistakes hard and undoable; warn before irreversible actions, not after.
- **Flexibility** — accommodate different players (shortcuts, settings, accessibility).
Engage-ability pillars: **motivation** (competence, autonomy, relatedness — SDT), **emotion** (game feel, juice, surprise), **game flow** (difficulty & learning curve; onboarding that teaches by doing).

## 2. Don Norman — *The Design of Everyday Things*
- **Affordance vs signifier** — what an object allows vs the perceivable cue that says so. Hidden gestures (press-and-hold, swipe, pan) have affordances but no signifiers unless you add them.
- **Mapping** — controls laid out like the effect they have (a control near its thing).
- **Feedback** and **conceptual model** — the UI should let the player build a correct mental model of the system (here: energy budget, carry slots, fog). If the model is wrong, every screen fights the player.
- **Gulfs of execution & evaluation** — can I tell what I can do? can I tell what just happened?

## 3. Jakob Nielsen — 10 usability heuristics (1994, still standard)
Visibility of system status · match between system and real world (player language, not dev terms) · user control & freedom (undo, exits) · consistency & standards · error prevention · recognition rather than recall · flexibility & efficiency · aesthetic & minimalist design (every extra element competes) · help users recognise/diagnose/recover from errors · help & documentation (in context).

## 4. Perception & layout
- **Gestalt** — proximity, similarity, common region, continuity: things that belong together are grouped, framed, aligned; things that look alike are assumed to act alike.
- **Visual hierarchy** — one primary action per screen, visually dominant; secondary actions recede. Colour, size, position, contrast in that order.
- **Pre-attentive attributes** — colour, size, motion are read before conscious attention; spend them only on what matters (status, danger, the primary action).
- **Colour semantics** — a colour should mean one thing across the whole game; never colour-only (WCAG 1.4.1, Game Accessibility Guidelines: pair colour with shape/icon/text; ~8% of men are colour-blind).

## 5. Interaction laws
- **Fitts's law** — time to hit a target grows with distance/shrinks with size. Primary actions big and near the thumb; destructive actions small/far.
- **Hick's law** — decision time grows with number of choices. Fewer, grouped options; progressive disclosure for the rest.
- **Progressive disclosure** — show what's needed now; reveal depth on demand (details on tap, advanced in a sub-menu).
- **Mobile touch targets** — ≥44×44pt (Apple HIG) / 48×48dp (Material). Thumb zones: bottom/centre easy, top corners hard on large/foldable screens.

## 6. Game-specific UI frameworks
- **Diegetic / non-diegetic / spatial / meta UI** (Fagerholt & Lorentzon, 2009) — decide which layer each piece of information lives in and stay consistent; a world-integrated town (diegetic) mixed with web-style panels needs a clear rule for when you leave the world.
- **Game feel / juice** (Steve Swink, *Game Feel*; Jonasson & Purho "Juice it or lose it", 2012) — feedback proportionate to the event; the payoff moments (loot, level-up, return home) deserve the most celebration.
- **Onboarding by doing** (Hodent; Nintendo's "World 1-1") — teach mechanics through a safe first use, not text walls; the first screen should make the first verb obvious.
- **Information on demand vs at a glance** (common in strategy/roguelite UI: FTL, Slay the Spire, Into the Breach) — Into the Breach shows the outcome of an action before you commit (preview = trust); Slay the Spire keeps every card/keyword inspectable by hover/hold with identical tooltip styling everywhere.
- **The loop's rhythm** — screens should mirror the core loop (prepare → venture → decide → return → upgrade); each transition should summarise what changed (the "results screen" pattern).

## 7. Accessibility baselines (Game Accessibility Guidelines; Xbox Accessibility Guidelines)
Text ≥ ~12px equivalent at arm's length on mobile (larger for body); contrast ≥ 4.5:1 for text; don't rely on colour alone; avoid information only in hover tooltips on touch devices; allow reduced motion.

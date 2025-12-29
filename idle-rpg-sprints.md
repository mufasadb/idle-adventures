# Idle RPG - Sprint Plan

**Approach**: Vertical slices - each sprint delivers end-to-end playable functionality.

---

## Sprint 0: Project Setup
**Goal**: Dev environment, CI, deployable skeleton

- [ ] Monorepo setup (frontend + backend)
- [ ] Frontend: React + TypeScript + MobX + Vite scaffold
- [ ] Backend: Go + Gin + GORM scaffold
- [ ] PostgreSQL local + Docker Compose
- [ ] Basic auth (register/login with JWT)
- [ ] CI pipeline (lint, test, build)
- [ ] Deploy to staging (backend + static frontend)

**Deliverable**: Can register, login, see empty "home" screen.

---

## Sprint 1: Town & Inventory Foundation
**Goal**: Player exists, has items, can view them

- [ ] Player model + migration
- [ ] Skill model (23 skills, levels, XP)
- [ ] Inventory model (items in storage)
- [ ] Static item definitions (JSON/code)
- [ ] API: GET /player (returns full state)
- [ ] Frontend: Home screen with inventory display
- [ ] Frontend: Skills panel showing all 23 skills
- [ ] Seed new player with starter items

**Deliverable**: Login → see your inventory and skills.

---

## Sprint 2: First Expedition (Core Loop)
**Goal**: Go somewhere, move on grid, come back

- [ ] Map definitions (static data)
- [ ] Seeded grid generation (deterministic)
- [ ] Canvas grid renderer (basic)
- [ ] Expedition flow: prepare → travel → explore → return
- [ ] Movement on grid (tap to move, hours tick down)
- [ ] Fog of war (reveal adjacent nodes)
- [ ] Return home transfers expedition inventory to storage
- [ ] API: expedition endpoints (start, move, return)
- [ ] Sync/verification on expedition complete

**Deliverable**: Complete a full expedition loop, see grid, move around, return home.

---

## Sprint 3: Gathering (Mining First)
**Goal**: Interact with resource nodes

- [ ] Node types: mining, empty, blocked
- [ ] Gather action (auto mode only first)
- [ ] Yield calculation (skill bonus, 70% auto rate)
- [ ] Carry capacity system
- [ ] Weight tracking during expedition
- [ ] "Inventory full" handling (drop/stop/return options)
- [ ] XP gain from gathering
- [ ] Mining skill levels up

**Deliverable**: Mine ore, fill bags, gain XP, level up mining.

---

## Sprint 4: Mining Minigame (Manual Mode)
**Goal**: Manual play yields 85-100%

- [ ] Mining minigame: timing-based swing
- [ ] Score calculation (perfect/good/miss)
- [ ] Efficiency based on performance
- [ ] Manual vs Auto choice at each node
- [ ] UI feedback (satisfying hits, combo?)

**Deliverable**: Choose manual, play minigame, get better yields.

---

## Sprint 5: Additional Gathering Skills
**Goal**: Variety in what you can gather

- [ ] Woodcutting nodes + skill
- [ ] Herbalism nodes + skill
- [ ] Different resource types per node
- [ ] Auto mode for all gathering types
- [ ] (Minigames deferred - auto only for now)

**Deliverable**: Maps with mixed node types, gather wood and herbs.

---

## Sprint 6: Processing & Basic Crafting
**Goal**: Transform raw materials in town

- [ ] Processing system: ore → ingots, logs → planks
- [ ] Smithing skill + basic recipes
- [ ] Crafting UI in town
- [ ] Recipe requirements (materials + skill level)
- [ ] Equipment model (equippable items)
- [ ] Equip/unequip flow
- [ ] Tool bonuses (better pickaxe = faster mining)

**Deliverable**: Smelt ore, craft pickaxe, equip it, benefit on next expedition.

---

## Sprint 7: Cooking & Rations
**Goal**: Rations fuel expeditions

- [ ] Cooking skill
- [ ] Ration crafting recipes
- [ ] Ration consumption during travel
- [ ] Ration consumption per day at destination
- [ ] Expedition prep: choose how many rations to bring
- [ ] Trade-off: rations take carry space

**Deliverable**: Cook rations, pack for longer trips, stay more days.

---

## Sprint 8: Carry Capacity & Backpacks
**Goal**: Upgrade your hauling ability

- [ ] Tailoring skill
- [ ] Backpack crafting recipes
- [ ] Backpack tiers (50/75/100 capacity)
- [ ] Equipment slot: backpack
- [ ] Carry capacity calculation (base + backpack + mount)
- [ ] UI showing capacity during expedition

**Deliverable**: Craft better backpack, carry more loot.

---

## Sprint 9: Combat Foundation
**Goal**: Monster nodes, basic fighting

- [ ] Monster node type
- [ ] Monster definitions (HP, attack, drops)
- [ ] Combat system (auto mode first)
- [ ] Melee skill + XP
- [ ] Healing item consumption during combat
- [ ] Loot drops on victory
- [ ] Avoid option (go around, costs time)

**Deliverable**: Fight wolves, use healing food, get pelts.

---

## Sprint 10: Combat Minigame
**Goal**: Manual combat with tactics

- [ ] Combat minigame design (TBD - not rhythm)
- [ ] Manual vs auto choice
- [ ] Better outcomes for manual (less damage, more drops?)
- [ ] Companion combat bonus (placeholder)

**Deliverable**: Engaging manual combat that rewards skill.

---

## Sprint 11: Mounts
**Goal**: Travel faster, carry more

- [ ] Beastcraft skill
- [ ] Mount definitions (horse, mule, camel)
- [ ] Mount acquisition (taming during expedition?)
- [ ] Active mount selection
- [ ] Travel time reduction
- [ ] Mount carry bonus
- [ ] Saddlebags (Tailoring + mount required)

**Deliverable**: Tame horse, travel faster, carry more with mule.

---

## Sprint 12: Cartography & Maps
**Goal**: Better planning through information

- [ ] Cartography skill
- [ ] Map shop (buy maps for gold)
- [ ] Library research (craft maps with Cartography)
- [ ] Map quality based on Cartography level
- [ ] Info revealed scales with skill
- [ ] Map collection UI

**Deliverable**: Research maps, see more detail at higher Cartography.

---

## Sprint 13: Offline Support
**Goal**: Play without connection

- [ ] Service Worker setup
- [ ] localStorage state caching
- [ ] Offline expedition play
- [ ] Action queue while offline
- [ ] Sync on reconnect
- [ ] Conflict handling (server wins)
- [ ] Offline indicator in UI

**Deliverable**: Airplane mode → do expedition → reconnect → synced.

---

## Sprint 14: PWA & Mobile Polish
**Goal**: Installable, feels native

- [ ] PWA manifest
- [ ] App icons
- [ ] Splash screen
- [ ] Install prompt
- [ ] Touch interactions polished
- [ ] Responsive layouts
- [ ] Performance optimization

**Deliverable**: Install on phone home screen, smooth experience.

---

## Future Sprints (Backlog)

### More Skills
- [ ] Fishing nodes + skill
- [ ] Hunting nodes + skill
- [ ] Bug catching
- [ ] Alchemy, Jewelcrafting, Carpentry, Engineering, Arcana, Brewing
- [ ] Farming (town-based)
- [ ] Sailing (water maps)
- [ ] Archaeology (artifacts, special recipes)

### More Minigames
- [ ] Woodcutting minigame
- [ ] Herbalism minigame
- [ ] Fishing minigame
- [ ] Processing minigames (smelting, etc.)

### Combat Depth
- [ ] Magic skill + runes
- [ ] Ranged skill + arrows
- [ ] Companions (combat pets)
- [ ] More monster variety

### Content
- [ ] Multiple map tiers
- [ ] Rare resources
- [ ] Full recipe library
- [ ] Equipment tiers
- [ ] Achievement system?

### Social (Maybe)
- [ ] Trading between players
- [ ] Leaderboards
- [ ] Guilds?

---

## Notes

- Each sprint should be 1-2 weeks
- Sprints are sequenced for dependencies (can't craft without inventory, can't expedition without grid, etc.)
- Minigames can be deferred - auto mode works as placeholder
- Combat minigame design is still TBD
- Push notifications deferred until core loop solid

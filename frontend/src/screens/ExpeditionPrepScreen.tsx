import { useState, useMemo, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { sessionStore } from '../stores/sessionStore';
import { stashStore, type StashItem } from '../stores/stashStore';
import { playerStore } from '../stores/playerStore';
import { Header } from '../components/layout';
import { calculateAPBreakdown } from '../engine/apBudget';
import { THORNWOOD_MAP } from '../data/devMap';
import { ITEMS } from '../data/items';
import type { ItemStack } from '../types';

// ── Biome meta ────────────────────────────────────────────────────────────────

const BIOME_ICONS: Record<string, string> = {
  forest: '🌲',
  desert: '🏜️',
  plains: '🌾',
  mountain: '⛰️',
};

function biomeIcon(biome: string): string {
  return BIOME_ICONS[biome] ?? '🗺️';
}

// ── Slot components ───────────────────────────────────────────────────────────

function LoadoutSlot({
  item,
  onClear,
  label,
}: {
  item: { itemId: string } | null;
  onClear: () => void;
  label?: string;
}) {
  const def = item ? (ITEMS[item.itemId] ?? null) : null;
  return (
    <div className="relative w-10 h-10 rounded-lg border border-app bg-app-tertiary flex items-center justify-center flex-shrink-0">
      {def ? (
        <>
          <span className="text-xl">{def.icon}</span>
          <button
            onClick={onClear}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 text-white text-[9px] flex items-center justify-center leading-none font-bold"
            aria-label={`Remove ${def.name}`}
          >
            ×
          </button>
        </>
      ) : (
        <span className="text-app-muted text-lg">{label ?? '+'}</span>
      )}
    </div>
  );
}

// ── AP strip ─────────────────────────────────────────────────────────────────

interface APStripProps {
  foodAP: number;
  animalBonus: number;
  mapPenalty: number;
  total: number;
}

function APStrip({ foodAP, animalBonus, mapPenalty, total }: APStripProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-app-tertiary border-b border-app text-xs flex-wrap">
      <span className="text-app-muted">AP:</span>
      <span className="text-app-primary">Food <span className="text-gold font-bold">{foodAP}</span></span>
      {animalBonus > 0 && (
        <span className="text-app-primary">Animal <span className="text-green-400 font-bold">+{animalBonus}</span></span>
      )}
      {mapPenalty > 0 && (
        <span className="text-app-primary">Desert <span className="text-red-400 font-bold">−{mapPenalty}</span></span>
      )}
      <span className="ml-auto text-app-primary font-bold">
        Total <span className={total >= 0 ? 'text-gold' : 'text-red-400'}>{total}</span>
      </span>
    </div>
  );
}

// ── Stash item row ────────────────────────────────────────────────────────────

interface StashItemRowProps {
  item: StashItem;
  isEquipped: boolean;
  isRejecting: boolean;
  onTap: (item: StashItem) => void;
}

function StashItemRow({ item, isEquipped, isRejecting, onTap }: StashItemRowProps) {
  return (
    <div
      onClick={() => !isEquipped && onTap(item)}
      className={`
        flex items-center gap-3 px-4 py-3 border-b border-app transition-all select-none
        ${isEquipped
          ? 'opacity-40 pointer-events-none'
          : 'hover:bg-app-tertiary cursor-pointer active:bg-app-tertiary'}
        ${isRejecting ? 'border-red-500 bg-red-500/10 animate-shake' : ''}
      `}
    >
      <div className="w-9 h-9 rounded-lg bg-app-tertiary flex items-center justify-center text-xl flex-shrink-0">
        {item.definition.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-app-primary text-sm font-medium truncate">{item.definition.name}</div>
        <div className="text-app-muted text-xs capitalize">{item.definition.category}</div>
      </div>
      {isEquipped && (
        <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-medium flex-shrink-0">
          Equipped
        </span>
      )}
      {item.quantity > 1 && !isEquipped && (
        <span className="text-accent font-bold text-sm flex-shrink-0">×{item.quantity}</span>
      )}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

type TabId = 'all' | 'food' | 'misc' | 'animal';

const TAB_CATS: Record<TabId, string[]> = {
  all: [],
  food: ['food'],
  misc: ['misc'],
  animal: ['animal'],
};

export const ExpeditionPrepScreen = observer(() => {
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [pendingAnimalSwap, setPendingAnimalSwap] = useState<StashItem | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const rejectTimerRef = useRef<number | null>(null);

  // AP breakdown — recomputes whenever loadout or map changes (MobX observer)
  const beastcraftLevel = playerStore.getSkill('beastcraft')?.level ?? 1;
  const apBreakdown = calculateAPBreakdown(
    sessionStore.loadout,
    sessionStore.selectedMap ?? THORNWOOD_MAP,
    beastcraftLevel,
  );

  // Stash items filtered by active tab
  const filteredItems = useMemo(() => {
    const cats = TAB_CATS[activeTab];
    if (cats.length === 0) return stashStore.items;
    return stashStore.items.filter((i) => cats.includes(i.definition.category));
  }, [activeTab, stashStore.items]); // eslint-disable-line react-hooks/exhaustive-deps

  // Set of equipped item def IDs
  const equippedDefIds = useMemo(() => {
    const ids = new Set<string>();
    if (sessionStore.loadout.vehicle) ids.add(sessionStore.loadout.vehicle.itemId);
    sessionStore.loadout.food.forEach((f) => f && ids.add(f.itemId));
    sessionStore.loadout.misc.forEach((m) => m && ids.add(m.itemId));
    return ids;
  }, [sessionStore.loadout]); // eslint-disable-line react-hooks/exhaustive-deps

  function triggerReject(itemId: string) {
    if (rejectTimerRef.current !== null) {
      cancelAnimationFrame(rejectTimerRef.current);
    }
    setRejectingId(itemId);
    const start = performance.now();
    const tick = () => {
      if (performance.now() - start >= 600) {
        setRejectingId(null);
        rejectTimerRef.current = null;
      } else {
        rejectTimerRef.current = requestAnimationFrame(tick);
      }
    };
    rejectTimerRef.current = requestAnimationFrame(tick);
  }

  function trySlotAnimal(item: StashItem) {
    if (sessionStore.loadout.vehicle !== null) {
      setPendingAnimalSwap(item);
    } else {
      sessionStore.setVehicle({ itemId: item.itemDefId, count: 1 });
    }
  }

  function trySlotFood(item: StashItem) {
    const idx = sessionStore.loadout.food.findIndex((f) => f === null);
    if (idx !== -1) {
      sessionStore.setFood(idx, { itemId: item.itemDefId });
    } else {
      triggerReject(item.id);
    }
  }

  function trySlotMisc(item: StashItem) {
    const idx = sessionStore.loadout.misc.findIndex((m) => m === null);
    if (idx !== -1) {
      sessionStore.setMisc(idx, { itemId: item.itemDefId, count: 1 } as ItemStack);
    } else {
      triggerReject(item.id);
    }
  }

  function handleTapItem(item: StashItem) {
    const cat = item.definition.category;

    if (activeTab === 'food') {
      if (cat === 'food') trySlotFood(item);
      else triggerReject(item.id);
      return;
    }
    if (activeTab === 'misc') {
      if (cat !== 'food' && cat !== 'animal' && cat !== 'tool' && cat !== 'map') trySlotMisc(item);
      else triggerReject(item.id);
      return;
    }
    if (activeTab === 'animal') {
      if (cat === 'animal') trySlotAnimal(item);
      else triggerReject(item.id);
      return;
    }
    // 'all' tab — route by category
    if (cat === 'animal') trySlotAnimal(item);
    else if (cat === 'food') trySlotFood(item);
    else if (cat === 'misc') trySlotMisc(item);
    else triggerReject(item.id); // tool, map — not allowed
  }

  const currentAnimal = sessionStore.loadout.vehicle
    ? ITEMS[sessionStore.loadout.vehicle.itemId]
    : null;
  const currentAnimalName = currentAnimal?.name ?? 'animal';

  return (
    <div className="flex flex-col h-full bg-app-primary relative">
      <Header
        title="Prepare Expedition"
        showBack
        onBack={() => {
          sessionStore.navigateTo('town');
        }}
      />

      {/* ── Fixed top half: loadout config ────────────────────────────── */}
      <div className="flex-shrink-0 bg-app-secondary border-b border-app">

        {/* Map strip */}
        <button
          onClick={() => setShowMapPicker(true)}
          className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-app hover:bg-app-tertiary transition-colors text-left"
        >
          <span className="text-lg">{biomeIcon(sessionStore.selectedMap?.biome ?? 'forest')}</span>
          <div className="flex-1 min-w-0">
            <span className="text-app-primary text-sm font-medium">
              {sessionStore.selectedMap?.name ?? 'Select Map'}
            </span>
            {sessionStore.selectedMap && (
              <span className="text-app-muted text-xs ml-2 capitalize">
                {sessionStore.selectedMap.biome} · T{sessionStore.selectedMap.tier}
              </span>
            )}
          </div>
          <span className="text-app-muted text-xs">Change ›</span>
        </button>

        {/* Animal row */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-app">
          <span className="text-app-muted text-xs w-14 flex-shrink-0">Animal</span>
          <LoadoutSlot
            item={sessionStore.loadout.vehicle}
            onClear={() => sessionStore.setVehicle(null)}
          />
          {apBreakdown.animalBonus > 0 && (
            <span className="text-green-400 text-xs font-bold">+{apBreakdown.animalBonus} AP</span>
          )}
          {!sessionStore.loadout.vehicle && (
            <span className="text-app-muted text-xs italic">None — required</span>
          )}
        </div>

        {/* Food row */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-app overflow-x-auto">
          <span className="text-app-muted text-xs w-14 flex-shrink-0">Food</span>
          {sessionStore.loadout.food.map((f, i) => (
            <LoadoutSlot
              key={i}
              item={f}
              onClear={() => sessionStore.setFood(i, null)}
            />
          ))}
        </div>

        {/* Misc row */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-app">
          <span className="text-app-muted text-xs w-14 flex-shrink-0">Misc</span>
          {sessionStore.loadout.misc.map((m, i) => (
            <LoadoutSlot
              key={i}
              item={m}
              onClear={() => sessionStore.setMisc(i, null)}
            />
          ))}
        </div>

        {/* AP summary */}
        <APStrip
          foodAP={apBreakdown.foodAP}
          animalBonus={apBreakdown.animalBonus}
          mapPenalty={apBreakdown.mapPenalty}
          total={apBreakdown.total}
        />

        {/* Mode toggle */}
        <div className="flex items-center gap-3 px-4 py-2.5">
          <span className="text-app-muted text-xs w-14 flex-shrink-0">Mode</span>
          {(['active', 'passive'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => sessionStore.setMode(mode)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                sessionStore.loadout.mode === mode
                  ? 'bg-accent text-white'
                  : 'bg-app-tertiary text-app-muted hover:text-app-primary'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Divider ────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 py-2 bg-app-primary border-b border-app">
        <p className="text-app-muted text-xs text-center">Tap to equip from stash</p>
      </div>

      {/* ── Category tabs ──────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex gap-1 px-3 py-2 border-b border-app bg-app-secondary overflow-x-auto">
        {(['all', 'food', 'misc', 'animal'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 transition-colors ${
              activeTab === tab
                ? 'bg-accent text-white'
                : 'bg-app-tertiary text-app-muted hover:text-app-primary'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Stash list (scrollable) ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {filteredItems.length === 0 ? (
          <div className="py-12 text-center text-app-muted text-sm">
            No items in this category
          </div>
        ) : (
          filteredItems.map((item) => (
            <StashItemRow
              key={item.id}
              item={item}
              isEquipped={equippedDefIds.has(item.itemDefId)}
              isRejecting={rejectingId === item.id}
              onTap={handleTapItem}
            />
          ))
        )}
      </div>

      {/* ── Depart bar (pinned bottom) ─────────────────────────────────── */}
      <div className="flex-shrink-0 bg-app-secondary border-t border-app p-3 pb-safe flex gap-2">
        <button
          disabled={!sessionStore.canStartExpedition}
          onClick={() => sessionStore.startExpedition()}
          className="flex-1 h-12 rounded-xl bg-accent disabled:opacity-40 text-white font-bold text-sm transition-opacity"
        >
          Depart →
        </button>
        <button
          onClick={() => {
            sessionStore.resetLoadout();
            sessionStore.navigateTo('town');
          }}
          className="w-12 h-12 rounded-xl bg-red-900/50 border border-red-500/30 text-red-300 text-lg"
        >
          ✕
        </button>
      </div>

      {/* ── Animal swap overlay ────────────────────────────────────────── */}
      {pendingAnimalSwap && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-end p-4">
          <div className="w-full bg-app-secondary rounded-xl p-4 space-y-3">
            <div className="text-sm font-medium text-app-primary">
              Swap{' '}
              <span className="text-gold">{currentAnimalName}</span>{' '}
              for{' '}
              <span className="text-gold">{pendingAnimalSwap.definition.name}</span>?
            </div>
            <div className="flex gap-2">
              <button
                className="flex-1 h-10 rounded-lg bg-accent text-white text-sm font-bold"
                onClick={() => {
                  sessionStore.setVehicle({ itemId: pendingAnimalSwap.itemDefId, count: 1 });
                  setPendingAnimalSwap(null);
                }}
              >
                Swap
              </button>
              <button
                className="flex-1 h-10 rounded-lg bg-app-tertiary text-sm font-medium text-app-primary"
                onClick={() => setPendingAnimalSwap(null)}
              >
                Keep {currentAnimalName}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Map picker overlay ─────────────────────────────────────────── */}
      {showMapPicker && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-end p-4">
          <div className="w-full bg-app-secondary rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-app flex items-center justify-between">
              <span className="text-app-primary font-bold text-sm">Choose Map</span>
              <button
                onClick={() => setShowMapPicker(false)}
                className="text-app-muted text-lg"
              >
                ✕
              </button>
            </div>
            {sessionStore.availableMaps.map((map) => {
              const selected = map.id === sessionStore.selectedMapId;
              return (
                <button
                  key={map.id}
                  onClick={() => {
                    sessionStore.selectMap(map.id);
                    setShowMapPicker(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 border-b border-app text-left hover:bg-app-tertiary transition-colors ${
                    selected ? 'bg-app-tertiary' : ''
                  }`}
                >
                  <span className="text-xl">{biomeIcon(map.biome)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-app-primary text-sm font-medium">{map.name}</div>
                    <div className="text-app-muted text-xs capitalize">
                      {map.biome} · Tier {map.tier}
                    </div>
                  </div>
                  {selected && <span className="text-accent text-sm">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

import { observer } from 'mobx-react-lite';
import { Header, BottomNav } from '../components/layout';
import { sessionStore } from '../stores/sessionStore';
import { playerStore } from '../stores/playerStore';
import { authStore } from '../stores/authStore';

export const TownScreen = observer(() => {
  const foodCount = playerStore.getItemsByCategory('food').reduce((sum, s) => sum + s.count, 0);
  const bankItemCount = playerStore.bank.filter(s => s.itemId !== 'gold').length;
  const mapsCount = sessionStore.availableMaps.length;

  // Placeholder XP — no game logic yet
  const xpPercent = 42;

  return (
    <div className="flex flex-col h-full bg-app-primary">
      <Header title="Thornvale" />

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Player Card with XP bar */}
        <div className="bg-app-secondary rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-accent-subtle rounded-full flex items-center justify-center text-2xl flex-shrink-0">
              🧙
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-app-primary font-bold truncate">
                  {authStore.player?.username || 'Adventurer'}
                </span>
                <span className="text-gold font-extrabold text-lg whitespace-nowrap">
                  {playerStore.gold.toLocaleString()}
                  <span className="text-app-muted text-xs font-normal ml-1">gold</span>
                </span>
              </div>
              <div className="text-app-secondary text-xs mb-2">Level 12 · Ranger</div>
              {/* XP bar */}
              <div className="h-1.5 bg-app-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full"
                  style={{ width: `${xpPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats: Food / Items / Maps */}
        <div className="grid grid-cols-3 gap-2">
          <StatChip icon="🍞" value={foodCount} label="Food" />
          <StatChip icon="🎒" value={bankItemCount} label="Items" />
          <StatChip icon="🗺" value={mapsCount} label="Maps" />
        </div>

        {/* Primary CTA: Start Expedition */}
        <button
          onClick={() => sessionStore.navigateTo('expedition-prep')}
          className="w-full bg-accent rounded-xl p-4 flex items-center gap-3 text-left"
        >
          <span className="text-[26px]">🗺</span>
          <div className="flex-1">
            <div className="text-white font-bold text-[15px]">Start Expedition</div>
            <div className="text-accent-light text-xs mt-0.5">Choose a map and prepare</div>
          </div>
          <span className="text-white/60 text-sm">❯</span>
        </button>

        {/* Secondary Action Tiles */}
        <div className="bg-app-secondary rounded-xl p-3">
          <div className="text-accent text-xs font-bold uppercase tracking-widest mb-3">
            Town Actions
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <TownTile
              icon="🏦"
              label="Bank"
              sub={`${bankItemCount} item types`}
              onClick={() => sessionStore.openSheet('bank')}
            />
            <TownTile
              icon="📊"
              label="Skills"
              sub={`${playerStore.skills.length} active`}
              onClick={() => sessionStore.openSheet('skills')}
            />
            <TownTile
              icon="⚒"
              label="Smithing"
              sub="Lvl 1 · recipes"
              onClick={() => sessionStore.navigateTo('smithing')}
            />
            <TownTile
              icon="🍳"
              label="Cooking"
              sub="Lvl 1 · recipes"
              onClick={() => sessionStore.navigateTo('cooking')}
            />
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
});

function StatChip({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <div className="bg-app-tertiary rounded-xl py-2.5 px-1.5 text-center">
      <div className="text-accent font-bold text-sm">
        {icon} {value}
      </div>
      <div className="text-app-muted text-[10px] mt-0.5">{label}</div>
    </div>
  );
}

function TownTile({
  icon,
  label,
  sub,
  onClick,
}: {
  icon: string;
  label: string;
  sub: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-app-tertiary rounded-xl p-3.5 text-left hover:bg-app-hover transition-colors"
    >
      <div className="text-lg mb-1">{icon}</div>
      <div className="text-app-primary text-sm font-medium">{label}</div>
      <div className="text-app-muted text-[11px] mt-0.5">{sub}</div>
    </button>
  );
}

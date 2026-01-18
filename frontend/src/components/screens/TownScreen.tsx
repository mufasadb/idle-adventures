import { observer } from 'mobx-react-lite';
import { Header, BottomNav } from '../layout';
import { sessionStore } from '../../stores/sessionStore';
import { playerStore } from '../../stores/playerStore';
import { authStore } from '../../stores/authStore';

export const TownScreen = observer(() => {
  const foodCount = playerStore.getItemsByCategory('food').reduce((sum, s) => sum + s.count, 0);
  const bankItemCount = playerStore.bank.length;

  return (
    <div className="flex flex-col h-full bg-app-primary">
      <Header title="Thornvale" />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Player Card */}
        <div className="bg-app-secondary rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-accent-subtle rounded-full flex items-center justify-center text-2xl">
              🧙
            </div>
            <div>
              <h2 className="text-app-primary font-bold">
                {authStore.player?.username || 'Adventurer'}
              </h2>
              <p className="text-app-secondary text-sm">Level 12</p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-app-secondary rounded-lg p-3 text-center">
            <div className="text-accent text-lg font-bold">{playerStore.gold.toLocaleString()}</div>
            <div className="text-app-muted text-xs">Gold</div>
          </div>
          <div className="bg-app-secondary rounded-lg p-3 text-center">
            <div className="text-accent text-lg font-bold">{foodCount}</div>
            <div className="text-app-muted text-xs">Food</div>
          </div>
          <div className="bg-app-secondary rounded-lg p-3 text-center">
            <div className="text-accent text-lg font-bold">{bankItemCount}</div>
            <div className="text-app-muted text-xs">Items</div>
          </div>
        </div>

        {/* Main Actions */}
        <div className="space-y-3">
          <h3 className="text-app-muted text-sm font-medium uppercase tracking-wide">
            Actions
          </h3>

          <button
            onClick={() => sessionStore.navigateTo('expedition-prep')}
            className="w-full bg-accent hover:bg-accent-500 rounded-lg p-4 text-left flex items-center gap-3"
          >
            <span className="text-2xl">🗺</span>
            <div>
              <div className="text-white font-bold">Start Expedition</div>
              <div className="text-sky-200 text-sm">Choose a map and prepare</div>
            </div>
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => sessionStore.openSheet('bank')}
              className="bg-app-secondary hover:bg-app-hover rounded-lg p-4 text-left"
            >
              <span className="text-xl">🏦</span>
              <div className="text-app-primary font-medium mt-1">Bank</div>
              <div className="text-app-muted text-xs">
                {bankItemCount} item types
              </div>
            </button>

            <button
              onClick={() => sessionStore.openSheet('skills')}
              className="bg-app-secondary hover:bg-app-hover rounded-lg p-4 text-left"
            >
              <span className="text-xl">✨</span>
              <div className="text-app-primary font-medium mt-1">Skills</div>
              <div className="text-app-muted text-xs">{playerStore.skills.length} skills</div>
            </button>
          </div>
        </div>

        {/* Town Buildings */}
        <div className="space-y-3">
          <h3 className="text-app-muted text-sm font-medium uppercase tracking-wide">
            Town
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <TownButton icon="🔥" label="Smithing" />
            <TownButton
              icon="🍳"
              label="Cooking"
              onClick={() => sessionStore.navigateTo('cooking')}
            />
            <TownButton icon="📚" label="Library" />
            <TownButton icon="🏪" label="Map Shop" />
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
});

function TownButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-app-secondary hover:bg-app-hover rounded-lg p-3 text-left"
    >
      <span className="text-lg">{icon}</span>
      <div className="text-app-primary text-sm font-medium">{label}</div>
    </button>
  );
}

import { observer } from 'mobx-react-lite';
import { Header } from '../layout';
import { sessionStore } from '../../stores/sessionStore';
import { playerStore } from '../../stores/playerStore';

export const NodeInteractionScreen = observer(() => {
  const miningSkill = playerStore.skills.find((s) => s.id === 'mining');

  return (
    <div className="flex flex-col h-full bg-app-primary">
      <Header
        title="Iron Ore Deposit"
        showBack
        onBack={() => sessionStore.navigateTo('active-expedition')}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Node Visual */}
        <div className="bg-app-secondary rounded-lg p-6 text-center">
          <div className="text-6xl mb-4">⛏</div>
          <h2 className="text-app-primary text-xl font-bold">Iron Ore Deposit</h2>
          <p className="text-app-muted">Tier 2 Mining Node</p>
        </div>

        {/* Node Info */}
        <div className="bg-app-secondary rounded-lg p-4 space-y-3">
          <div className="flex justify-between">
            <span className="text-app-muted">Ore available</span>
            <span className="text-app-primary">~18-22</span>
          </div>
          <div className="flex justify-between">
            <span className="text-app-muted">Action cost</span>
            <span className="text-app-primary">1 action</span>
          </div>
          <div className="flex justify-between">
            <span className="text-app-muted">Your Mining level</span>
            <span className="text-accent">
              {miningSkill?.level || 1} (+{miningSkill?.level || 1}% yield)
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={() => sessionStore.navigateTo('minigame')}
            className="w-full bg-accent hover:bg-accent-500 rounded-lg p-4 text-left"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">⛏</span>
              <div>
                <div className="text-white font-bold">Mine Manually</div>
                <div className="text-sky-200 text-sm">Play minigame | 85-100% yield</div>
              </div>
            </div>
          </button>

          <button className="w-full bg-app-secondary hover:bg-app-hover rounded-lg p-4 text-left">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔄</span>
              <div>
                <div className="text-app-primary font-bold">Auto-Mine</div>
                <div className="text-app-muted text-sm">Hands-off | 75% yield</div>
              </div>
            </div>
          </button>

          <button
            onClick={() => sessionStore.navigateTo('active-expedition')}
            className="w-full bg-app-tertiary hover:bg-app-hover rounded-lg p-4 text-left border border-app"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">⏭</span>
              <div>
                <div className="text-app-secondary font-bold">Skip Node</div>
                <div className="text-app-muted text-sm">Save actions for other nodes</div>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
});

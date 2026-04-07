import { observer } from 'mobx-react-lite';
import { sessionStore } from '../../stores/sessionStore';

const TABS = [
  { screen: 'town' as const, icon: '🏘️', label: 'Town' },
  { screen: 'stash' as const, icon: '🎒', label: 'Stash' },
] as const;

export const BottomNav = observer(() => {
  return (
    <div className="flex-shrink-0 flex border-t border-app bg-app-secondary pb-safe">
      {TABS.map((tab) => {
        const active = sessionStore.currentScreen === tab.screen;
        return (
          <button
            key={tab.screen}
            onClick={() => sessionStore.navigateTo(tab.screen)}
            className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${
              active ? 'text-accent' : 'text-app-muted hover:text-app-primary'
            }`}
          >
            <span className="text-lg">{tab.icon}</span>
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
});

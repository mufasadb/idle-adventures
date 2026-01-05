import { observer } from 'mobx-react-lite';
import { sessionStore } from '../../stores/sessionStore';

interface NavItem {
  id: string;
  icon: string;
  label: string;
  action: () => void;
}

export const BottomNav = observer(() => {
  const items: NavItem[] = [
    {
      id: 'town',
      icon: '🏠',
      label: 'Town',
      action: () => sessionStore.navigateTo('town'),
    },
    {
      id: 'bank',
      icon: '🏦',
      label: 'Bank',
      action: () => sessionStore.openSheet('bank'),
    },
    {
      id: 'skills',
      icon: '✨',
      label: 'Skills',
      action: () => sessionStore.openSheet('skills'),
    },
    {
      id: 'settings',
      icon: '⚙',
      label: 'Settings',
      action: () => sessionStore.openSheet('settings'),
    },
  ];

  const isActive = (id: string) => {
    if (id === 'town') return sessionStore.currentScreen === 'town';
    return sessionStore.activeSheet === id;
  };

  return (
    <div className="bg-app-secondary border-t border-app px-4 py-3 flex-shrink-0">
      <div className="flex justify-around">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={item.action}
            className={`flex flex-col items-center ${
              isActive(item.id) ? 'text-accent' : 'text-app-secondary hover:text-app-primary'
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="text-xs mt-1">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
});

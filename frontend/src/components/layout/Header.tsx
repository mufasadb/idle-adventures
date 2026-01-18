import { observer } from 'mobx-react-lite';
import { themeStore } from '../../stores/themeStore';
import { sessionStore } from '../../stores/sessionStore';
import { playerStore } from '../../stores/playerStore';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  rightContent?: React.ReactNode;
}

export const Header = observer(({ title, showBack, onBack, rightContent }: HeaderProps) => {
  return (
    <div className="bg-app-secondary px-4 py-2 flex justify-between items-center border-b border-app flex-shrink-0">
      <div className="flex items-center gap-3">
        {showBack && (
          <button
            onClick={onBack}
            className="text-app-secondary hover:text-app-primary text-lg"
          >
            ←
          </button>
        )}
        <span className="text-accent font-bold">{title}</span>
      </div>
      <div className="flex items-center gap-3">
        {rightContent}
        <button
          onClick={() => themeStore.toggle()}
          className="text-app-secondary hover:text-app-primary text-lg"
          aria-label="Toggle theme"
        >
          {themeStore.isDark ? '🌙' : '☀️'}
        </button>
        {sessionStore.currentScreen === 'town' && (
          <span className="text-accent">{playerStore.gold.toLocaleString()} gold</span>
        )}
      </div>
    </div>
  );
});

interface HeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
}

export function Header({ title, showBack, onBack }: HeaderProps) {
  return (
    <div className="flex-shrink-0 flex items-center gap-3 px-4 pt-safe-top py-3 bg-app-secondary border-b border-app">
      {showBack && (
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-app-muted hover:text-app-primary hover:bg-app-tertiary transition-colors"
          aria-label="Go back"
        >
          ‹
        </button>
      )}
      <h1 className="text-app-primary font-bold text-base flex-1">{title}</h1>
    </div>
  );
}

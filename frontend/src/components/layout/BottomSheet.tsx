import { observer } from 'mobx-react-lite';
import type { ReactNode } from 'react';
import { sessionStore } from '../../stores/sessionStore';

interface BottomSheetProps {
  id: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export const BottomSheet = observer(({ id, title, subtitle, children, footer }: BottomSheetProps) => {
  const isOpen = sessionStore.activeSheet === id;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={() => sessionStore.closeSheet()}
      />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 bg-app-secondary rounded-t-2xl z-50 max-h-[85%] flex flex-col animate-slide-up"
      >
        {/* Handle & Header */}
        <div className="p-4 border-b border-app flex-shrink-0">
          <div className="w-12 h-1 bg-app-tertiary rounded-full mx-auto mb-3" />
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-app-primary font-bold text-lg">{title}</h2>
              {subtitle && <p className="text-app-muted text-sm">{subtitle}</p>}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="p-4 border-t border-app flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </>
  );
});

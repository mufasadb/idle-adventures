import { observer } from 'mobx-react-lite';
import { useState, useEffect, useCallback } from 'react';
import { sessionStore } from '../../stores/sessionStore';

export const MinigameScreen = observer(() => {
  const [targetPosition, setTargetPosition] = useState(40);
  const [targetDirection, setTargetDirection] = useState(1);
  const [swingCount, setSwingCount] = useState(0);
  const [totalSwings] = useState(12);
  const [collectedOre, setCollectedOre] = useState(0);
  const [efficiency, setEfficiency] = useState(0);
  const [isSwinging, setIsSwinging] = useState(false);

  // Animate target zone
  useEffect(() => {
    const interval = setInterval(() => {
      setTargetPosition((pos) => {
        const newPos = pos + targetDirection * 0.8;
        if (newPos >= 70 || newPos <= 10) {
          setTargetDirection((d) => d * -1);
        }
        return Math.max(10, Math.min(70, newPos));
      });
    }, 16);

    return () => clearInterval(interval);
  }, [targetDirection]);

  const handleSwing = useCallback(() => {
    if (isSwinging) return;

    setIsSwinging(true);
    setTimeout(() => setIsSwinging(false), 150);

    const isHit = targetPosition >= 35 && targetPosition <= 55;
    const oreGained = isHit ? 2 : 1;

    setSwingCount((c) => c + 1);
    setCollectedOre((o) => o + oreGained);

    // Calculate running efficiency
    const newTotal = collectedOre + oreGained;
    const maxPossible = (swingCount + 1) * 2;
    setEfficiency(Math.round((newTotal / maxPossible) * 100));

    if (swingCount + 1 >= totalSwings) {
      setTimeout(() => {
        // Add ore to expedition bag
        sessionStore.addToBag('iron-ore', collectedOre + oreGained);
        sessionStore.useAction(1);
        sessionStore.navigateTo('active-expedition');
      }, 200);
    }
  }, [isSwinging, targetPosition, swingCount, collectedOre, totalSwings]);

  return (
    <div className="flex flex-col h-full bg-app-primary">
      {/* Header */}
      <div className="bg-app-secondary px-4 py-3 border-b border-app text-center flex-shrink-0">
        <span className="text-accent font-bold">Mining</span>
        <div className="text-app-muted text-sm">
          Swing {swingCount + 1} of {totalSwings}
        </div>
      </div>

      {/* Minigame Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-8">
        {/* Power Meter (decorative) */}
        <div className="w-full max-w-xs">
          <div className="text-center text-app-muted mb-2">Power</div>
          <div className="h-8 bg-app-tertiary rounded-full overflow-hidden relative">
            <div className="absolute inset-y-0 left-1/3 w-1/6 bg-green-600/30" />
            <div
              className="h-full bg-accent transition-all duration-100"
              style={{ width: `${50 + Math.sin(Date.now() / 200) * 30}%` }}
            />
          </div>
        </div>

        {/* Pickaxe */}
        <div
          className={`text-8xl transition-transform ${isSwinging ? 'animate-swing' : ''}`}
        >
          ⛏
        </div>

        {/* Target Zone */}
        <div className="w-full max-w-xs">
          <div className="h-4 bg-app-tertiary rounded-full overflow-hidden relative">
            {/* Moving target */}
            <div
              className="absolute inset-y-0 w-1/5 bg-green-500 rounded transition-all duration-75"
              style={{ left: `${targetPosition}%` }}
            />
            {/* Center marker */}
            <div className="absolute inset-y-0 left-1/2 w-1 bg-accent -translate-x-1/2" />
          </div>
          <p className="text-center text-app-muted text-sm mt-2">
            Tap when green zone is centered!
          </p>
        </div>

        {/* Swing Button */}
        <button
          onClick={handleSwing}
          disabled={isSwinging}
          className="w-32 h-32 bg-accent hover:bg-accent-500 rounded-full text-white font-bold text-xl shadow-lg transform active:scale-95 transition-transform disabled:opacity-75"
        >
          SWING
        </button>
      </div>

      {/* Results Preview */}
      <div className="bg-app-secondary p-4 border-t border-app flex-shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-app-muted text-sm">Collected:</span>
            <span className="text-app-primary ml-2">{collectedOre} ore</span>
          </div>
          <div>
            <span className="text-app-muted text-sm">Efficiency:</span>
            <span
              className={`ml-2 ${
                efficiency >= 85 ? 'text-green-400' : 'text-accent'
              }`}
            >
              {efficiency || 0}%
            </span>
          </div>
          <button
            onClick={() => {
              sessionStore.addToBag('iron-ore', collectedOre);
              sessionStore.useAction(1);
              sessionStore.navigateTo('active-expedition');
            }}
            className="text-accent underline text-sm"
          >
            Finish
          </button>
        </div>
      </div>
    </div>
  );
});

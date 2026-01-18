/**
 * Intro overlay for the herb minigame showing the target herb to find.
 */

import { GoodHerb } from './HerbSvg';

interface TargetHerbDisplayProps {
  onStart: () => void;
}

export const TargetHerbDisplay = ({ onStart }: TargetHerbDisplayProps) => (
  <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50">
    <h2 className="text-2xl font-bold text-white mb-4">Find This Herb!</h2>
    <div className="mb-6 p-4 bg-white/10 rounded-xl">
      <GoodHerb size={120} />
    </div>
    <p className="text-white/80 mb-2">10 petals = Good herb</p>
    <p className="text-white/60 text-sm mb-6">Avoid the 8-petal imposters!</p>
    <button
      onClick={onStart}
      className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-8 rounded-lg transition-colors"
    >
      Start Picking!
    </button>
  </div>
);

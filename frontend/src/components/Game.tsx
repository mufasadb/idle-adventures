import { observer } from 'mobx-react-lite';
import { themeStore } from '../stores/themeStore';
import { sessionStore } from '../stores/sessionStore';
import {
  TownScreen,
  ExpeditionPrepScreen,
  ActiveExpeditionScreen,
  NodeInteractionScreen,
  MinigameScreen,
  MiningMinigameScreen,
  HerbMinigameScreen,
  CombatMinigameScreen,
  FishingMinigameScreen,
  CookingScreen,
  SmithingScreen,
} from '../screens';
import { SkillsSheet, MapDetailsSheet, BankSheet } from './sheets';

export const Game = observer(() => {
  const renderScreen = () => {
    switch (sessionStore.currentScreen) {
      case 'town':
        return <TownScreen />;
      case 'expedition-prep':
        return <ExpeditionPrepScreen />;
      case 'active-expedition':
        return <ActiveExpeditionScreen />;
      case 'node-interaction':
        return <NodeInteractionScreen />;
      case 'minigame':
        return <MinigameScreen />;
      case 'mining-minigame':
        return <MiningMinigameScreen />;
      case 'herbs-minigame':
        return <HerbMinigameScreen />;
      case 'combat-minigame':
        return <CombatMinigameScreen />;
      case 'fishing-minigame':
        return <FishingMinigameScreen />;
      case 'cooking':
        return <CookingScreen />;
      case 'smithing':
        return <SmithingScreen />;
      default:
        return <TownScreen />;
    }
  };

  return (
    <div
      data-theme={themeStore.theme}
      className="h-screen w-screen bg-black flex items-center justify-center"
    >
      {/* iPhone-sized container - max 430px (iPhone 14 Pro Max) */}
      <div className="h-full w-full max-w-[430px] bg-app-primary overflow-hidden relative">
        {/* Current Screen */}
        {renderScreen()}

        {/* Bottom Sheets */}
        <BankSheet />
        <SkillsSheet />
        <MapDetailsSheet />
      </div>
    </div>
  );
});

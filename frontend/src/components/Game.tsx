import { observer } from 'mobx-react-lite';
import { themeStore } from '../stores/themeStore';
import { sessionStore } from '../stores/sessionStore';
import {
  TownScreen,
  ExpeditionPrepScreen,
  ActiveExpeditionScreen,
  NodeInteractionScreen,
  MinigameScreen,
} from './screens';
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
      default:
        return <TownScreen />;
    }
  };

  return (
    <div
      data-theme={themeStore.theme}
      className="h-screen w-screen bg-app-primary overflow-hidden relative"
    >
      {/* Current Screen */}
      {renderScreen()}

      {/* Bottom Sheets */}
      <BankSheet />
      <SkillsSheet />
      <MapDetailsSheet />
    </div>
  );
});

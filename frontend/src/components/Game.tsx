import { observer } from 'mobx-react-lite';
import { sessionStore } from '../stores/sessionStore';
import { TownScreen } from '../screens/TownScreen';
import { StashScreen } from '../screens/StashScreen';
import { ExpeditionPrepScreen } from '../screens/ExpeditionPrepScreen';

export const Game = observer(() => {
  switch (sessionStore.currentScreen) {
    case 'town':
      return <TownScreen />;
    case 'stash':
      return <StashScreen />;
    case 'expedition-prep':
      return <ExpeditionPrepScreen />;
    default:
      return <TownScreen />;
  }
});

import { useGameStore } from './store/gameStore';
import TitleScreen from './ui/TitleScreen';
import DifficultyScreen from './ui/DifficultyScreen';
import PrologueScreen from './ui/PrologueScreen';
import GameView from './ui/GameView';
import EndingScreen from './ui/EndingScreen';

export default function App() {
  const screen = useGameStore((s) => s.screen);
  return (
    <div className="h-full w-full overflow-hidden bg-[#0b0e12] text-[#d7dde5]">
      {screen === 'title' && <TitleScreen />}
      {screen === 'difficulty' && <DifficultyScreen />}
      {screen === 'prologue' && <PrologueScreen />}
      {screen === 'game' && <GameView />}
      {screen === 'ending' && <EndingScreen />}
    </div>
  );
}

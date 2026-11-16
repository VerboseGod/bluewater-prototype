import './style.css';
import { Game } from './game';
import type { SimSnapshot } from './sim/sim';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app');

const game = new Game(root);
game.start();

declare global {
  interface Window {
    __BLUEWATER__?: {
      getState: () => SimSnapshot;
      frame: number;
      ack: number;
      bench: { fps: number; ms: number; quality: string } | null;
      demoPhase: string;
    };
  }
}

window.__BLUEWATER__ = {
  getState: () => game.state(),
  frame: 0,
  ack: 0,
  bench: null,
  demoPhase: '',
};

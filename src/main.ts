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
      setStick: (controls: { rudder: number; sheetIn: number; sheetOut: number; hike: number; moveIn?: number } | null) => void;
      place: (twaDeg: number, speedKn: number, sign?: number) => void;
      setWindKn: (kn: number) => void;
      setGust: (factor: number) => void;
      setSteady: (steady: boolean) => void;
    };
  }
}

window.__BLUEWATER__ = {
  getState: () => game.state(),
  frame: 0,
  ack: 0,
  bench: null,
  demoPhase: '',
  setStick: (controls) => game.setStick(controls),
  place: (twaDeg, speedKn, sign) => game.place(twaDeg, speedKn, sign),
  setWindKn: (kn) => game.setWindKn(kn),
  setGust: (factor) => game.setGust(factor),
  setSteady: (steady) => game.setSteady(steady),
};

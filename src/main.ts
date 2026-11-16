import './style.css';
import type { DockReport } from './dock/score';
import type { HarbourReport } from './harbour/session';
import { freshMemory, scriptedPads, type ScriptMemory } from './coop/script';
import { Game } from './game';
import type { SimSnapshot } from './sim/sim';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app');

const game = new Game(root);
game.start();

declare global {
  interface Window {
    __BLUEWATER__?: {
      getState: () => SimSnapshot & {
        scenario: 'open' | 'dock' | 'harbour' | 'learn' | 'coop';
        coop: {
          phase: string;
          role: string;
          call: string;
          joined: boolean;
          tacks: number;
          sync: number;
          tackQuality: number;
          vang: number;
          roundedLeft: boolean;
          roundedRight: boolean;
          banner: string;
        } | null;
        dock: DockReport | null;
        harbour: HarbourReport | null;
        learn: {
          phase: string;
          lesson: number | null;
          step: string;
          coach: string;
          completed: number[];
          stars: number | null;
          passed: boolean;
        } | null;
      };
      frame: number;
      ack: number;
      bench: { fps: number; ms: number; quality: string } | null;
      demoPhase: string;
      setStick: (controls: { rudder: number; sheetIn: number; sheetOut: number; hike: number; moveIn?: number } | null) => void;
      place: (twaDeg: number, speedKn: number, sign?: number) => void;
      setWindKn: (kn: number) => void;
      setGust: (factor: number) => void;
      setSteady: (steady: boolean) => void;
      scriptPads: (memory: ScriptMemory | null, now: number) => ReturnType<typeof scriptedPads>;
    };
  }
}

window.__BLUEWATER__ = {
  getState: () => ({
    ...game.state(),
    scenario: game.scenario(),
    dock: game.dockReport(),
    harbour: game.harbourReport(),
    learn: game.learnState(),
    coop: game.coopState(),
  }),
  frame: 0,
  ack: 0,
  bench: null,
  demoPhase: '',
  setStick: (controls) => game.setStick(controls),
  place: (twaDeg, speedKn, sign) => game.place(twaDeg, speedKn, sign),
  setWindKn: (kn) => game.setWindKn(kn),
  setGust: (factor) => game.setGust(factor),
  setSteady: (steady) => game.setSteady(steady),
  scriptPads: (memory, now) => {
    const state = game.state();
    const coop = game.coopState();
    return scriptedPads({
      joined: !!coop?.joined,
      x: state.x,
      y: state.y,
      heading: state.heading,
      twa: state.twa,
      windFrom: state.windFrom,
      sheet: state.sheet,
      vFwd: state.vFwd,
      crew: state.crew,
      callPhase: coop?.call ?? 'idle',
      vang: coop?.vang ?? 0,
    }, memory ?? freshMemory(), now);
  },
};

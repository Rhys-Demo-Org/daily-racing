// Entry of the harness-only stages page: the game's base styles and every registered screen stage,
// exposed as window.__stages for harness/screens/capture.ts. Render one stage per page load.
import '../../guardrails/generated/tokens.css';
import '../../src/ui/base.css';
import { STAGES } from '../../src/ui/stages/registry.ts';

export interface StagesDriver {
  names(): string[];
  /** Renders the named stage into #app; throws on an unknown name. */
  render(name: string): void;
}

const app = document.getElementById('app');
if (!app) throw new Error('#app missing from stages.html');
const driver: StagesDriver = {
  names: () => STAGES.map((s) => s.name),
  render(name) {
    const stage = STAGES.find((s) => s.name === name);
    if (!stage) throw new Error(`Unknown stage "${name}"`);
    stage.render(app);
  },
};
(window as unknown as { __stages: StagesDriver }).__stages = driver;

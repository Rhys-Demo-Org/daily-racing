// Stage registry. Every src/ui/stages/*.stage.ts is registered by being there (import.meta.glob):
// there is no hand-edited list. Only the harness page (harness/screens) and tests import this; the
// game never does, so no stage reaches the production bundle.
import { collectStages, type NamedStage, type StageFile } from './stage.ts';

const files = import.meta.glob<StageFile>('./*.stage.ts', { eager: true, import: 'default' });

/** Every registered stage, sorted by name. */
export const STAGES: readonly NamedStage[] = collectStages(files);

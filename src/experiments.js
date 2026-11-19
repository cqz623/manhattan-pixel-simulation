import { createEnvironment } from './environment.js';
import { environmentChanges } from './design.js';

export const EXPERIMENTS = Object.freeze([
  { id: 'shortcut', name: 'Experiment 1 — Shortcut', question: 'Does improved physical connectivity improve delivery performance when agents initially have limited spatial knowledge?' },
  { id: 'congestion', name: 'Experiment 2 — Congestion', question: 'How does increased movement cost affect route selection and delivery performance?' },
  { id: 'landmark', name: 'Experiment 3 — Landmark', question: 'Does landmark discovery and reuse improve navigation or repeated-task performance?' },
  { id: 'closure', name: 'Road Closure Test', question: 'How does blocking a central road segment change movement when a bypass remains available?' },
]);
/** Authored abstract testbeds. No outcomes or hidden routes are supplied to agents. */
export function createExperimentPair(id) {
  const definition = EXPERIMENTS.find(item => item.id === id);
  if (!definition) throw new Error('Unknown demonstration experiment.');
  const a = createEnvironment(40, 28), width = 40;
  a.name = definition.name + ' · A'; a.layers.static.fill('building');
  a.source = { kind: 'schematic', description: `Authored abstract ${id} experiment. Not actual GIS data.`, crs: null, bounds: null, generator: 'experiment-preset', seed: 1, experiment: id };
  a.simulation = { activeArea: { id: 'city', name: 'Entire city', x: 0, y: 0, width: 40, height: 28 }, agentMode: 'explorer-courier', taskBudget: 4 };
  const fill = (env, x1, y1, x2, y2, terrain) => { for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) env.layers.static[y * width + x] = terrain; };
  fill(a, 3, 8, 36, 10, 'road'); fill(a, 3, 18, 36, 20, 'road');
  fill(a, 3, 8, 5, 20, 'road'); fill(a, 34, 8, 36, 20, 'road');
  fill(a, 11, 5, 18, 7, 'park'); fill(a, 12, 7, 13, 8, 'park');
  fill(a, 23, 21, 29, 23, 'park'); fill(a, 24, 20, 25, 21, 'park');
  if (id !== 'shortcut') fill(a, 6, 13, 33, 14, 'road');
  for (const [x, y, kind] of [[4, 14, 'depot'], [4, 16, 'depot'], [35, 14, 'destination'], [35, 16, 'destination']]) a.layers.semantic[y * width + x] = kind;
  for (const y of [14, 15, 16, 17]) a.layers.dynamic[y * width + 4] = 'robot';
  const b = structuredClone(a); b.name = definition.name + ' · B';
  if (id === 'shortcut') fill(b, 6, 13, 33, 14, 'road');
  if (id === 'congestion') { fill(b, 14, 13, 25, 14, 'crowd'); b.rules.crowdBaseCost = 2.5; }
  if (id === 'closure') fill(b, 18, 13, 19, 14, 'construction');
  if (id === 'landmark') for (const [x, y] of [[9, 9], [18, 9], [30, 9], [35, 18], [18, 19], [4, 18], [14, 14], [26, 14]]) b.layers.semantic[y * width + x] = 'landmark';
  return { ...definition, a, b, changes: environmentChanges(a, b), options: { seed: 1, count: 4, radius: 6, useLandmarks: true, seconds: 480 } };
}

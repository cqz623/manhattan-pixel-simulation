/** Reproducible, headless runs of the actual browser simulation model. */
import { EXPERIMENTS, createExperimentPair } from '../src/experiments.js';
import { EnvironmentComparison } from '../src/ab-comparison.js';
import { hasValidRoutes } from '../src/design.js';
const experiments = [];
for (const definition of EXPERIMENTS) {
  const pair = createExperimentPair(definition.id), study = new EnvironmentComparison(pair.a, pair.options);
  if (!hasValidRoutes(pair.a, study.plan) || !hasValidRoutes(pair.b, study.plan)) throw new Error('Invalid demonstration layout.');
  for (const variant of ['A', 'B']) {
    const run = variant === 'A' ? study.runA() : study.runB(pair.b);
    while (!run.advance(100));
    study[variant === 'A' ? 'resultA' : 'resultB'] = run.result();
  }
  experiments.push({ id: definition.id, question: definition.question, options: pair.options, plan: study.plan, changes: study.changes(), a: study.resultA, b: study.resultB, preferred: study.preferred() });
}
process.stdout.write(JSON.stringify({ format: 'pixel-city-demo-results', version: 1, generatedAt: new Date().toISOString(), note: 'Actual fixed-step model runs. One seed, not a general performance claim. Geometry is abstract.', experiments }, null, 2) + '\n');

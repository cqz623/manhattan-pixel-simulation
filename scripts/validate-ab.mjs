/** Actual deterministic validation, using the same fixed-step engine as both UI modes. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createAbstractEnvironment } from '../src/abstract-manhattan.js';
import { EnvironmentComparison, FixedEnvironmentRun } from '../src/ab-comparison.js';
import { generateVariation, hasValidRoutes } from '../src/design.js';
import { createExperimentPair } from '../src/experiments.js';
import { analyzeSpatialComparison, comparisonExplanation } from '../src/spatial-comparison.js';

const finish = runner => { while (!runner.advance(100)); return runner.result(); };
const digest = result => createHash('sha256').update(JSON.stringify(result.spatial)).digest('hex');
const metrics = result => { const { spatial, trips, ...values } = result; return { ...values, spatialSha256: digest(result), completedTrips: trips }; };
function summary(a, b, resultA, resultB) {
  const data = analyzeSpatialComparison(a, b, resultA, resultB);
  return { a: metrics(resultA), b: metrics(resultB), initialConditionsMatch: data.initialConditionsMatch,
    changedCells: data.changes, pairedAgents: data.pairedAgents, pairedDeliveries: data.pairedTrips,
    explanation: comparisonExplanation(data) };
}
const source = createAbstractEnvironment(), options = { count: 4, seed: 1, radius: 6, useLandmarks: true, seconds: 960 };
const study = new EnvironmentComparison(source, options), resultA = finish(study.runA());
const variation = generateVariation(source, { seed: 1, plan: study.plan }), resultB = finish(study.runB(variation));
assert.ok(hasValidRoutes(variation, study.plan));
const identical = finish(new FixedEnvironmentRun(source, study.plan, options.seconds)); assert.deepEqual(identical, resultA);
const framed = new FixedEnvironmentRun(source, study.plan, options.seconds);
for (let n = 0; framed.simulation.tick < framed.ticks; n++) framed.simulation.advance([16, 17, 33, 8][n % 4] * 16);
framed.done = true; assert.deepEqual(framed.result(), resultA);
const validations = [];
for (const id of ['shortcut', 'closure', 'congestion']) {
  const pair = createExperimentPair(id), run = new EnvironmentComparison(pair.a, pair.options);
  assert.ok(hasValidRoutes(pair.a, run.plan)); assert.ok(hasValidRoutes(pair.b, run.plan));
  const a = finish(run.runA()), b = finish(run.runB(pair.b));
  assert.deepEqual(a.initialConditions, b.initialConditions);
  const data = summary(pair.a, pair.b, a, b);
  if (id === 'closure') { assert.ok(data.changedCells.some(cell => cell.a.visits > 0)); assert.ok(data.changedCells.every(cell => cell.b.visits === 0)); }
  if (id === 'congestion') assert.ok(data.changedCells.every(cell => cell.costB > cell.costA));
  if (id === 'shortcut') assert.ok(data.changedCells.some(cell => cell.b.visits > 0));
  validations.push({ id, options: pair.options, plan: run.plan, ...data });
}
process.stdout.write(JSON.stringify({ format: 'pixel-city-ab-validation', version: 2, generatedAt: new Date().toISOString(),
  checks: { identicalMapsProduceIdenticalResults: true, fastAndFrameAccumulatedResultsIdentical: true, validAlternativeRoutes: true },
  note: 'Actual model runs. Frame accumulation is headless and does not claim browser layout/animation QA. Default sample is reproducible; the original user-edited B file was not supplied.',
  defaultFourCellSample: { options, mapSeed: 1, variationSeed: 1, ...summary(source, variation, resultA, resultB) }, validations }, null, 2) + '\n');

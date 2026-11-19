/** Phase 4 evidence: actual runs, replay equality, measured selection and iteration lineage. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createExperimentPair } from '../src/experiments.js';
import { EnvironmentComparison } from '../src/ab-comparison.js';
import { ScenarioArchive } from '../src/scenarios.js';
import { generateAlternatives, environmentChanges, hasValidRoutes } from '../src/design.js';
import { analyzeSpatialComparison, comparisonExplanation } from '../src/spatial-comparison.js';

const finish = run => { while (!run.advance(100)); return run.result(); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const summarize = result => Object.fromEntries(['deliveries', 'plannedTasks', 'successRate', 'averageDeliveryTime', 'travelCost', 'explorationCoverage', 'explorerCoverage', 'replans', 'reuse', 'firstDelivery', 'laterDelivery'].map(key => [key, result[key]]));
const experiments = [];
for (const id of ['shortcut', 'congestion', 'landmark']) {
  const pair = createExperimentPair(id), study = new EnvironmentComparison(pair.a, pair.options), archive = new ScenarioArchive();
  const conditions = { plan: study.plan, seconds: 480, initialKnowledge: 'empty', stepSeconds: .2 };
  assert.ok(hasValidRoutes(pair.a, study.plan)); assert.ok(hasValidRoutes(pair.b, study.plan));
  const a = archive.add(pair.a, { conditions }), b = archive.add(pair.b, { conditions, parentId: a.id, changes: pair.changes });
  archive.recordResult(a.id, finish(study.runA()), study.plan); archive.recordResult(b.id, finish(study.runB(pair.b)), study.plan);
  assert.deepEqual(a.result, finish(study.runA()));
  const framed = study.runB(pair.b);
  for (let n = 0; framed.simulation.tick < framed.ticks; n++) framed.simulation.advance([16, 17, 33, 8][n % 4] * 16);
  framed.done = true; assert.deepEqual(framed.result(), b.result);
  const before = structuredClone(archive.records), data = analyzeSpatialComparison(pair.a, pair.b, a.result, b.result);
  assert.equal(data.initialConditionsMatch, true);
  for (const [result, indexed] of [[a.result, data.indexedA], [b.result, data.indexedB]]) assert.equal([...indexed.edges.values()].reduce((sum, edge) => sum + edge.count, 0), result.spatial.agents.reduce((sum, agent) => sum + agent.trail.length - 1, 0));
  // Exercise both human choices. This is a validation branch, never a metric-based recommendation.
  const branches = [];
  for (const selected of [a, b]) {
    const entry = archive.completeIteration(a.id, b.id, selected.id, { changes: pair.changes });
    const baseline = archive.nextBaseline(entry.id), next = EnvironmentComparison.fromRecords(baseline);
    assert.deepEqual(baseline.environment, selected.environment); assert.deepEqual(next.plan, study.plan);
    assert.deepEqual(next.resultA, finish(next.runA()));
    const alternatives = generateAlternatives(baseline.environment, { seed: 17, plan: next.plan });
    assert.ok(alternatives.every(env => hasValidRoutes(env, next.plan)));
    const child = archive.add(alternatives[0], { parentId: baseline.id, iteration: baseline.iteration, conditions: baseline.conditions });
    archive.recordResult(child.id, finish(next.runB(child.environment)), next.plan);
    const second = archive.completeIteration(baseline.id, child.id, baseline.id, { parentIterationId: entry.id, changes: environmentChanges(baseline.environment, child.environment) });
    assert.equal(second.parentEnvironmentId, selected.id); assert.equal(second.parentIterationId, entry.id);
    assert.deepEqual(archive.records.slice(0, 2), before);
    const history = EnvironmentComparison.fromRecords(a, b);
    assert.deepEqual(history.resultA, a.result); assert.deepEqual(history.resultB, b.result);
    branches.push({ selected: selected.id, nextBaseline: baseline.id, measurementSource: baseline.measurementSourceId, nextResult: summarize(child.result), iterations: [entry.id, second.id], validVariations: alternatives.length });
  }
  experiments.push({ id, question: pair.question, options: pair.options, plan: study.plan, changes: pair.changes,
    a: summarize(a.result), b: summarize(b.result), spatialSha256: { a: digest(a.result.spatial), b: digest(b.result.spatial) },
    pairedRoutes: data.pairedTrips, changedCells: data.changes, explanation: comparisonExplanation(data), branches });
}
process.stdout.write(JSON.stringify({ format: 'pixel-city-iteration-validation', version: 1, generatedAt: new Date().toISOString(),
  checks: { matchedStarts: true, identicalReplay: true, fastAndAnimatedEquivalent: true, bothSelectionBranches: true, selectedMeasurementMatchesFreshReplay: true, previousEvidenceUnchanged: true, validVariations: true, recordedPathsMatchMovements: true },
  note: 'Actual fixed-step model runs and frame accumulation. Validation selects both branches deliberately; no winning environment is inferred. Browser layout/video QA is separate.', experiments }, null, 2) + '\n');

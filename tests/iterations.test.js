import test from 'node:test';
import assert from 'node:assert/strict';
import { ScenarioArchive } from '../src/scenarios.js';
import { createExperimentPair } from '../src/experiments.js';
import { EnvironmentComparison } from '../src/ab-comparison.js';
import { environmentChanges, generateAlternatives, hasValidRoutes } from '../src/design.js';
import { analyzeSpatialComparison } from '../src/spatial-comparison.js';

const finish = run => { while (!run.advance(100)); return run.result(); };
function measuredPair(id = 'shortcut') {
  const pair = createExperimentPair(id), study = new EnvironmentComparison(pair.a, pair.options), archive = new ScenarioArchive();
  const conditions = { plan: study.plan, seconds: 480, initialKnowledge: 'empty', stepSeconds: .2 };
  const a = archive.add(pair.a, { conditions }), b = archive.add(pair.b, { conditions, parentId: a.id, changes: pair.changes });
  archive.recordResult(a.id, finish(study.runA()), study.plan);
  archive.recordResult(b.id, finish(study.runB(pair.b)), study.plan);
  return { pair, study, archive, a, b };
}

test('manual A or B selection retains measurements and seeds the next baseline without changing prior evidence', () => {
  for (const selectedKey of ['a', 'b']) {
    const { pair, archive, a, b } = measuredPair(), selected = selectedKey === 'a' ? a : b;
    const before = structuredClone(archive.records);
    const iteration = archive.completeIteration(a.id, b.id, selected.id, { changes: pair.changes });
    assert.equal(iteration.number, 1); assert.equal(iteration.selectedId, selected.id);
    assert.deepEqual(iteration.metrics[selectedKey].travelCost, selected.result.travelCost);
    const baseline = archive.nextBaseline(iteration.id), next = EnvironmentComparison.fromRecords(baseline);
    assert.equal(baseline.parentId, selected.id); assert.equal(baseline.measurementSourceId, selected.id);
    assert.deepEqual(baseline.environment, selected.environment); assert.deepEqual(baseline.conditions, selected.conditions);
    assert.deepEqual(next.resultA, finish(next.runA()), 'carried measurement matches an actual fresh baseline replay');
    assert.deepEqual(next.resultA.spatial, selected.result.spatial);
    assert.deepEqual(archive.records.slice(0, 2), before); assert.equal(iteration.closed, true);
    const variants = generateAlternatives(baseline.environment, { seed: 4, plan: next.plan });
    assert.ok(variants.every(env => hasValidRoutes(env, next.plan)));
    const b2 = archive.add(variants[0], { parentId: baseline.id, iteration: baseline.iteration, conditions: baseline.conditions });
    archive.recordResult(b2.id, finish(next.runB(b2.environment)), next.plan);
    const second = archive.completeIteration(baseline.id, b2.id, baseline.id, { parentIterationId: iteration.id, changes: environmentChanges(baseline.environment, b2.environment) });
    assert.equal(second.number, 2); assert.equal(second.parentEnvironmentId, selected.id); assert.equal(second.parentIterationId, iteration.id);
    assert.equal(archive.iterations[0].selectedId, selected.id); assert.deepEqual(archive.records.slice(0, 2), before);
    const exported = archive.export(); exported.iterations[0].metrics.a.replans = -10;
    assert.notEqual(archive.iterations[0].metrics.a.replans, -10);
  }
});

test('incomplete or unmatched pairs cannot become completed iterations, and evaluated results cannot be overwritten', () => {
  const { archive, study, a, b, pair } = measuredPair('congestion');
  const draft = archive.add(pair.b, { conditions: b.conditions });
  assert.throws(() => archive.completeIteration(a.id, draft.id, draft.id), /Complete both/);
  assert.throws(() => archive.recordResult(a.id, { ...a.result, replans: -1 }, study.plan), /immutable/);
  archive.recordResult(a.id, structuredClone(a.result), study.plan);
  const mismatch = archive.add(pair.b, { conditions: b.conditions });
  const altered = structuredClone(b.result); altered.initialConditions.seed++;
  archive.recordResult(mismatch.id, altered, study.plan);
  assert.throws(() => archive.completeIteration(a.id, mismatch.id, mismatch.id), /matched/);
});

test('history reconstructs saved environments, metrics, paths and knowledge without generating new simulation states', () => {
  const { archive, a, b } = measuredPair('landmark'), before = archive.export();
  const historical = EnvironmentComparison.fromRecords(a, b), data = analyzeSpatialComparison(historical.a, historical.b, historical.resultA, historical.resultB);
  assert.deepEqual(historical.plan, a.conditions.plan); assert.deepEqual(historical.resultA, a.result); assert.deepEqual(historical.resultB, b.result);
  assert.ok(data.indexedB.known.size > 0); assert.ok(data.indexedB.landmarks.size > 0);
  assert.equal([...data.indexedA.edges.values()].reduce((sum, edge) => sum + edge.count, 0), a.result.spatial.agents.reduce((sum, agent) => sum + agent.trail.length - 1, 0));
  historical.b.layers.static.fill('park'); historical.resultB.spatial.agents[0].trail.length = 0;
  assert.deepEqual(archive.export().scenarios, before.scenarios);
});

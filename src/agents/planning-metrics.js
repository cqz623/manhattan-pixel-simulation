/** Metrics observe decisions; they never choose routes or inspect simulation truth. */
export const REPLAN_REASONS = Object.freeze(['obstacle', 'information', 'goal', 'occupancy', 'blocked']);
export const sameRoute = (a, b) => a.length === b.length && a.every((index, n) => index === b[n]);
export function createPlanningDiagnostics() {
  return { computations: 0, initialPlans: 0, routinePlans: 0, unsuccessfulSearches: 0, unchangedRoutes: 0, goalTransitions: 0, reasons: Object.fromEntries(REPLAN_REASONS.map(reason => [reason, 0])) };
}
export function searchRoute(agent, search) {
  agent.planning.computations++;
  const result = search(); if (!result) agent.planning.unsuccessfulSearches++;
  return result;
}
export function recordPlan(agent, { previous, next, reason = null, time, goalKey = agent.navigationKey, observed = [] }) {
  const changed = !sameRoute(previous, next), goalChanged = agent.navigationKey !== null && goalKey !== agent.navigationKey;
  if (goalChanged) agent.planning.goalTransitions++;
  // Reaching a frontier/task and computing its successor is normal continuation.
  // Only replacement/abandonment of an unfinished route belongs in main Replans.
  if (previous.length && reason && (changed || goalChanged)) {
    agent.replans++; agent.planning.reasons[reason]++;
    agent.replanEvents.push({ time, reason, from: agent.position.y * agent.memory.width + agent.position.x, previousGoal: agent.navigationKey, goal: goalKey, previous: [...previous], next: [...next], observed: [...observed] });
  } else if (!agent.planning.initialPlans && next.length) agent.planning.initialPlans++;
  else if (next.length && !previous.length) agent.planning.routinePlans++;
  if (previous.length && sameRoute(previous, next)) agent.planning.unchangedRoutes++;
  agent.navigationKey = goalKey;
}

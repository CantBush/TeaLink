import type { Decision, Dimension } from "../api/types.ts";
import { DIMENSIONS, dimensionLabel } from "./format.ts";

const TIE_GAP = 0.02;

export interface Critique {
  message: string;
  reply: string;
  payload: { drink_id: string; weakest_reason: string; answered: boolean; changed_pick: boolean };
}

const pct = (value: number) => Math.round(value * 100);

/**
 * The Critic's case against the arbiter's #1: the priority where it loses most to the runner-up
 * (or its own weakest score when nothing beats it), and the arbiter's answer from the same weights.
 */
export function critique(decision: Decision): Critique | null {
  const [winner, runner] = decision.options ?? [];
  const weights = decision.weights;
  if (!winner?.dimension_scores || !weights) return null;
  const mine = winner.dimension_scores;
  const name = winner.drink_name;
  const lower = (dimension: Dimension) => dimensionLabel(dimension).toLowerCase();

  let weakest: string;
  let reply: string;
  const other = runner?.dimension_scores;
  const losses = other ? DIMENSIONS.filter((dimension) => other[dimension] > mine[dimension]) : [];
  if (runner && other && losses.length) {
    const worst = losses.reduce((a, b) =>
      weights[a] * (other[a] - mine[a]) >= weights[b] * (other[b] - mine[b]) ? a : b,
    );
    weakest = `${runner.drink_name} beats it on ${lower(worst)}: ${pct(other[worst])} vs ${pct(mine[worst])}.`;
    const gap = winner.score - runner.score;
    reply =
      gap <= TIE_GAP
        ? `Fair point, it's too close to call (${winner.score.toFixed(2)} vs ${runner.score.toFixed(2)}), so you get the final say.`
        : `It holds. ${lower(worst)} counts for ${pct(weights[worst])}% for you, and ${name} still leads by ${gap.toFixed(2)} overall.`;
  } else {
    const worst = DIMENSIONS.reduce((a, b) => (mine[a] <= mine[b] ? a : b));
    weakest = `its ${lower(worst)} score is only ${pct(mine[worst])}.`;
    reply = runner
      ? `It holds. Nothing in the top 3 beats ${name} on any priority.`
      : `It holds. ${name} is the only drink left standing.`;
  }

  return {
    message: `Before you lock in ${name}: ${weakest}`,
    reply,
    payload: { drink_id: winner.drink_id, weakest_reason: weakest, answered: true, changed_pick: false },
  };
}

import type { Decision, Dimension, DimensionScores, LensEvent, Proposal, RankedDrink } from "../api/types.ts";
import { agentInfo } from "./agents.ts";
import { DIMENSIONS, dimensionLabel } from "./format.ts";

/** Same near-tie rule as the backend resolver. */
const TIE_GAP = 0.02;

const DIMENSION_OF: Record<string, Dimension> = { taste: "taste", social: "social", explorer: "novelty", budget: "cost" };

function names(agentIds: string[]): string {
  const list = agentIds.map((id) => agentInfo(id).name);
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/**
 * Re-rank a round as if `stopped` never answered: their proposals and scores are left out, and their
 * share of your priorities is spread over the rest. Mirrors `core/resolution.py`, so the arbiter's
 * maths is the same one the API runs; only the missing agents differ.
 */
export function resolveWithout(decision: Decision, proposals: Proposal[], objections: LensEvent[], stopped: string[]): Decision {
  const lost = new Set(stopped.map((id) => DIMENSION_OF[id]).filter(Boolean));
  const base = decision.weights ?? { taste: 0.55, social: 0.15, novelty: 0.15, cost: 0.15 };
  const kept = DIMENSIONS.filter((dimension) => !lost.has(dimension));
  const keptTotal = kept.reduce((sum, dimension) => sum + base[dimension], 0) || 1;
  const weights = Object.fromEntries(
    DIMENSIONS.map((dimension) => [dimension, lost.has(dimension) ? 0 : base[dimension] / keptTotal]),
  ) as DimensionScores;

  const first = new Map<string, Proposal>();
  for (const proposal of proposals) if (!first.has(proposal.drink_id)) first.set(proposal.drink_id, proposal);

  const scores = new Map<string, Partial<DimensionScores>>([...first.keys()].map((id) => [id, {}]));
  for (const proposal of proposals) {
    const entry = scores.get(proposal.drink_id);
    if (entry && proposal.dimension && entry[proposal.dimension] === undefined) entry[proposal.dimension] = proposal.score;
  }
  for (const event of objections) {
    const items = Array.isArray(event.payload.objections) ? (event.payload.objections as Record<string, unknown>[]) : [event.payload];
    for (const item of items) {
      const entry = scores.get(String(item.target_drink_id ?? ""));
      const dimension = item.dimension as Dimension | null | undefined;
      if (entry && dimension && typeof item.score === "number") entry[dimension] = item.score;
    }
  }

  const dropped = (decision.dropped ?? []).filter((item) => first.has(item.drink_id));
  const removed = new Set(dropped.map((item) => item.drink_id));
  const ranked: RankedDrink[] = [...first.values()]
    .filter((proposal) => !removed.has(proposal.drink_id))
    .map((proposal) => {
      const own = scores.get(proposal.drink_id) ?? {};
      const dimension_scores = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, own[dimension] ?? 0])) as DimensionScores;
      return {
        drink_id: proposal.drink_id,
        drink_name: proposal.drink_name,
        shop_id: proposal.shop_id,
        price: proposal.price,
        dimension_scores,
        score: DIMENSIONS.reduce((sum, dimension) => sum + weights[dimension] * dimension_scores[dimension], 0),
      };
    })
    .sort((a, b) => b.score - a.score || a.drink_id.localeCompare(b.drink_id));

  const share = Math.round(DIMENSIONS.filter((dimension) => lost.has(dimension)).reduce((sum, dimension) => sum + base[dimension], 0) * 100);
  const lead = `Without ${names(stopped)}, the arbiter spread ${share}% of your priorities over the others.`;

  if (ranked.length === 0) {
    return {
      ...decision,
      drink_id: "",
      drink_name: "",
      shop_id: "",
      score: 0,
      ask_human: true,
      question: "Every suggested drink was ruled out. What would you like instead?",
      alternatives: [],
      options: [],
      explanation: `${lead} No candidate survived.`,
      weights,
      dropped,
      missing_agents: stopped,
    };
  }

  const options = ranked.slice(0, 3);
  const [winner, runner] = options;
  const tie = runner !== undefined && winner.score - runner.score <= TIE_GAP;
  const top = winner.dimension_scores!;
  const boost = DIMENSIONS.reduce((best, dimension) => (weights[dimension] * top[dimension] > weights[best] * top[best] ? dimension : best));
  let explanation = `${lead} ${winner.drink_name} ranks first (${winner.score.toFixed(2)}). Its biggest boost is ${dimensionLabel(boost).toLowerCase()}, which now counts for ${Math.round(weights[boost] * 100)}% for you.`;
  if (runner) {
    const other = runner.dimension_scores!;
    const edge = DIMENSIONS.reduce((best, dimension) =>
      weights[dimension] * (top[dimension] - other[dimension]) > weights[best] * (top[best] - other[best]) ? dimension : best,
    );
    explanation += ` It beats ${runner.drink_name} mainly on ${dimensionLabel(edge).toLowerCase()}.`;
  }
  if (dropped.length) explanation += ` Ruled out: ${dropped.map((item) => item.drink_name).join(", ")}.`;

  return {
    ...decision,
    drink_id: winner.drink_id,
    drink_name: winner.drink_name,
    shop_id: winner.shop_id ?? "",
    score: winner.score,
    ask_human: tie,
    question: tie
      ? `${winner.drink_name} and ${runner.drink_name} are nearly tied (${winner.score.toFixed(2)} vs ${runner.score.toFixed(2)}). Your pick will teach us which matters more.`
      : null,
    alternatives: options.slice(1),
    options,
    explanation,
    weights,
    dropped,
    missing_agents: stopped,
  };
}

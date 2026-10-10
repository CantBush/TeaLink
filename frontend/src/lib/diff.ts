import type { Decision, Dimension, RankedDrink } from "../api/types.ts";
import { DIMENSIONS, matchPercent } from "./format.ts";

export function topOptions(decision: Decision): RankedDrink[] {
  if (decision.options && decision.options.length > 0) return decision.options;
  return [
    { drink_id: decision.drink_id, drink_name: decision.drink_name, score: decision.score, shop_id: decision.shop_id },
    ...decision.alternatives,
  ].slice(0, 3);
}

export type Movement =
  | { kind: "new" }
  | { kind: "same" }
  | { kind: "up"; by: number }
  | { kind: "down"; by: number };

export interface RankedMove {
  option: RankedDrink;
  rank: number;
  movement: Movement;
}

export interface LeftTop {
  option: RankedDrink;
  rank: number;
  /** Why it left, when the resolver ruled it out; null when it was simply outranked. */
  reason: string | null;
}

export interface WeightShift {
  dimension: Dimension;
  before: number;
  after: number;
}

export interface DecisionDiff {
  after: RankedMove[];
  left: LeftTop[];
  weights: WeightShift[];
  sameOrder: boolean;
}

export function diffDecisions(before: Decision, after: Decision): DecisionDiff {
  const beforeTop = topOptions(before);
  const afterTop = topOptions(after);
  const beforeRank = new Map(beforeTop.map((option, index) => [option.drink_id, index + 1]));
  const afterIds = new Set(afterTop.map((option) => option.drink_id));
  const dropped = new Map((after.dropped ?? []).map((item) => [item.drink_id, item.reason]));

  const moves: RankedMove[] = afterTop.map((option, index) => {
    const rank = index + 1;
    const was = beforeRank.get(option.drink_id);
    let movement: Movement;
    if (was === undefined) movement = { kind: "new" };
    else if (was === rank) movement = { kind: "same" };
    else if (was > rank) movement = { kind: "up", by: was - rank };
    else movement = { kind: "down", by: rank - was };
    return { option, rank, movement };
  });

  const left: LeftTop[] = beforeTop
    .map((option, index) => ({ option, rank: index + 1 }))
    .filter(({ option }) => !afterIds.has(option.drink_id))
    .map(({ option, rank }) => ({ option, rank, reason: dropped.get(option.drink_id) ?? null }));

  const weights: WeightShift[] = [];
  if (before.weights && after.weights) {
    for (const dimension of DIMENSIONS) {
      const was = before.weights[dimension] ?? 0;
      const now = after.weights[dimension] ?? 0;
      if (matchPercent(now) !== matchPercent(was)) weights.push({ dimension, before: was, after: now });
    }
  }

  const sameOrder =
    left.length === 0 && moves.every((move) => move.movement.kind === "same");
  return { after: moves, left, weights, sameOrder };
}

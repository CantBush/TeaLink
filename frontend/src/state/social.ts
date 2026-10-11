import { useEffect, useState } from "react";
import { social } from "../api/social.ts";
import type { UserProfile } from "../api/types.ts";
import { useMe } from "./me.ts";

let version = 0;
const listeners = new Set<() => void>();

/** Ask every mounted profile to refetch, e.g. after an edit or a follow. */
export function profilesChanged() {
  version += 1;
  listeners.forEach((listener) => listener());
}

/** A user's profile as the current user sees it. `handle` defaults to the current user. */
export function useProfile(handle?: string): { profile: UserProfile | null; error: string | null } {
  const me = useMe();
  const target = handle ?? me;
  const [state, setState] = useState<{ key: string; profile: UserProfile | null; error: string | null }>({
    key: "",
    profile: null,
    error: null,
  });
  const [tick, setTick] = useState(version);

  useEffect(() => {
    const listener = () => setTick(version);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    const key = `${target}:${me}`;
    social
      .getUser(target, me)
      .then((profile) => {
        if (!cancelled) setState({ key, profile, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ key, profile: null, error: error instanceof Error ? error.message : "Couldn't load this profile." });
      });
    return () => {
      cancelled = true;
    };
  }, [target, me, tick]);

  const fresh = state.key === `${target}:${me}`;
  return { profile: fresh ? state.profile : null, error: fresh ? state.error : null };
}

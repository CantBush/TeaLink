import { Unavailable, request, withFallback } from "./http.ts";
import type { Account, SignupRequest } from "./types.ts";

/**
 * Sign up, sign in, and sessions (contract in docs/PLAN.md, "Accounts, store tools, and ordering").
 * Each call tries Track A's /auth route first. Until it is served, accounts live in this browser:
 * passwords are salted and hashed, but this is a preview, not real security.
 */

const ACCOUNTS_KEY = "tealink.mock_accounts";
export const DEMO_PASSWORD = "boba";
export const DEMO_ACCOUNTS = {
  customer: { email: "andrew@tealink.demo", label: "Andrew" },
  store: { email: "sunright@tealink.demo", label: "Sunright Tea Studio" },
} as const;

interface StoredAccount extends Account {
  salt: string;
  hash: string;
}

async function hash(password: string, salt: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${password}`));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readAccounts(): StoredAccount[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as StoredAccount[]) : [];
  } catch {
    return [];
  }
}

function writeAccounts(accounts: StoredAccount[]) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    /* Private mode: accounts last for this tab only. */
  }
}

const clean = (email: string) => email.trim().toLowerCase();

async function mockSignup(body: SignupRequest): Promise<Account> {
  const accounts = readAccounts();
  if (accounts.some((account) => account.email === clean(body.email))) throw new Error("That email already has an account. Sign in instead.");
  const salt = crypto.randomUUID();
  const account: StoredAccount = {
    email: clean(body.email),
    user_id: body.role === "store" ? `store_${body.shop_id}` : (body.user_id ?? ""),
    role: body.role,
    shop_id: body.shop_id,
    salt,
    hash: await hash(body.password, salt),
  };
  writeAccounts([...accounts, account]);
  return { email: account.email, user_id: account.user_id, role: account.role, shop_id: account.shop_id };
}

async function seedDemoAccounts() {
  const accounts = readAccounts();
  const missing = [
    { email: DEMO_ACCOUNTS.customer.email, role: "customer" as const, user_id: "andrew" },
    { email: DEMO_ACCOUNTS.store.email, role: "store" as const, shop_id: "sunright" },
  ].filter((demo) => !accounts.some((account) => account.email === demo.email));
  for (const demo of missing) await mockSignup({ ...demo, password: DEMO_PASSWORD });
}

async function mockLogin(email: string, password: string): Promise<Account> {
  await seedDemoAccounts();
  const account = readAccounts().find((item) => item.email === clean(email));
  if (!account || (await hash(password, account.salt)) !== account.hash) throw new Error("Wrong email or password.");
  return { email: account.email, user_id: account.user_id, role: account.role, shop_id: account.shop_id };
}

export const auth = {
  signup: (body: SignupRequest) => withFallback(() => request<Account>("POST", "/auth/signup", body), () => mockSignup(body)),

  login: (email: string, password: string) =>
    withFallback(
      () => request<Account>("POST", "/auth/login", { email: clean(email), password }),
      () => mockLogin(email, password),
    ),

  logout: () =>
    withFallback(
      () => request<{ ok: boolean }>("POST", "/auth/logout"),
      async () => ({ ok: true }),
    ),

  /** The live session, `null` when the API says there is none, or `undefined` when the API has no auth yet. */
  me: async (): Promise<Account | null | undefined> => {
    try {
      return await request<Account>("GET", "/auth/me");
    } catch (error) {
      if (error instanceof Unavailable) return undefined;
      return null;
    }
  },
};

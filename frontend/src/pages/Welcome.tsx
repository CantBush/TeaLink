import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, auth } from "../api/auth.ts";
import { social } from "../api/social.ts";
import type { Account, FavoritePick, QuizAnswers, QuizKind, QuizQuestion, UserProfile } from "../api/types.ts";
import { Avatar } from "../components/Avatar.tsx";
import { BobaCard } from "../components/BobaCard.tsx";
import { BobaMark } from "../components/BobaMark.tsx";
import { Shell } from "../components/OnboardingShell.tsx";
import { ChooseQuizStep, FavoritesStep } from "../components/QuizSteps.tsx";
import { RoleChoice } from "../components/RoleChoice.tsx";
import { AVATAR_COLORS as STARTER_COLORS } from "../lib/palette.ts";
import { ShopPicker } from "./shop/ShopPicker.tsx";
import { isSignedIn, signIn } from "../state/account.ts";
import { getMe } from "../state/me.ts";
import { getRole, useRole, useShopId } from "../state/role.ts";
import { switchUser } from "../state/session.ts";
import { profilesChanged } from "../state/social.ts";

const input = "w-full rounded-2xl border border-line bg-foam px-4 py-3 text-lg outline-none focus:border-moss";

const STARTER_EMOJIS = ["🧋", "🍵", "🐯", "🌸", "🍓", "🐼", "🦊", "🌙"];

function handleFrom(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "")
    .slice(0, 20);
}

type Step =
  | { kind: "signin" }
  | { kind: "role" }
  | { kind: "shop" }
  | { kind: "store"; shopId: string }
  | { kind: "account" }
  | { kind: "choose" }
  | { kind: "question"; index: number }
  | { kind: "saving" }
  | { kind: "result"; profile: UserProfile };

/** Signed out: sign in first. A signed-in customer reaching /welcome is retaking the quiz. */
function firstStep(): Step {
  if (isSignedIn() && getRole() === "customer") return { kind: "choose" };
  return { kind: "signin" };
}

function Credentials({
  email,
  password,
  onEmail,
  onPassword,
  newPassword,
}: {
  email: string;
  password: string;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  newPassword?: boolean;
}) {
  return (
    <>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold">Email</span>
        <input type="email" value={email} onChange={(event) => onEmail(event.target.value)} autoComplete="email" required className={input} />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold">Password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => onPassword(event.target.value)}
          autoComplete={newPassword ? "new-password" : "current-password"}
          minLength={newPassword ? 6 : undefined}
          required
          className={input}
        />
        {newPassword ? <span className="mt-1 block text-xs text-mute">At least 6 characters.</span> : null}
      </label>
    </>
  );
}

function SignInStep({ onCreate }: { onCreate: () => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enter = (next: Promise<Account>) => {
    setBusy(true);
    setError(null);
    next
      .then((account) => {
        signIn(account);
        navigate(account.role === "store" ? "/shop" : "/");
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Couldn't sign you in.");
        setBusy(false);
      });
  };

  return (
    <Shell>
      <div className="flex items-center gap-2 font-display text-2xl tracking-[0.14em]">
        <BobaMark /> TeaLink
      </div>
      <h1 className="mt-6 font-display text-4xl leading-tight sm:text-5xl">welcome back</h1>
      <p className="mt-3 text-lg text-mute">Sign in to see your top 3, your stats, and your friends.</p>

      <form
        className="mt-8 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          enter(auth.login(email, password));
        }}
      >
        <Credentials email={email} password={password} onEmail={setEmail} onPassword={setPassword} />
        {error ? <p className="text-sm font-semibold text-[#b33]">{error}</p> : null}
        <button type="submit" disabled={busy || !email || !password} className="w-full rounded-full bg-ink py-3.5 text-lg font-semibold text-foam disabled:opacity-40">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <button type="button" onClick={onCreate} className="mt-4 w-full rounded-full border border-line py-3 font-semibold">
        Create an account
      </button>

      <div className="mt-8 rounded-3xl bg-sage/70 p-4">
        <p className="text-xs tracking-[0.14em] text-mute">demo accounts</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => enter(auth.login(DEMO_ACCOUNTS.customer.email, DEMO_PASSWORD))}
            className="rounded-full bg-foam px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
          >
            Customer: {DEMO_ACCOUNTS.customer.label}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => enter(auth.login(DEMO_ACCOUNTS.store.email, DEMO_PASSWORD))}
            className="rounded-full bg-foam px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
          >
            Shop: {DEMO_ACCOUNTS.store.label}
          </button>
        </div>
      </div>
    </Shell>
  );
}

function StoreStep({ shopId, onBack }: { shopId: string; onBack: () => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Shell>
      <h1 className="font-display text-4xl leading-tight">Create your shop account</h1>
      <p className="mt-3 text-lg text-mute">You'll use this to sign back in to your shop's page.</p>
      <form
        className="mt-8 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          auth
            .signup({ email, password, role: "store", shop_id: shopId })
            .then((account) => {
              signIn(account);
              navigate("/shop");
            })
            .catch((reason: unknown) => {
              setError(reason instanceof Error ? reason.message : "Couldn't create the account.");
              setBusy(false);
            });
        }}
      >
        <Credentials email={email} password={password} onEmail={setEmail} onPassword={setPassword} newPassword />
        {error ? <p className="text-sm font-semibold text-[#b33]">{error}</p> : null}
        <button type="submit" disabled={busy || !email || password.length < 6} className="w-full rounded-full bg-ink py-3.5 text-lg font-semibold text-foam disabled:opacity-40">
          {busy ? "Creating your account…" : "Create shop account"}
        </button>
      </form>
      <button type="button" onClick={onBack} className="mt-4 py-2 text-sm font-semibold text-mute hover:text-ink">
        Pick a different shop
      </button>
    </Shell>
  );
}

function AccountStep({ onReady, onSignIn }: { onReady: (account: Account) => void; onSignIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [edited, setEdited] = useState(false);
  const [emoji, setEmoji] = useState(STARTER_EMOJIS[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shownHandle = edited ? handle : handleFrom(name);
  const color = STARTER_COLORS[STARTER_EMOJIS.indexOf(emoji)] ?? STARTER_COLORS[0];

  const start = () => {
    setBusy(true);
    setError(null);
    social
      .createUser(shownHandle, name.trim())
      .then((profile) => social.patchUser(profile.user_id, { avatar: { emoji, color } }))
      .then((profile) => auth.signup({ email, password, role: "customer", user_id: profile.user_id }))
      .then(onReady)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Couldn't create your account.");
        setBusy(false);
      });
  };

  return (
    <Shell>
      <div className="flex items-center gap-2 font-display text-2xl tracking-[0.14em]">
        <BobaMark /> TeaLink
      </div>
      <h1 className="mt-6 font-display text-4xl leading-tight sm:text-5xl">Find your next favorite boba.</h1>
      <p className="mt-3 text-lg text-mute">
        A short taste quiz, then a team of AI agents argues over what you should order. Every pick teaches them more.
      </p>

      <form
        className="mt-8 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() && shownHandle && email && password.length >= 6) start();
        }}
      >
        <div>
          <p className="mb-2 text-sm font-semibold">Pick an avatar</p>
          <div className="flex flex-wrap gap-2">
            {STARTER_EMOJIS.map((item, index) => (
              <button
                key={item}
                type="button"
                onClick={() => setEmoji(item)}
                aria-pressed={emoji === item}
                aria-label={`Avatar ${item}`}
                className={`rounded-full p-0.5 ${emoji === item ? "ring-2 ring-moss" : ""}`}
              >
                <Avatar avatar={{ emoji: item, color: STARTER_COLORS[index] }} size="md" />
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold">Your name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            autoFocus
            placeholder="Emily"
            className="w-full rounded-2xl border border-line bg-foam px-4 py-3 text-lg outline-none focus:border-moss"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold">Handle</span>
          <span className="flex items-center rounded-2xl border border-line bg-foam px-4 focus-within:border-moss">
            <span className="text-lg text-mute">@</span>
            <input
              value={shownHandle}
              onChange={(event) => {
                setEdited(true);
                setHandle(handleFrom(event.target.value));
              }}
              maxLength={20}
              placeholder="emily"
              className="w-full bg-transparent py-3 pl-1 text-lg outline-none"
            />
          </span>
        </label>
        <Credentials email={email} password={password} onEmail={setEmail} onPassword={setPassword} newPassword />
        {error ? <p className="text-sm font-semibold text-[#b33]">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || !name.trim() || !shownHandle || !email || password.length < 6}
          className="w-full rounded-full bg-ink py-3.5 text-lg font-semibold text-foam disabled:opacity-40"
        >
          {busy ? "Creating your account…" : "Start the quiz"}
        </button>
      </form>

      <button type="button" onClick={onSignIn} className="mt-4 py-2 text-sm font-semibold text-mute hover:text-ink">
        Already have an account? Sign in
      </button>
    </Shell>
  );
}

function QuestionStep({
  question,
  index,
  total,
  chosen,
  onChoose,
  onBack,
  onNext,
}: {
  question: QuizQuestion;
  index: number;
  total: number;
  chosen: string[];
  onChoose: (ids: string[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const toggle = (id: string) => {
    if (question.multi) {
      if (chosen.includes(id)) onChoose(chosen.filter((item) => item !== id));
      else onChoose(id === "none" ? [id] : [...chosen.filter((item) => item !== "none"), id]);
      return;
    }
    onChoose([id]);
    window.setTimeout(onNext, 220);
  };

  return (
    <Shell progress={index / total}>
      <p className="text-sm font-semibold text-moss">
        Question {index + 1} of {total}
      </p>
      <h1 className="mt-2 font-display text-4xl leading-tight">{question.prompt}</h1>
      {question.multi ? <p className="mt-2 text-mute">Pick as many as you like.</p> : null}

      <ul className={`mt-8 grid gap-3 ${question.options.length > 4 ? "grid-cols-2" : ""}`}>
        {question.options.map((option) => {
          const on = chosen.includes(option.id);
          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => toggle(option.id)}
                aria-pressed={on}
                className={`flex w-full items-center gap-4 rounded-3xl border-2 px-5 py-4 text-left text-lg font-semibold transition ${
                  on ? "border-moss bg-mist" : "border-line bg-foam hover:border-ink/30"
                }`}
              >
                {option.emoji ? (
                  <span className="text-3xl" aria-hidden>
                    {option.emoji}
                  </span>
                ) : null}
                {option.label}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto flex items-center justify-between pt-10">
        <button type="button" onClick={onBack} className="rounded-full px-4 py-3 font-semibold text-mute hover:text-ink">
          Back
        </button>
        {question.multi || chosen.length > 0 ? (
          <button type="button" onClick={onNext} className="rounded-full bg-ink px-6 py-3 font-semibold text-foam">
            {index + 1 === total ? "See my results" : question.multi && chosen.length === 0 ? "Skip" : "Next"}
          </button>
        ) : null}
      </div>
    </Shell>
  );
}

function Result({ profile, kind }: { profile: UserProfile; kind: QuizKind }) {
  return (
    <Shell progress={1}>
      <p className="text-center text-sm font-semibold tracking-[0.16em] text-moss lowercase">You're all set</p>
      <h1 className="mt-2 mb-8 text-center font-display text-4xl leading-tight">Meet your boba self</h1>
      <BobaCard
        name={profile.display_name}
        handle={profile.handle}
        avatar={profile.avatar}
        accent={profile.accent}
        stats={profile.stats}
      />
      <p className="mx-auto mt-6 max-w-sm text-center text-mute">
        {kind === "full"
          ? "Your answers and favorite drinks set where the Preference agent starts. Favorites count most."
          : "Your answers set where the Preference agent starts."}{" "}
        From here, every order teaches it more, recent ones most, and so does every rating you give.
      </p>
      <div className="mx-auto mt-6 grid w-full max-w-sm gap-3">
        <Link to="/" className="rounded-full bg-ink py-3.5 text-center text-lg font-semibold text-foam">
          Get my first top 3
        </Link>
        <Link to={`/u/${profile.handle}`} className="rounded-full border border-line py-3 text-center font-semibold">
          See my profile
        </Link>
      </div>
    </Shell>
  );
}

/** First-visit sign-up and taste quiz. Also reached from "Retake quiz" on your own profile. */
export function Welcome() {
  const role = useRole();
  const shopId = useShopId();
  const [retake] = useState(() => isSignedIn() && getRole() === "customer");
  const [kind, setKind] = useState<QuizKind | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [favorites, setFavorites] = useState<FavoritePick[]>([]);
  // Single-choice questions advance on a timer, so finish() must read the latest answers, not a render's copy.
  const latest = useRef<QuizAnswers>({});
  const [step, setStep] = useState<Step>(firstStep);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kind) return;
    let live = true;
    social
      .getQuiz(kind)
      .then((loaded) => live && setQuestions(loaded))
      .catch(() => live && setError(kind === "full" ? "Couldn't load the full quiz. It needs the TeaLink API." : "Couldn't load the quiz."));
    return () => {
      live = false;
    };
  }, [kind]);

  const choose = (chosen: QuizKind) => {
    if (chosen !== kind) {
      setQuestions(null);
      setError(null);
    }
    setKind(chosen);
    setStep({ kind: "question", index: 0 });
  };

  const finish = (shown: QuizQuestion[], quizKind: QuizKind) => {
    setStep({ kind: "saving" });
    setError(null);
    const userId = getMe();
    const ids = new Set(shown.map((question) => question.id));
    const chosen = Object.fromEntries(Object.entries(latest.current).filter(([id]) => ids.has(id)));
    social
      .submitQuiz(
        userId,
        chosen,
        quizKind,
        favorites.filter((group) => group.drink_ids.length > 0),
      )
      .then(() => social.getUser(userId, userId))
      .then((profile) => {
        switchUser();
        profilesChanged();
        setStep({ kind: "result", profile });
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Couldn't save your answers.");
        setStep({ kind: "question", index: shown.length - 1 });
      });
  };

  if (role === "store" && shopId) return <Navigate to="/shop" replace />;

  if (step.kind === "signin") return <SignInStep onCreate={() => setStep({ kind: "role" })} />;

  if (step.kind === "role") {
    return (
      <RoleChoice
        onCustomer={() => setStep({ kind: "account" })}
        onStore={() => setStep({ kind: "shop" })}
        onBack={() => setStep({ kind: "signin" })}
      />
    );
  }

  if (step.kind === "shop") return <ShopPicker onChoose={(id) => setStep({ kind: "store", shopId: id })} />;

  if (step.kind === "store") return <StoreStep shopId={step.shopId} onBack={() => setStep({ kind: "shop" })} />;

  if (step.kind === "account") {
    return (
      <AccountStep
        onSignIn={() => setStep({ kind: "signin" })}
        onReady={(account) => {
          signIn(account);
          setStep({ kind: "choose" });
        }}
      />
    );
  }

  if (step.kind === "choose" || !kind) return <ChooseQuizStep retake={retake} onChoose={choose} />;

  if (step.kind === "result") return <Result profile={step.profile} kind={kind} />;

  if (error && !questions) {
    return (
      <Shell>
        <p className="rounded-3xl border border-line bg-foam p-6">{error}</p>
        <button
          type="button"
          onClick={() => setStep({ kind: "choose" })}
          className="mt-4 self-start rounded-full px-4 py-3 font-semibold text-mute hover:text-ink"
        >
          Back to the quiz choice
        </button>
      </Shell>
    );
  }

  if (!questions || step.kind === "saving") {
    return (
      <Shell progress={step.kind === "saving" ? 1 : 0}>
        <div className="m-auto text-center">
          <BobaMark clinking className="mx-auto h-20 w-24 text-moss" />
          <p className="mt-4 font-display text-2xl">{step.kind === "saving" ? "Steeping your results…" : "Loading the quiz…"}</p>
        </div>
      </Shell>
    );
  }

  const question = questions[step.index];
  const back = () => setStep(step.index === 0 ? { kind: "choose" } : { kind: "question", index: step.index - 1 });
  const next = () => (step.index + 1 < questions.length ? setStep({ kind: "question", index: step.index + 1 }) : finish(questions, kind));
  return (
    <>
      {error ? <p className="mx-auto max-w-xl px-5 pt-4 text-sm font-semibold text-[#b33]">{error}</p> : null}
      {question.kind === "favorites" ? (
        <FavoritesStep
          question={question}
          index={step.index}
          total={questions.length}
          favorites={favorites}
          onChange={setFavorites}
          onBack={back}
          onNext={next}
        />
      ) : (
        <QuestionStep
          key={question.id}
          question={question}
          index={step.index}
          total={questions.length}
          chosen={answers[question.id] ?? []}
          onChoose={(ids) => {
            latest.current = { ...latest.current, [question.id]: ids };
            setAnswers(latest.current);
          }}
          onBack={back}
          onNext={next}
        />
      )}
    </>
  );
}

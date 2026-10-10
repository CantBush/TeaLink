import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { social } from "../api/social.ts";
import type { QuizAnswers, QuizQuestion, UserProfile } from "../api/types.ts";
import { Avatar } from "../components/Avatar.tsx";
import { BobaCard } from "../components/BobaCard.tsx";
import { BobaMark } from "../components/BobaMark.tsx";
import { DEMO_USER, getMe, hasChosenAccount, setMe } from "../state/me.ts";
import { switchUser } from "../state/session.ts";
import { profilesChanged } from "../state/social.ts";

const STARTER_EMOJIS = ["🧋", "🍵", "🐯", "🌸", "🍓", "🐼", "🦊", "🌙"];
const STARTER_COLORS = ["#f3d9b1", "#d8e8c8", "#f6c9c0", "#e3d4f0", "#cfe3ef", "#f9e3a6", "#e8cfc0", "#d5ebe0"];

function handleFrom(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "")
    .slice(0, 20);
}

type Step = { kind: "account" } | { kind: "question"; index: number } | { kind: "saving" } | { kind: "result"; profile: UserProfile };

function Shell({ children, progress }: { children: ReactNode; progress?: number }) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-xl flex-col px-5 py-6 sm:py-10">
      {progress !== undefined ? (
        <div className="mb-8 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
          <div className="h-full rounded-full bg-amber transition-all duration-300" style={{ width: `${progress * 100}%` }} />
        </div>
      ) : null}
      {children}
    </main>
  );
}

function AccountStep({ onReady }: { onReady: (userId: string) => void }) {
  const navigate = useNavigate();
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
      .then((profile) => onReady(profile.user_id))
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Couldn't create your account.");
        setBusy(false);
      });
  };

  const useDemo = () => {
    setMe(DEMO_USER);
    switchUser();
    profilesChanged();
    navigate("/home");
  };

  return (
    <Shell>
      <div className="flex items-center gap-2 font-display text-2xl">
        <BobaMark /> TeaLink
      </div>
      <h1 className="mt-6 font-display text-4xl leading-tight sm:text-5xl">Find your next favorite boba.</h1>
      <p className="mt-3 text-lg text-mute">
        Six quick questions, then a team of AI agents argues over what you should order. Every pick teaches them more.
      </p>

      <form
        className="mt-8 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() && shownHandle) start();
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
                className={`rounded-full p-0.5 ${emoji === item ? "ring-2 ring-amber" : ""}`}
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
            className="w-full rounded-2xl border border-line bg-foam px-4 py-3 text-lg outline-none focus:border-amber"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold">Handle</span>
          <span className="flex items-center rounded-2xl border border-line bg-foam px-4 focus-within:border-amber">
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
        {error ? <p className="text-sm font-semibold text-[#b33]">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || !name.trim() || !shownHandle}
          className="w-full rounded-full bg-ink py-3.5 text-lg font-semibold text-foam disabled:opacity-40"
        >
          {busy ? "Creating your account…" : "Start the quiz"}
        </button>
      </form>

      <button type="button" onClick={useDemo} className="mt-4 py-2 text-sm font-semibold text-mute hover:text-ink">
        Skip and use the demo account (Andrew)
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
      onChoose(chosen.includes(id) ? chosen.filter((item) => item !== id) : [...chosen, id]);
      return;
    }
    onChoose([id]);
    window.setTimeout(onNext, 220);
  };

  return (
    <Shell progress={index / total}>
      <p className="text-sm font-semibold text-amber">
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
                  on ? "border-amber bg-[#fbf1e3]" : "border-line bg-foam hover:border-ink/30"
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

function Result({ profile }: { profile: UserProfile }) {
  return (
    <Shell progress={1}>
      <p className="text-center text-sm font-semibold tracking-[0.16em] text-amber uppercase">You're all set</p>
      <h1 className="mt-2 mb-8 text-center font-display text-4xl leading-tight">Meet your boba self</h1>
      <BobaCard
        name={profile.display_name}
        handle={profile.handle}
        avatar={profile.avatar}
        accent={profile.accent}
        stats={profile.stats}
      />
      <p className="mx-auto mt-6 max-w-sm text-center text-mute">
        Your answers set where the Preference agent starts. From here, every drink you pick teaches it more.
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
  const retake = hasChosenAccount() && getMe() !== DEMO_USER;
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  // Single-choice questions advance on a timer, so finish() must read the latest answers, not a render's copy.
  const latest = useRef<QuizAnswers>({});
  const [step, setStep] = useState<Step>(retake ? { kind: "question", index: 0 } : { kind: "account" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    social
      .getQuiz()
      .then(setQuestions)
      .catch(() => setError("Couldn't load the quiz."));
  }, []);

  const finish = () => {
    setStep({ kind: "saving" });
    const userId = getMe();
    social
      .submitQuiz(userId, latest.current)
      .then(() => social.getUser(userId, userId))
      .then((profile) => {
        switchUser();
        profilesChanged();
        setStep({ kind: "result", profile });
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Couldn't save your answers.");
        setStep({ kind: "question", index: (questions?.length ?? 1) - 1 });
      });
  };

  if (error && !questions) {
    return (
      <Shell>
        <p className="rounded-3xl border border-line bg-foam p-6">{error}</p>
      </Shell>
    );
  }

  if (step.kind === "account") {
    return (
      <AccountStep
        onReady={(userId) => {
          setMe(userId);
          profilesChanged();
          setStep({ kind: "question", index: 0 });
        }}
      />
    );
  }

  if (step.kind === "result") return <Result profile={step.profile} />;

  if (!questions || step.kind === "saving") {
    return (
      <Shell progress={step.kind === "saving" ? 1 : 0}>
        <div className="m-auto text-center">
          <p className="animate-bounce text-6xl" aria-hidden>
            🧋
          </p>
          <p className="mt-4 font-display text-2xl">{step.kind === "saving" ? "Steeping your results…" : "Loading the quiz…"}</p>
        </div>
      </Shell>
    );
  }

  const question = questions[step.index];
  return (
    <>
      {error ? <p className="mx-auto max-w-xl px-5 pt-4 text-sm font-semibold text-[#b33]">{error}</p> : null}
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
        onBack={() => setStep(step.index === 0 ? (retake ? step : { kind: "account" }) : { kind: "question", index: step.index - 1 })}
        onNext={() => (step.index + 1 < questions.length ? setStep({ kind: "question", index: step.index + 1 }) : finish())}
      />
    </>
  );
}

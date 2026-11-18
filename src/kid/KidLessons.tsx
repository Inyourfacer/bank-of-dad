import { useMemo, useState, useSyncExternalStore } from "react";
import { useApp } from "../data/AppContext";
import type { Kid } from "../data/types";
import { useAccounts } from "../data/useAccounts";
import { LESSONS, type Lesson, type LessonContext, hasRateChange, rateAnnouncements } from "../lessons/lessons";
import { formatDay, formatPercent } from "../lib/format";

/** The kid's facts that decide which lessons are unlocked. */
function useLessonContext(kid: Kid): LessonContext | null {
  const { data, today } = useApp();
  const accounts = useAccounts();
  return useMemo(() => {
    const account = accounts.get(kid.id);
    if (!data || !account) return null;
    const rates = data.rates.filter((r) => r.kid_id === kid.id);
    const current = [...rates].filter((r) => r.effective_from <= today).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
    const paydays = account.activity.filter((a) => a.kind === "interest").sort((a, b) => a.date.localeCompare(b.date));
    const stubs = data.payStatements.filter((s) => s.kid_id === kid.id);
    const latest = stubs[0];
    return {
      name: kid.name,
      today,
      rate: Number(current?.monthly_rate ?? kid.ongoing_monthly_rate),
      paydays: paydays.length,
      interestPaidCents: account.interestPaidCents,
      firstPaydayCents: paydays[0]?.amountCents ?? null,
      hasPayStub: stubs.length > 0,
      taxCents: latest ? latest.taxes.reduce((s, l) => s + l.cents, 0) : 0,
      billsCents: latest ? latest.expenses.reduce((s, l) => s + l.cents, 0) : 0,
      hasJarMoney: data.jarEntries.some((j) => j.kid_id === kid.id),
      hasGoal: data.goals.some((g) => g.kid_id === kid.id),
      hasCd: data.cds.some((c) => c.kid_id === kid.id),
      hasLoan: data.loans.some((l) => l.kid_id === kid.id),
      rateChanged: hasRateChange(rates, kid.account_opened_on, today),
    };
  }, [data, accounts, kid, today]);
}

/** Which lessons each kid has opened on this device (a convenience, not saved anywhere else). */
const readStore = new Map<string, string[]>();
const readListeners = new Set<() => void>();
const storageKey = (kidId: string) => `bank-of-dad-lessons-read:${kidId}`;

function readFor(kidId: string): string[] {
  if (!readStore.has(kidId)) {
    let list: string[] = [];
    try {
      list = JSON.parse(localStorage.getItem(storageKey(kidId)) ?? "[]") as string[];
    } catch {
      /* storage unavailable */
    }
    readStore.set(kidId, list);
  }
  return readStore.get(kidId)!;
}

function useReadLessons(kidId: string) {
  const read = useSyncExternalStore(
    (cb) => {
      readListeners.add(cb);
      return () => readListeners.delete(cb);
    },
    () => readFor(kidId),
  );
  const markRead = (id: string) => {
    if (read.includes(id)) return;
    const next = [...read, id];
    readStore.set(kidId, next);
    try {
      localStorage.setItem(storageKey(kidId), JSON.stringify(next));
    } catch {
      /* storage unavailable: it just won't be remembered */
    }
    readListeners.forEach((l) => l());
  };
  return { read, markRead };
}

/** "📣 Rates are changing" for upcoming and recent rate changes. */
export function RateAnnouncement({ kid }: { kid: Kid }) {
  const { data, today } = useApp();
  if (!data) return null;
  const items = rateAnnouncements(
    data.rates.filter((r) => r.kid_id === kid.id),
    kid.account_opened_on,
    today,
  );
  if (items.length === 0) return null;
  return (
    <>
      {items.map(({ rate, fromRate, upcoming }) => {
        const to = Number(rate.monthly_rate);
        const direction = to > fromRate ? "goes up" : to < fromRate ? "goes down" : "stays";
        return (
          <div className="announcement" role="status" key={rate.id}>
            <span className="big-emoji" aria-hidden="true">
              📣
            </span>
            <div>
              <h2 className="panel-title">{upcoming ? "Your interest rate is changing" : "Your interest rate just changed"}</h2>
              <p>
                {upcoming ? `On ${formatDay(rate.effective_from, true)}` : `Since ${formatDay(rate.effective_from, true)}`}, your rate{" "}
                {direction === "stays" ? "stays at" : `${upcoming ? direction : direction === "goes up" ? "went up" : "went down"} from ${formatPercent(fromRate)} to`}{" "}
                <strong>{formatPercent(to)} a month</strong>.
              </p>
              {rate.message && <p className="announcement-msg">“{rate.message}”</p>}
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Banner for lessons unlocked but not opened yet. */
export function NewLessonBanner({ kid, onOpen }: { kid: Kid; onOpen: () => void }) {
  const ctx = useLessonContext(kid);
  const { read } = useReadLessons(kid.id);
  if (!ctx) return null;
  const fresh = LESSONS.filter((l) => l.unlocked(ctx) && !read.includes(l.id));
  if (fresh.length === 0) return null;
  return (
    <button type="button" className="new-lesson" onClick={onOpen}>
      <span aria-hidden="true">📚</span>
      <span>
        <strong>New lesson unlocked:</strong> {fresh[0].emoji} {fresh[0].title}
        {fresh.length > 1 ? ` (+${fresh.length - 1} more)` : ""}
      </span>
      <span className="new-lesson-go">Read it →</span>
    </button>
  );
}

/** All lessons: unlocked ones open in place, locked ones say how to unlock them. */
export function KidLessons({ kid, id = "lessons" }: { kid: Kid; id?: string }) {
  const ctx = useLessonContext(kid);
  const { read, markRead } = useReadLessons(kid.id);
  const [open, setOpen] = useState<string | null>(null);
  if (!ctx) return null;
  const unlockedCount = LESSONS.filter((l) => l.unlocked(ctx)).length;

  const toggle = (l: Lesson) => {
    setOpen(open === l.id ? null : l.id);
    markRead(l.id);
  };

  return (
    <section className="panel stack" aria-labelledby={`${id}-title`} id={id}>
      <div className="section-head">
        <h2 className="panel-title" id={`${id}-title`}>
          Money lessons
        </h2>
        <span className="hint">
          {unlockedCount} of {LESSONS.length} unlocked
        </span>
      </div>
      <ul className="lessons">
        {LESSONS.map((l) => {
          const unlocked = l.unlocked(ctx);
          const isOpen = open === l.id;
          return (
            <li key={l.id} className={`lesson${unlocked ? "" : " locked"}${isOpen ? " open" : ""}`}>
              {unlocked ? (
                <button type="button" className="lesson-head" aria-expanded={isOpen} onClick={() => toggle(l)}>
                  <span className="lesson-emoji" aria-hidden="true">
                    {l.emoji}
                  </span>
                  <span className="lesson-title">{l.title}</span>
                  {!read.includes(l.id) && <span className="chip chip-warn">New</span>}
                </button>
              ) : (
                <div className="lesson-head">
                  <span className="lesson-emoji" aria-hidden="true">
                    🔒
                  </span>
                  <span className="lesson-title">
                    {l.title}
                    <span className="hint"> · {l.unlockHint}</span>
                  </span>
                </div>
              )}
              {unlocked && isOpen && (
                <div className="lesson-body">
                  {l.body(ctx).map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Short lessons that unlock when something happens to the kid, using the
 * kid's own numbers. Pure: the screens build a LessonContext and render.
 */

import type { ISODate } from "../engine/dates";
import { addDays } from "../engine/dates";
import { annualFromMonthlyRate, monthsToDouble } from "../engine/interest";
import type { RatePeriodRow } from "../data/types";

export interface LessonContext {
  name: string;
  today: ISODate;
  /** Current monthly rate (fraction). */
  rate: number;
  paydays: number;
  interestPaidCents: number;
  firstPaydayCents: number | null;
  hasPayStub: boolean;
  taxCents: number;
  billsCents: number;
  hasJarMoney: boolean;
  hasGoal: boolean;
  hasCd: boolean;
  hasLoan: boolean;
  /** A rate change has happened or been announced. */
  rateChanged: boolean;
}

export interface Lesson {
  id: string;
  emoji: string;
  title: string;
  /** Shown while locked. */
  unlockHint: string;
  unlocked: (c: LessonContext) => boolean;
  /** Paragraphs, using the kid's numbers. */
  body: (c: LessonContext) => string[];
}

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const pct = (f: number, digits = 1) => `${+(f * 100).toFixed(digits)}%`;

export const LESSONS: Lesson[] = [
  {
    id: "interest",
    emoji: "💰",
    title: "What is interest?",
    unlockHint: "Unlocks on your first Payday.",
    unlocked: (c) => c.paydays >= 1,
    body: (c) => [
      "Interest is money a bank pays you for keeping your money there. The bank gets to use it, so it pays you a little extra.",
      c.firstPaydayCents !== null
        ? `On your first Payday the Bank of Dad paid you ${usd(c.firstPaydayCents)}. You didn't have to do any chores for it!`
        : "Every month the Bank of Dad pays you interest on your savings.",
      `Your rate is ${pct(c.rate)} a month. That's ${pct(c.rate)} of your savings added every month, just for saving.`,
    ],
  },
  {
    id: "compound",
    emoji: "🌱",
    title: "Interest on interest",
    unlockHint: "Unlocks after 3 Paydays.",
    unlocked: (c) => c.paydays >= 3,
    body: (c) => {
      const months = 60;
      const simple = Math.round(10000 * (1 + c.rate * months));
      const compound = Math.round(10000 * Math.pow(1 + c.rate, months));
      return [
        "Last month's interest is now part of your savings, so this month it earns interest too. That's called compounding, and it snowballs.",
        `Say you leave $100 for 5 years at ${pct(c.rate)} a month. If only the $100 earned interest, you'd have ${usd(simple)}. With interest on interest, you'd have ${usd(compound)}.`,
        `That extra ${usd(compound - simple)} is your interest's interest. The longer you wait, the bigger the snowball.`,
      ];
    },
  },
  {
    id: "rule-of-72",
    emoji: "⏱️",
    title: "The Rule of 72",
    unlockHint: "Unlocks when you've earned $1 of interest.",
    unlocked: (c) => c.interestPaidCents >= 100,
    body: (c) => {
      const yearly = annualFromMonthlyRate(c.rate) * 100;
      const guess = yearly > 0 ? 72 / yearly : Infinity;
      const exact = monthsToDouble(c.rate) / 12;
      return [
        "Want to know how long it takes your money to double? Divide 72 by the yearly interest rate.",
        yearly > 0
          ? `Your rate is about ${yearly.toFixed(1)}% a year. 72 ÷ ${yearly.toFixed(1)} ≈ ${guess.toFixed(1)} years. (The exact answer is ${exact.toFixed(1)} years. Close!)`
          : "At 0% your money never doubles. Interest is what makes it grow.",
        "A regular bank paying 0.5% a year would take 144 years to double your money. That's why the Bank of Dad's rate is a big deal.",
      ];
    },
  },
  {
    id: "taxes",
    emoji: "🏛️",
    title: "Why do we pay taxes?",
    unlockHint: "Unlocks on your first pay stub.",
    unlocked: (c) => c.hasPayStub,
    body: (c) => [
      `On your pay stub, ${usd(c.taxCents)} went to taxes. Everyone who earns money pays some.`,
      "Taxes pay for things we all share: roads, schools, parks, firefighters and libraries.",
      "Notice the brackets: the first part of your pay is taxed at a low rate, and only the part above each line is taxed higher. Earning more never means keeping less.",
    ],
  },
  {
    id: "needs-wants",
    emoji: "🛒",
    title: "Needs and wants",
    unlockHint: "Unlocks on your first pay stub.",
    unlocked: (c) => c.hasPayStub,
    body: (c) => [
      `Your bills took ${usd(c.billsCents)}. Rent, groceries, utilities and insurance are needs: things you must pay for to live.`,
      "Wants are things that are nice to have, like toys, games and treats. They come out of what's left after needs.",
      "Grown-ups pay needs first. That's why the take-home part of your pay is small. Spending it wisely matters!",
    ],
  },
  {
    id: "jars",
    emoji: "🫙",
    title: "Save, spend, give",
    unlockHint: "Unlocks when money lands in your Spend or Give jar.",
    unlocked: (c) => c.hasJarMoney,
    body: () => [
      "Splitting your money into jars helps you plan: Save for later, Spend for now, Give to help others.",
      "Only Savings earns interest. Money in the Spend jar stays the same size. Moving some to Savings means it starts growing.",
      "Giving feels good too: a food bank, a friend's fundraiser, or a gift for someone you love.",
    ],
  },
  {
    id: "goals",
    emoji: "🎯",
    title: "Saving for something",
    unlockHint: "Unlocks when you set a goal.",
    unlocked: (c) => c.hasGoal,
    body: () => [
      "A goal turns 'someday' into a date. Your goal shows when you'll get there if you keep saving.",
      "Every time you take money out, the date moves further away. Every extra bit you save pulls it closer, and interest helps too.",
    ],
  },
  {
    id: "cds",
    emoji: "🔒",
    title: "Why lock money up?",
    unlockHint: "Unlocks when you open a CD.",
    unlocked: (c) => c.hasCd,
    body: () => [
      "A CD (certificate of deposit) is a deal: you promise not to touch your money for a while, and the bank pays you more for it.",
      "Banks like money they can count on, so they reward patience. Break the promise early and you lose the bonus.",
      "Real banks have CDs too. Grown-ups use them for money they won't need for a while.",
    ],
  },
  {
    id: "loans",
    emoji: "💸",
    title: "When interest works against you",
    unlockHint: "Unlocks when you ask to borrow.",
    unlocked: (c) => c.hasLoan,
    body: () => [
      "When you save, interest makes your money grow. When you borrow, the same compounding makes what you owe grow.",
      "Paying only a little each month is a trap: if your payment doesn't cover the interest, the loan never goes away.",
      "Credit cards work this way, often at around 2% a month. The best plan is to borrow rarely and pay it back fast.",
    ],
  },
  {
    id: "rates-move",
    emoji: "📣",
    title: "Rates change",
    unlockHint: "Unlocks when your interest rate changes.",
    unlocked: (c) => c.rateChanged,
    body: (c) => [
      `Interest rates aren't set forever. Banks raise and lower them, and so does the Bank of Dad. Your rate right now is ${pct(c.rate)} a month.`,
      "When rates go up, saving pays more. When they go down, it pays less, but saving still beats not saving.",
    ],
  },
];

/** Whether the kid has had a rate change (after the opening schedule) or one is announced. */
export function hasRateChange(rates: RatePeriodRow[], openedOn: ISODate | null, today: ISODate): boolean {
  if (!openedOn) return false;
  return rates.some((r) => r.message || (r.effective_from > openedOn && r.effective_from <= today));
}

export interface Announcement {
  rate: RatePeriodRow;
  fromRate: number;
  upcoming: boolean;
}

/**
 * Rate changes a kid should hear about: scheduled ones with a message or a
 * different rate, shown until two weeks after they start.
 */
export function rateAnnouncements(rates: RatePeriodRow[], openedOn: ISODate | null, today: ISODate): Announcement[] {
  if (!openedOn) return [];
  const sorted = [...rates].sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  const out: Announcement[] = [];
  sorted.forEach((r, i) => {
    if (i === 0 || r.effective_from <= openedOn) return;
    const prev = sorted[i - 1];
    const recent = r.effective_from <= today && addDays(r.effective_from, 14) >= today;
    const upcoming = r.effective_from > today;
    if ((upcoming || recent) && (r.message || Number(r.monthly_rate) !== Number(prev.monthly_rate))) {
      out.push({ rate: r, fromRate: Number(prev.monthly_rate), upcoming });
    }
  });
  return out;
}

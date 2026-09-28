import { subjectsOf, TIMETABLE_PRIORITY } from '../data/standards';
import { annual, semesterHours } from './hours';
import type { GradeNo, Pair, Project, Weekly } from './types';

const round1 = (n: number) => Math.round(n * 10) / 10;
const EPS = 0.05;

export interface WeeklyRow {
  readonly subject: string;
  readonly hours: Pair;
  /** 주당 × 주수 */
  readonly operated: number;
  /** 편제 연간 시수 */
  readonly planned: number;
  readonly diff: number;
}

export interface WeeklyStats {
  readonly rows: readonly WeeklyRow[];
  /** [1학기 주당 합계, 2학기 주당 합계] */
  readonly weeklySum: Pair;
  /** 요일별 교시 합계 */
  readonly slots: number;
  /** 주당 합계와 교시 수가 두 학기 모두 같은지 */
  readonly slotsMatch: boolean;
}

export function weeklyStats(p: Project, g: GradeNo): WeeklyStats {
  const w = p.weekly[g];
  const rows = subjectsOf(g).map((subject) => {
    const hours = w.hours[subject] ?? ([0, 0] as const);
    const operated = round1(hours[0] * w.weeks[0] + hours[1] * w.weeks[1]);
    const planned = annual(p, g, subject);
    return { subject, hours, operated, planned, diff: round1(operated - planned) };
  });
  const weeklySum: Pair = [round1(rows.reduce((a, r) => a + r.hours[0], 0)), round1(rows.reduce((a, r) => a + r.hours[1], 0))];
  const slots = w.perDay.reduce((a, b) => a + b, 0);
  return {
    rows,
    weeklySum,
    slots,
    slotsMatch: Math.abs(weeklySum[0] - slots) < EPS && Math.abs(weeklySum[1] - slots) < EPS,
  };
}

const priority = (s: string) => {
  const i = TIMETABLE_PRIORITY.indexOf(s);
  return i < 0 ? TIMETABLE_PRIORITY.length : i;
};

/**
 * 학기 시수를 주당 0.5시간 단위로 나눈다. 합계가 주당 교시 수(slots)와 같아지도록
 * 먼저 내림한 뒤, 모자란 0.5시간은 나머지가 큰 교과부터, 넘치면 나머지가 작은 교과부터 조정한다.
 */
export function distributeWeekly(semesterPlan: Readonly<Record<string, number>>, weeks: number, slots: number): Record<string, number> {
  const subjects = Object.keys(semesterPlan);
  if (weeks <= 0) return Object.fromEntries(subjects.map((s) => [s, 0]));
  const items = subjects.map((s) => {
    const units = ((semesterPlan[s] ?? 0) / weeks) * 2;
    const base = Math.floor(units + 1e-9);
    return { s, units: base, frac: units - base };
  });
  let remain = Math.round(slots * 2) - items.reduce((a, x) => a + x.units, 0);
  // 그 학기에 편성이 없는 교과에는 시간을 주지 않는다
  const adjustable = items.filter((x) => (semesterPlan[x.s] ?? 0) > 0);
  const byFrac = [...adjustable].sort((a, b) => (remain > 0 ? b.frac - a.frac : a.frac - b.frac) || priority(a.s) - priority(b.s));
  for (let guard = 0; remain !== 0 && guard < 1000; guard++) {
    const target = byFrac[guard % byFrac.length];
    if (!target) break;
    if (remain > 0) {
      target.units++;
      remain--;
    } else if (target.units > 0) {
      target.units--;
      remain++;
    }
  }
  return Object.fromEntries(items.map((x) => [x.s, x.units / 2]));
}

/** 편제 시수를 학기 주수로 나눠 주당 시수를 정한다 */
export function hoursFromPlan(p: Project, g: GradeNo, weekly: Weekly = p.weekly[g]): Record<string, Pair> {
  const slots = weekly.perDay.reduce((a, b) => a + b, 0);
  const plan = (sem: 0 | 1) => Object.fromEntries(subjectsOf(g).map((s) => [s, semesterHours(p, g, s, sem)]));
  const first = distributeWeekly(plan(0), weekly.weeks[0], slots);
  const second = distributeWeekly(plan(1), weekly.weeks[1], slots);
  return Object.fromEntries(subjectsOf(g).map((s) => [s, [first[s] ?? 0, second[s] ?? 0] as const]));
}

/**
 * 1학기 주당 시수를 요일별 교시에 배치한 예시 시간표.
 * 남은 칸이 많은 요일에, 같은 교과가 한 요일에 몰리지 않게 넣고, 요일 안에서는 주요 교과를 앞 교시에 둔다.
 * 0.5시간(격주) 교과는 먼저 내림해서 넣고, 남는 칸을 격주 교과에 한 칸씩 준다(두 교과가 한 칸을 격주로 나눠 쓴다).
 */
export function autoGrid(g: GradeNo, weekly: Weekly): string[][] {
  const cap = weekly.perDay.map((n) => Math.max(0, Math.floor(n)));
  const grid: string[][] = cap.map(() => []);
  const hoursOf = (s: string) => weekly.hours[s]?.[0] ?? 0;
  const items = subjectsOf(g)
    .map((s) => ({ s, h: Math.floor(hoursOf(s)) }))
    .filter((x) => x.h > 0)
    .sort((a, b) => b.h - a.h || priority(a.s) - priority(b.s));
  const halves = subjectsOf(g).filter((s) => hoursOf(s) % 1 !== 0).sort((a, b) => priority(a) - priority(b));
  for (const s of halves) items.push({ s, h: 1 });
  for (const it of items) {
    for (let k = 0; k < it.h; k++) {
      let best = -1;
      let bestScore = -Infinity;
      for (let d = 0; d < grid.length; d++) {
        const day = grid[d] ?? [];
        const room = (cap[d] ?? 0) - day.length;
        if (room <= 0) continue;
        const same = day.filter((x) => x === it.s).length;
        const score = room * 10 - same * 25 - d * 0.1;
        if (score > bestScore) {
          bestScore = score;
          best = d;
        }
      }
      if (best < 0) break;
      grid[best]?.push(it.s);
    }
  }
  return grid.map((day) => [...day].sort((a, b) => priority(a) - priority(b)));
}

export interface GridCheck {
  readonly empty: number;
  /** 시간표 칸 수와 1학기 주당 시수가 다른 교과 */
  readonly mismatches: readonly { subject: string; have: number; want: number }[];
  /** 주당 0.5시간이 있어 한 칸을 격주로 나눠 쓰는 교과 */
  readonly alternating: readonly string[];
}

export function gridCheck(g: GradeNo, weekly: Weekly): GridCheck {
  // 교시 수를 줄여 가려진 칸은 세지 않는다
  const grid = weekly.perDay.map((n, i) => (weekly.grid?.[i] ?? []).slice(0, n));
  const count = new Map<string, number>();
  for (const day of grid) for (const s of day) if (s) count.set(s, (count.get(s) ?? 0) + 1);
  const rows = subjectsOf(g).map((subject) => ({ subject, have: count.get(subject) ?? 0, want: weekly.hours[subject]?.[0] ?? 0 }));
  // 0.5 단위 교과는 내림·올림 어느 쪽이어도 격주로 맞출 수 있다
  const fits = (x: { have: number; want: number }) => (x.want % 1 === 0 ? x.have === x.want : x.have === Math.floor(x.want) || x.have === Math.ceil(x.want));
  const mismatches = rows.filter((x) => !fits(x));
  const alternating = rows.filter((x) => x.want % 1 !== 0 && fits(x)).map((x) => x.subject);
  const empty = weekly.perDay.reduce((a, n, i) => a + Math.max(0, n - (grid[i] ?? []).filter(Boolean).length), 0);
  return { empty, mismatches, alternating };
}

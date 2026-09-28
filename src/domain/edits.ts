/* 프로젝트를 고치는 순수 함수들. 항상 새 객체를 돌려주고 원본은 바꾸지 않는다. */
import { STANDARDS, subjectsOf } from '../data/standards';
import { defaultCalendar } from './calendar';
import { isIsoDate } from './dates';
import { annual } from './hours';
import { defaultAlloc, num, splitHalf } from './project';
import type { Rules } from './rules';
import { autoGrid, hoursFromPlan } from './weekly';
import type { Autonomy, Calendar, GradeGroupKey, GradeNo, Pair, Project, Weekly } from './types';

type Edit = (p: Project) => Project;

const setPair = (pr: Pair, i: 0 | 1, v: number): Pair => (i === 0 ? [v, pr[1]] : [pr[0], v]);

const withGrade = <T>(rec: Readonly<Record<GradeNo, T>>, g: GradeNo, v: T): Readonly<Record<GradeNo, T>> => ({ ...rec, [g]: v });

/* ───── 편제표 ───── */

export const setAlloc = (g: GradeNo, subject: string, sem: 0 | 1, value: number): Edit => (p) => {
  const cur = p.alloc[g][subject] ?? [0, 0];
  return { ...p, alloc: withGrade(p.alloc, g, { ...p.alloc[g], [subject]: setPair(cur, sem, num(value)) }) };
};

/** 학년군의 모든 교과를 연간 시수는 그대로 두고 두 학기로 똑같이 나눈다 */
export const splitEvenly = (gk: GradeGroupKey): Edit => (p) => {
  let alloc = p.alloc;
  for (const g of STANDARDS[gk].grades) {
    alloc = withGrade(alloc, g, Object.fromEntries(subjectsOf(g).map((s) => [s, splitHalf(annual(p, g, s))])));
  }
  return { ...p, alloc };
};

export const resetToStandard = (gk: GradeGroupKey): Edit => (p) => {
  let alloc = p.alloc;
  for (const g of STANDARDS[gk].grades) alloc = withGrade(alloc, g, defaultAlloc(g));
  return { ...p, alloc };
};

/* ───── 창체·필수 시수·학교자율시간 ───── */

export const setCcaArea = (g: GradeNo, area: 0 | 1 | 2, value: number): Edit => (p) => {
  const next = [...p.cca[g]] as [number, number, number];
  next[area] = num(value);
  return { ...p, cca: withGrade(p.cca, g, next) };
};

export const setSafety = (g: 1 | 2, value: number): Edit => (p) => ({ ...p, safety: { ...p.safety, [g]: num(value) } });
export const setInfo = (g: 5 | 6, value: number): Edit => (p) => ({ ...p, info: { ...p.info, [g]: num(value) } });
export const setAdapt = (value: number): Edit => (p) => ({ ...p, adapt: num(value) });

export const setAutonomy = (g: 3 | 4 | 5 | 6, patch: Partial<Autonomy>): Edit => (p) => {
  const cur = p.autonomy[g];
  const next: Autonomy = {
    hours: patch.hours === undefined ? cur.hours : num(patch.hours),
    name: patch.name === undefined ? cur.name : patch.name.slice(0, 40),
    semester: patch.semester ?? cur.semester,
  };
  return { ...p, autonomy: { ...p.autonomy, [g]: next } };
};

/* ───── 설정 ───── */

export const setInfoFields = (patch: { school?: string; name?: string; minutes?: number }): Edit => (p) => ({
  ...p,
  school: patch.school === undefined ? p.school : patch.school.slice(0, 80),
  name: patch.name === undefined ? p.name : patch.name.slice(0, 80) || p.name,
  minutes: patch.minutes === undefined ? p.minutes : num(patch.minutes, p.minutes, 1, 60) || p.minutes,
});

export const setClasses = (g: GradeNo, value: number): Edit => (p) => ({ ...p, classes: withGrade(p.classes, g, num(value, 0, 1, 99)) });

/** 학년도를 바꾸면 학사일정도 새 학년도 기본값으로 바꾼다 (공휴일·방학 날짜가 달라지므로) */
export const changeYear = (year: number): Edit => (p) =>
  p.year === year ? p : { ...p, year, calendar: defaultCalendar(year), name: p.name.replace(String(p.year), String(year)) };

/* ───── 학사일정 ───── */

const withCal = (p: Project, c: Partial<Calendar>): Project => ({ ...p, calendar: { ...p.calendar, ...c } });

export const setTermDate = (key: 's1s' | 's1e' | 's2s' | 's2e' | 's3s' | 's3e', value: string): Edit => (p) => {
  const optional = key === 's3s' || key === 's3e';
  if (!isIsoDate(value) && !(optional && value === '')) return p;
  return withCal(p, { [key]: value });
};

/** 달력에서 평일을 눌러 재량휴업일을 넣거나 뺀다 */
export const toggleDiscretionary = (date: string, name = '재량휴업일'): Edit => (p) => {
  const has = p.calendar.disc.some((x) => x.date === date);
  return withCal(p, { disc: has ? p.calendar.disc.filter((x) => x.date !== date) : [...p.calendar.disc, { date, name }] });
};

export const addDiscretionary = (date: string, name: string): Edit => (p) =>
  !isIsoDate(date) || p.calendar.disc.some((x) => x.date === date)
    ? p
    : withCal(p, { disc: [...p.calendar.disc, { date, name: name.trim().slice(0, 40) || '재량휴업일' }] });

export const removeDiscretionary = (date: string): Edit => (p) => withCal(p, { disc: p.calendar.disc.filter((x) => x.date !== date) });

export const addExtraHoliday = (date: string, name: string): Edit => (p) =>
  !isIsoDate(date) || p.calendar.extra.some((x) => x.date === date)
    ? p
    : withCal(p, { extra: [...p.calendar.extra, { date, name: name.trim().slice(0, 40) || '임시공휴일' }] });

export const removeExtraHoliday = (date: string): Edit => (p) => withCal(p, { extra: p.calendar.extra.filter((x) => x.date !== date) });

/** 법정공휴일을 이 학교에 해당 없음으로 빼거나 되돌린다 */
export const toggleHoliday = (date: string): Edit => (p) => {
  const ex = p.calendar.excluded;
  return withCal(p, { excluded: ex.includes(date) ? ex.filter((d) => d !== date) : [...ex, date] });
};

/* ───── 주간 시수 ───── */

const withWeekly = (p: Project, g: GradeNo, fn: (w: Weekly) => Weekly): Project => ({ ...p, weekly: withGrade(p.weekly, g, fn(p.weekly[g])) });

export const setPerDay = (g: GradeNo, day: number, value: number): Edit => (p) =>
  withWeekly(p, g, (w) => ({ ...w, perDay: w.perDay.map((x, i) => (i === day ? num(value, x, 1, 12) : x)) }));

export const setWeeks = (g: GradeNo, sem: 0 | 1, value: number): Edit => (p) =>
  withWeekly(p, g, (w) => ({ ...w, weeks: setPair(w.weeks, sem, num(value, w.weeks[sem], 0.5, 30)) }));

export const setWeeklyHours = (g: GradeNo, subject: string, sem: 0 | 1, value: number): Edit => (p) =>
  withWeekly(p, g, (w) => ({ ...w, hours: { ...w.hours, [subject]: setPair(w.hours[subject] ?? [0, 0], sem, num(value, 0, 0.5, 40)) } }));

/** 편제 시수 ÷ 주수로 주당 시수를 다시 정하고 시간표도 다시 배치한다 */
export const weeklyFromPlan = (g: GradeNo): Edit => (p) =>
  withWeekly(p, g, (w) => {
    const next = { ...w, hours: hoursFromPlan(p, g, w) };
    return { ...next, grid: autoGrid(g, next) };
  });

/** 학사일정의 학기 주수를 모든 학년에 넣는다 (0.5주 단위로 반올림) */
export const weeksForAllGrades = (weeks: Pair): Edit => (p) => {
  const w: Pair = [num(weeks[0], 0, 0.5, 30), num(weeks[1], 0, 0.5, 30)];
  let next = p;
  for (const g of [1, 2, 3, 4, 5, 6] as const) next = withWeekly(next, g, (x) => ({ ...x, weeks: w }));
  return next;
};

/* ───── 기준 ───── */

export const setRules = (fn: (r: Rules) => Rules): Edit => (p) => {
  const rules = fn(p.rules);
  return rules === p.rules ? p : { ...p, rules };
};

export const rebuildGrid = (g: GradeNo): Edit => (p) => withWeekly(p, g, (w) => ({ ...w, grid: autoGrid(g, w) }));

export const setGridCell = (g: GradeNo, day: number, period: number, subject: string): Edit => (p) =>
  withWeekly(p, g, (w) => {
    const grid = (w.grid ?? w.perDay.map(() => [])).map((d, i) => {
      if (i !== day) return d;
      const next = [...d];
      while (next.length <= period) next.push('');
      next[period] = subject;
      return next;
    });
    return { ...w, grid };
  });

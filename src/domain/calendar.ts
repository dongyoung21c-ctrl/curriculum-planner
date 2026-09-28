import { HOLIDAYS, HOLIDAY_YEARS } from '../data/holidays';
import { eachDay, inSchoolYear, isIsoDate, parseIso, toIso } from './dates';
import type { Calendar, NamedDate, Project } from './types';

export type DayType = 'school' | 'holiday' | 'discretionary' | 'weekend' | 'vacation';

export interface TermStat {
  readonly name: string;
  readonly start: string;
  readonly end: string;
  readonly days: number;
  /** 수업일수 ÷ 5 (소수 첫째 자리) */
  readonly weeks: number;
}

export interface CalendarStats {
  readonly terms: readonly TermStat[];
  readonly total: number;
  readonly weeks: number;
  readonly holidays: ReadonlyMap<string, string>;
  /** 학기 안의 날짜별 구분. 학기 밖 평일은 방학 */
  readonly dayType: (date: string) => { type: DayType; name?: string };
  /** 학기 날짜가 거꾸로 되었거나 겹치는 문제 */
  readonly problems: readonly string[];
  /** 학기 중 평일에 실제로 쉬는 날 수 (주말·방학에 걸린 공휴일은 빼고 센다) */
  readonly closed: { readonly holiday: number; readonly discretionary: number };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 학년도에 해당하는 공휴일: 내장 법정공휴일 − 뺀 날 + 직접 추가한 날 */
export function holidayMap(p: Project): Map<string, string> {
  const excluded = new Set(p.calendar.excluded);
  const m = new Map<string, string>();
  for (const [date, name] of Object.entries(HOLIDAYS)) {
    if (inSchoolYear(date, p.year) && !excluded.has(date)) m.set(date, name);
  }
  for (const x of p.calendar.extra) m.set(x.date, x.name || '임시공휴일');
  return m;
}

/** 이 학년도의 내장 공휴일 목록 (체크 해제 여부와 상관없이) */
export function builtInHolidays(year: number): NamedDate[] {
  return Object.entries(HOLIDAYS)
    .filter(([d]) => inSchoolYear(d, year))
    .map(([date, name]) => ({ date, name }));
}

export const hasHolidayData = (year: number): boolean => HOLIDAY_YEARS.includes(year);

export function termList(c: Calendar): { name: string; start: string; end: string }[] {
  const terms = [
    { name: '1학기', start: c.s1s, end: c.s1e },
    { name: '2학기', start: c.s2s, end: c.s2e },
  ];
  // 한쪽만 적은 학년말 기간도 넣어서 "날짜를 입력하세요"로 알려 준다
  if (c.s3s || c.s3e) terms.push({ name: '학년말', start: c.s3s, end: c.s3e });
  return terms;
}

export function calendarStats(p: Project): CalendarStats {
  const holidays = holidayMap(p);
  const disc = new Map(p.calendar.disc.map((x) => [x.date, x.name]));
  const types = new Map<string, { type: DayType; name?: string }>();
  const problems: string[] = [];
  const terms: TermStat[] = [];

  for (const t of termList(p.calendar)) {
    if (!isIsoDate(t.start) || !isIsoDate(t.end)) {
      problems.push(`${t.name} 날짜를 입력하세요.`);
      terms.push({ ...t, days: 0, weeks: 0 });
      continue;
    }
    if (t.start > t.end) problems.push(`${t.name} 끝나는 날이 시작일보다 빨라요.`);
    if (!inSchoolYear(t.start, p.year) || !inSchoolYear(t.end, p.year)) {
      problems.push(`${t.name} 날짜가 ${p.year}학년도(3월~이듬해 2월) 밖이에요.`);
    }
    let days = 0;
    for (const d of eachDay(t.start, t.end)) {
      const w = parseIso(d).getDay();
      if (w === 0 || w === 6) types.set(d, { type: 'weekend' });
      else if (holidays.has(d)) types.set(d, { type: 'holiday', name: holidays.get(d) });
      else if (disc.has(d)) types.set(d, { type: 'discretionary', name: disc.get(d) });
      else {
        if (types.get(d)?.type !== 'school') days++;
        types.set(d, { type: 'school', name: t.name });
      }
    }
    terms.push({ ...t, days, weeks: round1(days / 5) });
  }
  const valid = terms.filter((t) => isIsoDate(t.start) && isIsoDate(t.end) && t.start <= t.end);
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const a = valid[i];
      const b = valid[j];
      if (a && b && a.start <= b.end && b.start <= a.end) problems.push(`${a.name}과 ${b.name} 기간이 겹쳐요.`);
    }
  }
  const closed = { holiday: 0, discretionary: 0 };
  for (const t of types.values()) {
    if (t.type === 'holiday') closed.holiday++;
    else if (t.type === 'discretionary') closed.discretionary++;
  }

  const total = terms.reduce((a, t) => a + t.days, 0);
  const dayType = (date: string) => {
    const known = types.get(date);
    if (known) return known;
    const w = parseIso(date).getDay();
    if (w === 0 || w === 6) return { type: 'weekend' as const };
    if (holidays.has(date)) return { type: 'holiday' as const, name: holidays.get(date) };
    return { type: 'vacation' as const };
  };
  return { terms, total, weeks: round1(total / 5), holidays, dayType, problems, closed };
}

/** 3월 2일부터 처음 오는 수업 가능한 평일 */
export function firstSchoolDay(year: number): string {
  const d = new Date(year, 2, 2);
  while (d.getDay() === 0 || d.getDay() === 6 || HOLIDAYS[toIso(d)]) d.setDate(d.getDate() + 1);
  return toIso(d);
}

/** 새 학년도 기본 학사일정 */
export function defaultCalendar(year: number): Calendar {
  const disc: NamedDate[] =
    year === 2026
      ? [
          { date: '2026-05-01', name: '재량휴업일(근로자의 날)' },
          { date: '2026-05-04', name: '재량휴업일(어린이날 연휴)' },
          { date: '2026-10-02', name: '재량휴업일(개천절 연휴)' },
        ]
      : [{ date: `${year}-05-01`, name: '재량휴업일(근로자의 날)' }].filter((x) => {
          const w = parseIso(x.date).getDay();
          return w !== 0 && w !== 6;
        });
  return {
    s1s: firstSchoolDay(year),
    s1e: `${year}-07-24`,
    s2s: `${year}-08-24`,
    s2e: `${year}-12-31`,
    s3s: `${year + 1}-02-01`,
    s3e: `${year + 1}-02-12`,
    disc,
    extra: [],
    excluded: [],
  };
}

/** 학년도의 12달 (3월 ~ 이듬해 2월) */
export function schoolYearMonths(year: number): { y: number; m: number }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = (2 + i) % 12;
    return { y: year + (m < 2 ? 1 : 0), m };
  });
}

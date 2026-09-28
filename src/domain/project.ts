import { DEFAULT_PER_DAY, defaultAnnual, GRADES, groupKeyOf, subjectsOf } from '../data/standards';
import { YEAR_OPTIONS } from '../data/holidays';
import { defaultCalendar } from './calendar';
import { isIsoDate } from './dates';
import { defaultRules, normalizeRules } from './rules';
import { autoGrid, hoursFromPlan } from './weekly';
import type { Autonomy, ByGrade, Calendar, GradeNo, NamedDate, Pair, Project, Semester, Weekly } from './types';

export const DEFAULT_MINUTES = 40;
const HALF_WEEKS: Pair = [17, 17];

export const newId = (): string => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const byGrade = <T>(fn: (g: GradeNo) => T): ByGrade<T> =>
  Object.fromEntries(GRADES.map((g) => [g, fn(g)])) as unknown as ByGrade<T>;

/** 연간 시수를 두 학기로 나눈다(홀수면 1학기가 1시간 더) */
export const splitHalf = (n: number): Pair => [Math.ceil(n / 2), Math.floor(n / 2)];

export function defaultAlloc(g: GradeNo): Record<string, Pair> {
  return Object.fromEntries(subjectsOf(g).map((s) => [s, splitHalf(defaultAnnual(g, s))]));
}

/** 창체 기본 영역 배분: 동아리·진로를 먼저 두고 나머지를 자율·자치에 */
export function defaultCca(g: GradeNo, total: number): readonly [number, number, number] {
  const [club, career] = g <= 2 ? [24, 10] : [34, 17];
  return [Math.max(0, total - club - career), club, career];
}

const emptyAutonomy = (): Autonomy => ({ hours: 0, name: '', semester: 1 });

export interface NewProjectOptions {
  readonly year?: number;
  readonly school?: string;
  readonly name?: string;
  readonly now?: Date;
}

export function newProject(opts: NewProjectOptions = {}): Project {
  const year = opts.year ?? YEAR_OPTIONS[0] ?? 2026;
  const now = (opts.now ?? new Date()).toISOString();
  const alloc = byGrade(defaultAlloc);
  const base: Project = {
    id: newId(),
    name: opts.name?.trim() || `${year}학년도 교육과정`,
    school: opts.school?.trim() ?? '',
    year,
    minutes: DEFAULT_MINUTES,
    classes: byGrade(() => 2),
    alloc,
    cca: byGrade((g) => defaultCca(g, defaultAnnual(g, '창의적 체험활동'))),
    safety: { 1: 32, 2: 32 },
    adapt: 0,
    info: { 5: 17, 6: 17 },
    autonomy: { 3: emptyAutonomy(), 4: emptyAutonomy(), 5: emptyAutonomy(), 6: emptyAutonomy() },
    calendar: defaultCalendar(year),
    weekly: byGrade(() => ({ perDay: [], weeks: HALF_WEEKS, hours: {}, grid: null })),
    rules: defaultRules(),
    createdAt: now,
    updatedAt: now,
  };
  return { ...base, weekly: byGrade((g) => defaultWeekly(base, g)) };
}

export function defaultWeekly(p: Project, g: GradeNo): Weekly {
  const shell: Weekly = { perDay: [...DEFAULT_PER_DAY[groupKeyOf(g)]], weeks: HALF_WEEKS, hours: {}, grid: null };
  const withHours: Weekly = { ...shell, hours: hoursFromPlan(p, g, shell) };
  return { ...withHours, grid: autoGrid(g, withHours) };
}

/* ───────── 불러온 값 검증 ───────── */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const MAX_HOURS = 9999;
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

/** 0 이상 유한수. step 단위로 반올림 */
export function num(v: unknown, fallback = 0, step = 1, max = MAX_HOURS): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(0, Math.round(n / step) * step));
}

const text = (v: unknown, max = 80): string => (typeof v === 'string' ? v.slice(0, max) : '');
const pair = (v: unknown, fb: Pair, step = 1): Pair =>
  Array.isArray(v) ? [num(v[0], fb[0], step), num(v[1], fb[1], step)] : fb;
const pick = <T>(src: unknown, g: number | string): unknown => (isObj(src) ? src[String(g)] : undefined) as T;

function namedDates(v: unknown): NamedDate[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  return v.flatMap((x) => {
    if (!isObj(x) || !isIsoDate(x.date) || seen.has(x.date)) return [];
    seen.add(x.date);
    return [{ date: x.date, name: text(x.name, 40) }];
  });
}

function normalizeCalendar(v: unknown, year: number): Calendar {
  const d = defaultCalendar(year);
  if (!isObj(v)) return d;
  const date = (k: keyof Calendar, allowEmpty: boolean) => {
    const x = v[k];
    if (isIsoDate(x)) return x;
    if (allowEmpty && x === '') return '';
    return d[k] as string;
  };
  return {
    s1s: date('s1s', false),
    s1e: date('s1e', false),
    s2s: date('s2s', false),
    s2e: date('s2e', false),
    s3s: date('s3s', true),
    s3e: date('s3e', true),
    disc: v.disc === undefined ? d.disc : namedDates(v.disc),
    extra: namedDates(v.extra),
    excluded: Array.isArray(v.excluded) ? v.excluded.filter(isIsoDate) : [],
  };
}

/** 이전 버전은 학교자율시간을 주당 시수에 따로 더했다. 지금은 교과 시수 안에서 운영하므로 다시 계산한다. */
export const LEGACY_AUTONOMY = '학교자율시간';

function hasLegacyAutonomy(v: Obj): boolean {
  const h = isObj(v.hours) ? v.hours[LEGACY_AUTONOMY] : undefined;
  const inHours = Array.isArray(h) && h.some((x) => Number(x) > 0);
  const inGrid = Array.isArray(v.grid) && v.grid.some((day) => Array.isArray(day) && day.includes(LEGACY_AUTONOMY));
  return inHours || inGrid;
}

/** 불러온 JSON에서 주간 배당을 다시 계산한 학년 (이전 버전의 학교자율시간 때문) */
export function legacyAutonomyGrades(v: unknown): GradeNo[] {
  if (!isObj(v) || !isObj(v.weekly)) return [];
  const weekly = v.weekly;
  return GRADES.filter((g) => {
    const w = weekly[String(g)];
    return isObj(w) && hasLegacyAutonomy(w);
  });
}

function normalizeWeekly(v: unknown, g: GradeNo, fallback: Weekly): Weekly {
  if (!isObj(v)) return fallback;
  const perDay = Array.isArray(v.perDay) && v.perDay.length === 5 ? v.perDay.map((x, i) => num(x, fallback.perDay[i] ?? 0, 1, 12)) : fallback.perDay;
  const weeks = pair(v.weeks, fallback.weeks, 0.5);
  if (hasLegacyAutonomy(v)) {
    const shell: Weekly = { perDay, weeks, hours: {}, grid: null };
    return { ...shell, hours: fallback.hours, grid: null };
  }
  const hours = Object.fromEntries(subjectsOf(g).map((s) => [s, pair(pick(v.hours, s), fallback.hours[s] ?? [0, 0], 0.5)]));
  const allowed = new Set(subjectsOf(g));
  const grid = Array.isArray(v.grid)
    ? v.grid.slice(0, 5).map((day) => (Array.isArray(day) ? day.slice(0, 12).map((s) => (typeof s === 'string' && allowed.has(s) ? s : '')) : []))
    : null;
  return { perDay, weeks, hours, grid };
}

/**
 * 저장소나 JSON 파일에서 읽은 프로젝트를 검증해 빠진 값은 기본값으로 채운다.
 * 이전 버전(claude.ai 아티팩트)에서 내보낸 JSON도 읽는다. 형식이 아니면 null.
 */
export function normalizeProject(v: unknown): Project | null {
  if (!isObj(v) || !isObj(v.alloc)) return null;
  const y = Number(v.year);
  const year = Number.isInteger(y) && y >= MIN_YEAR && y <= MAX_YEAR ? y : (YEAR_OPTIONS[0] ?? 2026);
  const base = newProject({ year });
  const alloc = byGrade((g) => Object.fromEntries(subjectsOf(g).map((s) => [s, pair(pick(pick(v.alloc, g), s), base.alloc[g][s] ?? [0, 0])])));
  const withAlloc: Project = { ...base, alloc };
  const autonomy = (g: 3 | 4 | 5 | 6): Autonomy => {
    const a = pick(v.autonomy, g);
    if (!isObj(a)) return base.autonomy[g];
    const sem = Number(a.semester);
    return { hours: num(a.hours), name: text(a.name, 40), semester: (sem === 2 || sem === 3 ? sem : 1) as Semester };
  };
  const ccaOf = (g: GradeNo): readonly [number, number, number] => {
    const c = pick(v.cca, g);
    const fb = defaultCca(g, (alloc[g]['창의적 체험활동'] ?? [0, 0]).reduce((a, b) => a + b, 0));
    return Array.isArray(c) ? [num(c[0], fb[0]), num(c[1], fb[1]), num(c[2], fb[2])] : fb;
  };
  const now = new Date().toISOString();
  const adaptRaw = isObj(v.adapt) ? v.adapt[1] : v.adapt;
  return {
    ...withAlloc,
    id: text(v.id, 60) || base.id,
    name: text(v.name) || base.name,
    school: text(v.school),
    minutes: num(v.minutes, DEFAULT_MINUTES, 1, 60) || DEFAULT_MINUTES,
    classes: byGrade((g) => num(pick(v.classes, g), 2, 1, 99)),
    cca: byGrade(ccaOf),
    safety: { 1: num(pick(v.safety, 1), 32), 2: num(pick(v.safety, 2), 32) },
    adapt: num(adaptRaw),
    info: { 5: num(pick(v.info, 5), 17), 6: num(pick(v.info, 6), 17) },
    autonomy: { 3: autonomy(3), 4: autonomy(4), 5: autonomy(5), 6: autonomy(6) },
    calendar: normalizeCalendar(v.calendar, year),
    weekly: byGrade((g) => {
      const w = normalizeWeekly(pick(v.weekly, g), g, defaultWeekly(withAlloc, g));
      if (w.grid !== null || !hasLegacyAutonomy((pick(v.weekly, g) as Obj) ?? {})) return w;
      const hours = hoursFromPlan(withAlloc, g, w);
      return { ...w, hours, grid: autoGrid(g, { ...w, hours }) };
    }),
    rules: normalizeRules(v.rules),
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : now,
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : now,
  };
}

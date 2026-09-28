import { GROUP_KEYS, INFO_MIN, MAX_CHANGE_PCT, MIN_SCHOOL_DAYS, SAFETY_MIN, STANDARDS, STANDARD_WEEKS } from '../data/standards';
import type { GradeGroupKey, SubjectGroup } from './types';

/**
 * 편성 검토에 쓰는 기준. 기본값은 2022 개정 교육과정이고, 고시가 바뀌거나 시·도 지침이 다르면
 * 프로젝트마다 바꿀 수 있다. 교과(군) 구성은 고정이고 숫자와 감축 불가 여부만 바꾼다.
 */
export interface GroupRule {
  readonly std: number;
  readonly noCut: boolean;
}

export interface GradeGroupRule {
  readonly total: number;
  /** 교과(군) 이름 → 기준 */
  readonly groups: Readonly<Record<string, GroupRule>>;
}

export interface Rules {
  readonly gradeGroups: Readonly<Record<GradeGroupKey, GradeGroupRule>>;
  /** 교과(군) 증감 허용 범위(%) */
  readonly maxChangePct: number;
  readonly minSchoolDays: number;
  readonly safetyMin: number;
  readonly infoMin: number;
  /** 연간 수업 주수 */
  readonly weeks: number;
}

export function defaultRules(): Rules {
  const gradeGroups = Object.fromEntries(
    GROUP_KEYS.map((gk) => {
      const S = STANDARDS[gk];
      return [gk, { total: S.total, groups: Object.fromEntries(S.groups.map((g) => [g.key, { std: g.std, noCut: Boolean(g.noCut) }])) }];
    }),
  ) as Record<GradeGroupKey, GradeGroupRule>;
  return { gradeGroups, maxChangePct: MAX_CHANGE_PCT, minSchoolDays: MIN_SCHOOL_DAYS, safetyMin: SAFETY_MIN, infoMin: INFO_MIN, weeks: STANDARD_WEEKS };
}

/** 학년군의 교과(군) 목록에 설정한 기준 시수·감축 불가를 입힌다 */
export function groupsOf(rules: Rules, gk: GradeGroupKey): SubjectGroup[] {
  return STANDARDS[gk].groups.map((g) => {
    const r = rules.gradeGroups[gk].groups[g.key];
    return r ? { ...g, std: r.std, noCut: r.noCut } : g;
  });
}

export const totalOf = (rules: Rules, gk: GradeGroupKey): number => rules.gradeGroups[gk].total;

/** 기본값과 다른 항목 설명 (화면·인쇄물에 표시) */
export function ruleChanges(rules: Rules): string[] {
  const d = defaultRules();
  const out: string[] = [];
  for (const gk of GROUP_KEYS) {
    const label = STANDARDS[gk].label;
    const cur = rules.gradeGroups[gk];
    const def = d.gradeGroups[gk];
    if (cur.total !== def.total) out.push(`${label} 총 시수 ${def.total}→${cur.total}`);
    for (const [key, r] of Object.entries(cur.groups)) {
      const base = def.groups[key];
      if (!base) continue;
      if (r.std !== base.std) out.push(`${label} ${key} ${base.std}→${r.std}`);
      if (r.noCut !== base.noCut) out.push(`${label} ${key} 감축 불가 ${r.noCut ? '지정' : '해제'}`);
    }
  }
  if (rules.maxChangePct !== d.maxChangePct) out.push(`증감 범위 ±${d.maxChangePct}%→±${rules.maxChangePct}%`);
  if (rules.minSchoolDays !== d.minSchoolDays) out.push(`수업일수 ${d.minSchoolDays}→${rules.minSchoolDays}일`);
  if (rules.safetyMin !== d.safetyMin) out.push(`안전교육 ${d.safetyMin}→${rules.safetyMin}시간`);
  if (rules.infoMin !== d.infoMin) out.push(`정보교육 ${d.infoMin}→${rules.infoMin}시간`);
  if (rules.weeks !== d.weeks) out.push(`연간 주수 ${d.weeks}→${rules.weeks}주`);
  return out;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, fb: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : fb);

/** 저장된 기준을 검증한다. 빠지거나 이상한 값은 기본값으로 */
export function normalizeRules(v: unknown): Rules {
  const d = defaultRules();
  if (!isObj(v)) return d;
  const gg = isObj(v.gradeGroups) ? v.gradeGroups : {};
  const gradeGroups = Object.fromEntries(
    GROUP_KEYS.map((gk) => {
      const src = isObj(gg[gk]) ? (gg[gk] as Obj) : {};
      const srcGroups = isObj(src.groups) ? src.groups : {};
      const def = d.gradeGroups[gk];
      const groups = Object.fromEntries(
        Object.entries(def.groups).map(([key, r]) => {
          const s = isObj(srcGroups[key]) ? (srcGroups[key] as Obj) : {};
          return [key, { std: int(s.std, r.std, 9999), noCut: typeof s.noCut === 'boolean' ? s.noCut : r.noCut }];
        }),
      );
      return [gk, { total: int(src.total, def.total, 99999), groups }];
    }),
  ) as Record<GradeGroupKey, GradeGroupRule>;
  return {
    gradeGroups,
    maxChangePct: int(v.maxChangePct, d.maxChangePct, 100),
    minSchoolDays: int(v.minSchoolDays, d.minSchoolDays, 366),
    safetyMin: int(v.safetyMin, d.safetyMin, 999),
    infoMin: int(v.infoMin, d.infoMin, 999),
    weeks: int(v.weeks, d.weeks, 52) || d.weeks,
  };
}

/* ───── 고치기 ───── */

export const setGroupRule = (gk: GradeGroupKey, key: string, patch: Partial<GroupRule>) => (r: Rules): Rules => {
  const cur = r.gradeGroups[gk].groups[key];
  if (!cur) return r;
  const next: GroupRule = { std: patch.std === undefined ? cur.std : int(patch.std, cur.std, 9999), noCut: patch.noCut ?? cur.noCut };
  return { ...r, gradeGroups: { ...r.gradeGroups, [gk]: { ...r.gradeGroups[gk], groups: { ...r.gradeGroups[gk].groups, [key]: next } } } };
};

export const setGroupTotal = (gk: GradeGroupKey, total: number) => (r: Rules): Rules => ({
  ...r,
  gradeGroups: { ...r.gradeGroups, [gk]: { ...r.gradeGroups[gk], total: int(total, r.gradeGroups[gk].total, 99999) } },
});

export type ScalarRule = 'maxChangePct' | 'minSchoolDays' | 'safetyMin' | 'infoMin' | 'weeks';
const SCALAR_MAX: Record<ScalarRule, number> = { maxChangePct: 100, minSchoolDays: 366, safetyMin: 999, infoMin: 999, weeks: 52 };

export const setScalarRule = (key: ScalarRule, value: number) => (r: Rules): Rules => {
  const v = int(value, r[key], SCALAR_MAX[key]);
  return { ...r, [key]: key === 'weeks' && v === 0 ? r.weeks : v };
};

/** 학년군 교과(군) 기준 시수의 합 (총 시수와 비교용) */
export const stdSum = (rules: Rules, gk: GradeGroupKey): number =>
  Object.values(rules.gradeGroups[gk].groups).reduce((a, g) => a + g.std, 0);

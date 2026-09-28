import { CCA, STANDARDS, subjectsOf } from '../data/standards';
import { totalOf } from './rules';
import type { GradeGroupKey, GradeNo, Project, SubjectGroup } from './types';

export const semesterHours = (p: Project, g: GradeNo, s: string, sem: 0 | 1): number => p.alloc[g][s]?.[sem] ?? 0;

export const annual = (p: Project, g: GradeNo, s: string): number => semesterHours(p, g, s, 0) + semesterHours(p, g, s, 1);

export const gradeTotal = (p: Project, g: GradeNo): number => subjectsOf(g).reduce((a, s) => a + annual(p, g, s), 0);

export const gradeSemesterTotal = (p: Project, g: GradeNo, sem: 0 | 1): number =>
  subjectsOf(g).reduce((a, s) => a + semesterHours(p, g, s, sem), 0);

export const ccaTotal = (p: Project, g: GradeNo): number => annual(p, g, CCA);

export function groupSum(p: Project, gk: GradeGroupKey, grp: SubjectGroup): number {
  return STANDARDS[gk].grades.reduce((t, g) => t + grp.subs.reduce((a, s) => a + annual(p, g, s), 0), 0);
}

export function groupGradeSum(p: Project, g: GradeNo, grp: SubjectGroup, sem?: 0 | 1): number {
  return grp.subs.reduce((a, s) => a + (sem === undefined ? annual(p, g, s) : semesterHours(p, g, s, sem)), 0);
}

export function gradeGroupTotal(p: Project, gk: GradeGroupKey): number {
  return STANDARDS[gk].grades.reduce((t, g) => t + gradeTotal(p, g), 0);
}

/** 기준 대비 증감률(%) — 소수 첫째 자리 */
export function changePct(value: number, std: number): number {
  return std ? Math.round(((value - std) / std) * 1000) / 10 : 0;
}

export type GroupLevel = 'ok' | 'info' | 'bad';

export interface GroupStatus {
  readonly level: GroupLevel;
  readonly label: string;
  readonly sum: number;
  readonly diff: number;
  readonly pct: number;
}

export function groupStatus(p: Project, gk: GradeGroupKey, grp: SubjectGroup): GroupStatus {
  const sum = groupSum(p, gk, grp);
  const diff = sum - grp.std;
  const pct = changePct(sum, grp.std);
  if (grp.noCut && diff < 0) return { level: 'bad', label: '감축 불가', sum, diff, pct };
  const max = p.rules.maxChangePct;
  if (Math.abs(pct) > max) return { level: 'bad', label: `${max}% 초과`, sum, diff, pct };
  if (diff !== 0) return { level: 'info', label: signed(pct) + '%', sum, diff, pct };
  return { level: 'ok', label: '기준', sum, diff, pct };
}

/** 3~6학년 학교자율시간 권장 시수: 학기별 1주 분량 = 연간 시수 ÷ 연간 주수 × 2 */
export const autonomyRecommended = (p: Project, g: GradeNo): number => Math.round((gradeTotal(p, g) / p.rules.weeks) * 2);

/** 학년군 최소 총 수업시간 수 (설정한 기준) */
export const minTotal = (p: Project, gk: GradeGroupKey): number => totalOf(p.rules, gk);

export const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));

export const fmt = (n: number): string => n.toLocaleString('ko-KR');

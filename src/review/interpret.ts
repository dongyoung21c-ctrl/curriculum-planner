/*
 * 표에서 편제표를 찾아 학년·교과별 연간 시수를 읽는다.
 * 학교마다 서식이 달라서, 행 이름(교과)과 머리글(학년·학기·계)을 글자로 알아보는 방식으로 읽고,
 * 머리글과 칸이 맞지 않는 PDF는 숫자 순서로 읽는다. 읽은 값은 화면에서 선생님이 확인·수정한다.
 */
import { CCA, GRADES, groupKeyOf, GROUP_KEYS, STANDARDS, subjectsOf } from '../data/standards';
import { newProject } from '../domain/project';
import type { Rules } from '../domain/rules';
import { allocationChecks, type Check } from '../domain/validate';
import type { GradeGroupKey, GradeNo, Pair, Project } from '../domain/types';
import type { Table } from './tables';

/* ───── 행 이름 ───── */

const GROUP_LABELS: readonly [RegExp, string][] = [
  [/^(창의적체험활동|창체)/, CCA],
  [/^바른생활/, '바른 생활'],
  [/^슬기로운생활/, '슬기로운 생활'],
  [/^즐거운생활/, '즐거운 생활'],
  [/^사회\/도덕/, '사회/도덕'],
  [/^과학\/실과/, '과학/실과'],
  [/^(예술|음악\/미술)/, '예술(음악/미술)'],
  [/^국어/, '국어'],
  [/^사회/, '사회'],
  [/^도덕/, '도덕'],
  [/^수학/, '수학'],
  [/^과학/, '과학'],
  [/^실과/, '실과'],
  [/^체육/, '체육'],
  [/^음악/, '음악'],
  [/^미술/, '미술'],
  [/^영어/, '영어'],
];

const TOTAL_ROW = /(소계|합계|총계|^계$|총수업|총시수)/;

/** "사회 · 도덕" → 사회/도덕, "창의적 체험활동" → 창의적 체험활동 */
export function labelOf(cell: string): string | null {
  const s = cell.replace(/\s+/g, '').replace(/[·ㆍ,]/g, '/');
  if (!s || TOTAL_ROW.test(s)) return null;
  for (const [re, key] of GROUP_LABELS) if (re.test(s)) return key;
  return null;
}

/** "1,744" → 1744, "482(+34)" → 482, "-"·빈칸 → null */
export function numberOf(cell: string | undefined): number | null {
  const m = /^\(?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/.exec((cell ?? '').trim());
  return m ? Number((m[1] ?? '').replace(/,/g, '')) : null;
}

/* ───── 머리글 ───── */

type Sem = 0 | 1 | 'total' | null;
interface ColInfo {
  readonly grade: GradeNo | null;
  readonly group: GradeGroupKey | null;
  readonly sem: Sem;
  /** 기준 시수·증감처럼 편성 값이 아닌 칸 */
  readonly skip: boolean;
  readonly plan: boolean;
}

export function columnInfo(header: string): ColInfo {
  const h = header.replace(/\s+/g, '');
  const groupMatch = /([1-6])[~∼\-]([1-6])학년/.exec(h);
  const gradeMatch = groupMatch ? null : /([1-6])학년(?!군)/.exec(h);
  const grade = gradeMatch ? (Number(gradeMatch[1]) as GradeNo) : null;
  const group = groupMatch ? (`${groupMatch[1]}-${groupMatch[2]}` as GradeGroupKey) : null;
  const sem: Sem = /1학기/.test(h) ? 0 : /2학기/.test(h) ? 1 : /(계|합계|연간|소계)/.test(h) ? 'total' : null;
  return {
    grade,
    group: group && GROUP_KEYS.includes(group) ? group : null,
    sem,
    skip: /(기준|증감|%|비율|차이)/.test(h),
    plan: /편성/.test(h),
  };
}

/* ───── 표 하나 읽기 ───── */

export interface Extracted {
  readonly tableName: string;
  /** 학년 → 교과 또는 교과(군) → 연간 시수 */
  readonly grades: Partial<Record<GradeNo, Record<string, number>>>;
  /** 학년군 합계로만 적힌 값 */
  readonly groups: Partial<Record<GradeGroupKey, Record<string, number>>>;
  /** 값을 읽은 행 수 (편제표다운 정도) */
  readonly score: number;
}

interface LabeledRow {
  readonly key: string;
  readonly labelCol: number;
  readonly cells: readonly string[];
}

function labeledRows(rows: readonly (readonly string[])[]): { first: number; list: LabeledRow[] } {
  const list: LabeledRow[] = [];
  let first = -1;
  rows.forEach((cells, ri) => {
    let key: string | null = null;
    let labelCol = -1;
    for (let c = 0; c < Math.min(3, cells.length); c++) {
      if (numberOf(cells[c]) !== null) break;
      const k = labelOf(cells[c] ?? '');
      if (k) {
        key = k;
        labelCol = c;
      }
    }
    if (key) {
      if (first < 0) first = ri;
      list.push({ key, labelCol, cells });
    }
  });
  return { first, list };
}

function pickByHeader(row: LabeledRow, cols: readonly ColInfo[], g: GradeNo): number | null {
  const mine = cols.map((c, i) => ({ c, i })).filter(({ c, i }) => c.grade === g && !c.skip && i > row.labelCol);
  if (!mine.length) return null;
  const total = mine.find(({ c }) => c.sem === 'total');
  if (total) return numberOf(row.cells[total.i]);
  const s1 = mine.find(({ c }) => c.sem === 0);
  const s2 = mine.find(({ c }) => c.sem === 1);
  if (s1 && s2) {
    const a = numberOf(row.cells[s1.i]);
    const b = numberOf(row.cells[s2.i]);
    return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
  }
  return numberOf(row.cells[(mine[0] ?? { i: -1 }).i]);
}

function pickGroupColumn(row: LabeledRow, cols: readonly ColInfo[], gk: GradeGroupKey): number | null {
  const mine = cols.map((c, i) => ({ c, i })).filter(({ c, i }) => c.group === gk && !c.skip && i > row.labelCol);
  const best = mine.find(({ c }) => c.plan) ?? mine[0];
  return best ? numberOf(row.cells[best.i]) : null;
}

/** 머리글로 칸을 알 수 없을 때(주로 PDF): "1학년 … 6학년" 순서와 숫자 순서를 맞춘다 */
function positional(rows: readonly (readonly string[])[], list: readonly LabeledRow[]): Extracted['grades'] | null {
  const header = rows.find((r) => r.filter((c) => columnInfo(c).grade !== null).length >= 2);
  if (!header) return null;
  const order = header.map((c) => columnInfo(c).grade).filter((g): g is GradeNo => g !== null);
  const out: Extracted['grades'] = {};
  for (const row of list) {
    const nums = row.cells.slice(row.labelCol + 1).map(numberOf).filter((n): n is number => n !== null);
    let values: number[] | null = null;
    if (nums.length === order.length || nums.length === order.length + 1) values = nums.slice(0, order.length);
    else if (nums.length === order.length * 3 || nums.length === order.length * 3 + 1) values = order.map((_, i) => nums[i * 3 + 2] ?? 0);
    if (!values) continue;
    values.forEach((v, i) => {
      const g = order[i];
      if (g) (out[g] ??= {})[row.key] = v;
    });
  }
  return out;
}

/**
 * 병합된 머리글을 CSV로 내보내면 "1학년, (빈칸), (빈칸)"처럼 오른쪽이 비어 있다.
 * 학년·학년군 이름 뒤의 빈칸은 그 이름으로 채운다.
 */
export function fillMergedHeader(row: readonly string[]): string[] {
  let carry = '';
  return row.map((cell, i) => {
    if (cell.trim()) {
      const info = columnInfo(cell);
      carry = i > 0 && (info.grade !== null || info.group !== null) ? cell : '';
      return cell;
    }
    return carry;
  });
}

export function extractFromTable(table: Table): Extracted {
  const { first, list } = labeledRows(table.rows);
  const empty: Extracted = { tableName: table.name, grades: {}, groups: {}, score: 0 };
  if (first < 0) return empty;
  const headerRows = table.rows.slice(Math.max(0, first - 5), first).map(fillMergedHeader);
  const width = Math.max(...table.rows.map((r) => r.length));
  const cols = Array.from({ length: width }, (_, c) => columnInfo(headerRows.map((r) => r[c] ?? '').join(' ')));
  const hasGradeCols = cols.some((c) => c.grade !== null && !c.skip);

  let grades: Extracted['grades'] = {};
  const groups: Extracted['groups'] = {};
  if (hasGradeCols) {
    for (const row of list) {
      for (const g of GRADES) {
        const v = pickByHeader(row, cols, g);
        if (v !== null) (grades[g] ??= {})[row.key] = v;
      }
    }
  } else {
    grades = positional(table.rows, list) ?? {};
  }
  for (const gk of GROUP_KEYS) {
    if (STANDARDS[gk].grades.some((g) => grades[g] && Object.keys(grades[g] ?? {}).length)) continue;
    for (const row of list) {
      const v = pickGroupColumn(row, cols, gk);
      if (v !== null) (groups[gk] ??= {})[row.key] = v;
    }
  }
  const keys = new Set<string>();
  for (const g of GRADES) for (const k of Object.keys(grades[g] ?? {})) keys.add(`${g}:${k}`);
  for (const gk of GROUP_KEYS) for (const k of Object.keys(groups[gk] ?? {})) keys.add(`${gk}:${k}`);
  return { tableName: table.name, grades, groups, score: keys.size };
}

/** 모든 표를 읽고 편제표다운 순서로 돌려준다 (값을 3개 이상 읽은 표만) */
export function findPlans(tables: readonly Table[]): Extracted[] {
  return tables.map(extractFromTable).filter((x) => x.score >= 3).sort((a, b) => b.score - a.score);
}

/* ───── 검토 ───── */

/** 학년 → 교과 → 연간 시수 (못 찾으면 null) */
export type ReviewValues = Readonly<Record<GradeNo, Readonly<Record<string, number | null>>>>;

const groupOfSubject = (g: GradeNo, key: string) => STANDARDS[groupKeyOf(g)].groups.find((grp) => grp.key === key);

/** 읽은 값을 교과 단위로 펼친다. 교과(군)으로만 적힌 값은 그 교과(군)의 첫 교과에 넣는다. */
export function toReviewValues(ex: Extracted): ReviewValues {
  const out = Object.fromEntries(GRADES.map((g) => [g, Object.fromEntries(subjectsOf(g).map((s) => [s, null as number | null]))])) as Record<GradeNo, Record<string, number | null>>;
  const put = (g: GradeNo, key: string, v: number) => {
    const subs = subjectsOf(g);
    if (subs.includes(key)) {
      out[g][key] = v;
      return;
    }
    const grp = groupOfSubject(g, key);
    if (!grp || grp.subs.some((s) => (ex.grades[g] ?? {})[s] !== undefined)) return;
    grp.subs.forEach((s, i) => (out[g][s] = i === 0 ? v : 0));
  };
  for (const g of GRADES) for (const [k, v] of Object.entries(ex.grades[g] ?? {})) put(g, k, v);
  for (const gk of GROUP_KEYS) {
    const [firstGrade, ...rest] = STANDARDS[gk].grades;
    if (!firstGrade) continue;
    for (const [k, v] of Object.entries(ex.groups[gk] ?? {})) {
      put(firstGrade, k, v);
      for (const g of rest) {
        const grp = groupOfSubject(g, k);
        for (const s of grp ? grp.subs : subjectsOf(g).includes(k) ? [k] : []) out[g][s] = 0;
      }
    }
  }
  return out;
}

export const setReviewValue = (values: ReviewValues, g: GradeNo, subject: string, v: number | null): ReviewValues => ({
  ...values,
  [g]: { ...values[g], [subject]: v },
});

export interface ReviewResult {
  readonly checks: readonly Check[];
  /** 파일에서 찾지 못한 교과(군) (예: "3~4학년군 영어") */
  readonly missing: readonly string[];
  readonly project: Project;
}

/** 읽은 시수를 기준에 비춰 검토한다. 못 찾은 교과(군)은 위반으로 치지 않고 따로 알린다. */
export function reviewValues(values: ReviewValues, rules: Rules): ReviewResult {
  const base = newProject();
  const alloc = Object.fromEntries(GRADES.map((g) => [g, Object.fromEntries(subjectsOf(g).map((s) => [s, [values[g][s] ?? 0, 0] as Pair]))])) as unknown as Project['alloc'];
  const project: Project = { ...base, alloc, rules };
  const missing: string[] = [];
  const missingGroups = new Set<string>();
  for (const gk of GROUP_KEYS) {
    for (const grp of STANDARDS[gk].groups) {
      const found = STANDARDS[gk].grades.some((g) => grp.subs.some((s) => values[g][s] !== null));
      if (!found) {
        missing.push(`${STANDARDS[gk].label} ${grp.key}`);
        missingGroups.add(gk);
      }
    }
  }
  const checks = allocationChecks(project).flatMap((c): Check[] => {
    if (missing.some((m) => c.title.startsWith(m))) return [];
    const gk = GROUP_KEYS.find((k) => c.title.startsWith(`${STANDARDS[k].label} 총 수업시간 수`));
    if (gk && missingGroups.has(gk)) {
      return [{ level: 'warn', title: `${STANDARDS[gk].label} 총 수업시간 수는 확인하지 못했어요`, detail: '파일에서 찾지 못한 교과(군)이 있어요. 아래 표에 직접 넣으면 검토해요.', view: 'review' }];
    }
    return [c];
  });
  return { checks, missing, project };
}

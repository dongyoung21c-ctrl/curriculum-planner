import { CCA, GRADES, GROUP_KEYS, shortName, STANDARDS } from '../data/standards';
import { calendarStats, hasHolidayData } from './calendar';
import { annual, ccaTotal, fmt, gradeGroupTotal, groupStatus, signed } from './hours';
import { groupsOf, totalOf } from './rules';
import { weeklyStats } from './weekly';
import type { Project } from './types';

export type CheckLevel = 'bad' | 'warn' | 'info' | 'ok';
export type ViewId = 'overview' | 'alloc' | 'cca' | 'calendar' | 'weekly' | 'print' | 'review' | 'rules' | 'settings';

export interface Check {
  readonly level: CheckLevel;
  readonly title: string;
  readonly detail: string;
  /** 고치러 갈 화면 */
  readonly view: ViewId;
}

const ORDER: Record<CheckLevel, number> = { bad: 0, warn: 1, info: 2, ok: 3 };

type Push = (level: CheckLevel, title: string, detail: string, view: ViewId) => void;

/** 시수 기준 검토: 교과(군) 증감 범위, 감축 불가, 학년군 최소 총 시수 (파일 검토에서도 쓴다) */
export function allocationChecks(p: Project): Check[] {
  const out: Check[] = [];
  const push: Push = (level, title, detail, view) => out.push({ level, title, detail, view });
  const max = p.rules.maxChangePct;
  for (const gk of GROUP_KEYS) {
    const S = STANDARDS[gk];
    for (const grp of groupsOf(p.rules, gk)) {
      const st = groupStatus(p, gk, grp);
      const base = `편성 ${fmt(st.sum)}시간 / 기준 ${fmt(grp.std)}시간 (${signed(st.pct)}%)`;
      if (st.level === 'bad') {
        push('bad', `${S.label} ${grp.key} ${st.label}`, `${base} · ${st.label === '감축 불가' ? '기준 시수보다 줄일 수 없는 교과(군)이에요' : `증감 범위는 ±${max}%예요`}`, 'alloc');
      } else if (st.level === 'info') {
        push('info', `${S.label} ${grp.key} ${st.label} 증감`, `${base} · 학교 교육과정 문서에 증감 근거를 적어 주세요.`, 'alloc');
      }
    }
    const tot = gradeGroupTotal(p, gk);
    const min = totalOf(p.rules, gk);
    if (tot < min) push('bad', `${S.label} 총 수업시간 수 미달`, `편성 ${fmt(tot)}시간 < 최소 ${fmt(min)}시간`, 'alloc');
    else push('ok', `${S.label} 총 수업시간 수 ${fmt(tot)}시간`, tot === min ? '기준과 같아요' : `기준보다 ${fmt(tot - min)}시간 많아요`, 'alloc');
  }
  return out;
}

/**
 * 편성 기준 검토.
 * bad: 기준 위반(고쳐야 함) · warn: 확인이 필요함 · info: 알아 둘 것 · ok: 충족
 */
export function validate(p: Project): Check[] {
  const out: Check[] = allocationChecks(p);
  const push: Push = (level, title, detail, view) => out.push({ level, title, detail, view });
  const { safetyMin, infoMin, minSchoolDays } = p.rules;

  for (const g of GRADES) {
    const c = ccaTotal(p, g);
    const areas = p.cca[g].reduce((a, b) => a + b, 0);
    if (areas !== c) push('warn', `${g}학년 창의적 체험활동 영역 합계가 달라요`, `영역 합계 ${fmt(areas)}시간 · 편제표 창체 ${fmt(c)}시간`, 'cca');
  }

  const safety = p.safety[1] + p.safety[2];
  if (safety < safetyMin) push('warn', '1~2학년군 안전교육 시수 확인', `안전교육 ${fmt(safety)}시간 (${safetyMin}시간 이상)`, 'cca');
  else push('ok', `1~2학년군 안전교육 ${fmt(safety)}시간`, `${safetyMin}시간 이상 편성`, 'cca');

  const info = p.info[5] + p.info[6];
  if (info < infoMin) push('warn', '5~6학년군 정보교육 시수 부족', `실과 내 정보교육 ${fmt(info)}시간 (${infoMin}시간 이상)`, 'cca');
  else push('ok', `5~6학년군 정보교육 ${fmt(info)}시간`, `실과 내 ${infoMin}시간 이상 편성`, 'cca');

  const missingAutonomy = ([3, 4, 5, 6] as const).filter((g) => p.autonomy[g].hours <= 0);
  if (missingAutonomy.length) push('info', '학교자율시간을 아직 정하지 않았어요', `${missingAutonomy.join('·')}학년`, 'cca');

  const cs = calendarStats(p);
  for (const problem of cs.problems) push('bad', '학사일정 날짜 확인', problem, 'calendar');
  if (!hasHolidayData(p.year)) push('warn', `${p.year}학년도 공휴일 자료가 없어요`, '학사일정에서 공휴일을 직접 추가해야 수업일수가 맞아요.', 'calendar');
  if (cs.total < minSchoolDays) push('bad', `수업일수 ${minSchoolDays}일 미달`, `현재 ${cs.total}일 · 초·중등교육법 시행령 제45조: 연간 ${minSchoolDays}일 이상`, 'calendar');
  else push('ok', `수업일수 ${cs.total}일`, cs.terms.map((t) => `${t.name} ${t.days}일`).join(' · '), 'calendar');

  for (const g of GRADES) {
    const ws = weeklyStats(p, g);
    if (!ws.slotsMatch) {
      push('warn', `${g}학년 주당 시수와 교시 수가 달라요`, `주당 편성 ${ws.weeklySum[0]} / ${ws.weeklySum[1]}시간 · 요일별 교시 합계 ${ws.slots}교시`, 'weekly');
    }
    const short = ws.rows.filter((r) => r.diff <= -1);
    if (short.length) {
      push('info', `${g}학년 주간 운영이 편제보다 적은 교과`, `${short.map((r) => `${shortName(r.subject)} ${r.diff}`).join(', ')} · 특정 주간에 추가 배당하세요.`, 'weekly');
    }
  }

  return out.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}

export function countLevels(checks: readonly Check[]): Record<CheckLevel, number> {
  return checks.reduce<Record<CheckLevel, number>>((acc, c) => ({ ...acc, [c.level]: acc[c.level] + 1 }), { bad: 0, warn: 0, info: 0, ok: 0 });
}

/** 편제표 CSV (엑셀에서 한글이 깨지지 않도록 BOM을 붙여 쓴다) */
export function toCsv(p: Project): string {
  const subjects = ['국어', '사회', '도덕', '수학', '과학', '실과', '체육', '음악', '미술', '영어', '바른 생활', '슬기로운 생활', '즐거운 생활', CCA];
  const head = ['구분', ...GRADES.flatMap((g) => [`${g}학년 1학기`, `${g}학년 2학기`, `${g}학년 계`]), '합계'];
  const rows: (string | number)[][] = [head];
  for (const s of subjects) {
    const r: (string | number)[] = [s];
    let tot = 0;
    for (const g of GRADES) {
      const a = p.alloc[g][s];
      if (!a) {
        r.push('', '', '');
        continue;
      }
      r.push(a[0], a[1], annual(p, g, s));
      tot += annual(p, g, s);
    }
    rows.push([...r, tot]);
  }
  const totals: (string | number)[] = ['연간 총 시수'];
  let all = 0;
  for (const g of GRADES) {
    const s1 = Object.values(p.alloc[g]).reduce((a, x) => a + x[0], 0);
    const s2 = Object.values(p.alloc[g]).reduce((a, x) => a + x[1], 0);
    totals.push(s1, s2, s1 + s2);
    all += s1 + s2;
  }
  rows.push([...totals, all]);
  return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

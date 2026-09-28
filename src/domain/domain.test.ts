import { GRADES, GROUP_KEYS, STANDARDS, subjectsOf, defaultAnnual, CCA } from '../data/standards';
import { newProject, normalizeProject, defaultCca, num, splitHalf, legacyAutonomyGrades } from './project';
import { annual, gradeGroupTotal, groupStatus, changePct, autonomyRecommended, gradeTotal } from './hours';
import { calendarStats, firstSchoolDay, defaultCalendar, holidayMap, schoolYearMonths, builtInHolidays } from './calendar';
import { distributeWeekly, weeklyStats, autoGrid, gridCheck } from './weekly';
import { validate, countLevels, toCsv } from './validate';
import { isIsoDate, eachDay, inSchoolYear, monthDay } from './dates';
import * as E from './edits';
import type { Project } from './types';

const fresh = (year = 2026): Project => newProject({ year, school: '한빛초', now: new Date('2026-01-01T00:00:00Z') });

describe('2022 개정 기준 시수', () => {
  it('학년 기본 시수를 더하면 교과(군) 기준 시수와 학년군 총 시수가 된다', () => {
    for (const gk of GROUP_KEYS) {
      const S = STANDARDS[gk];
      for (const grp of S.groups) {
        const sum = S.grades.reduce((t, g) => t + grp.subs.reduce((a, s) => a + defaultAnnual(g, s), 0), 0);
        expect(sum, `${gk} ${grp.key}`).toBe(grp.std);
      }
      expect(S.groups.reduce((a, g) => a + g.std, 0)).toBe(S.total);
    }
  });

  it('새 프로젝트의 학년군 총 시수는 기준과 같다', () => {
    const p = fresh();
    expect(gradeGroupTotal(p, '1-2')).toBe(1744);
    expect(gradeGroupTotal(p, '3-4')).toBe(1972);
    expect(gradeGroupTotal(p, '5-6')).toBe(2176);
  });
});

describe('새 프로젝트', () => {
  it('기준 위반이나 확인할 것이 없는 상태로 시작한다', () => {
    const levels = countLevels(validate(fresh()));
    expect(levels.bad).toBe(0);
    expect(levels.warn).toBe(0);
  });

  it('모든 학년의 주당 시수가 요일별 교시 수와 맞는다', () => {
    const p = fresh();
    for (const g of GRADES) expect(weeklyStats(p, g).slotsMatch, `${g}학년`).toBe(true);
  });

  it('2026학년도 기본 수업일수는 194일이다 (제헌절 공휴일 포함)', () => {
    const cs = calendarStats(fresh());
    expect(cs.total).toBe(194);
    expect(cs.terms.map((t) => t.days)).toEqual([98, 88, 8]);
    expect(cs.closed).toEqual({ holiday: 11, discretionary: 3 });
  });

  it('이름을 비우면 학년도로 짓고, 창체 영역 합계가 창체 시수와 같다', () => {
    const p = newProject({ year: 2027 });
    expect(p.name).toBe('2027학년도 교육과정');
    for (const g of GRADES) expect(p.cca[g].reduce((a, b) => a + b, 0)).toBe(annual(p, g, CCA));
  });
});

describe('교과(군) 판정', () => {
  const grp = (gk: '1-2' | '3-4' | '5-6', key: string) => STANDARDS[gk].groups.find((x) => x.key === key)!;

  it('기준과 같으면 기준, 20% 안이면 증감, 넘으면 위반', () => {
    const p = fresh();
    expect(groupStatus(p, '3-4', grp('3-4', '국어')).level).toBe('ok');
    const plus10 = E.setAlloc(3, '국어', 0, 102 + 41)(p);
    expect(groupStatus(plus10, '3-4', grp('3-4', '국어'))).toMatchObject({ level: 'info', diff: 41, pct: 10 });
    const plus25 = E.setAlloc(3, '국어', 0, 102 + 102)(p);
    expect(groupStatus(plus25, '3-4', grp('3-4', '국어')).level).toBe('bad');
  });

  it('체육·예술은 1시간만 줄여도 위반이다', () => {
    const p = E.setAlloc(5, '음악', 1, 33)(fresh());
    expect(groupStatus(p, '5-6', grp('5-6', '예술(음악/미술)'))).toMatchObject({ level: 'bad', label: '감축 불가' });
    expect(validate(p).some((c) => c.level === 'bad' && c.title.includes('예술'))).toBe(true);
  });

  it('학년군 총 시수가 모자라면 위반', () => {
    const p = E.setAlloc(1, '국어', 0, 20)(fresh());
    expect(validate(p).some((c) => c.title === '1~2학년군 총 수업시간 수 미달')).toBe(true);
  });

  it('증감률은 소수 첫째 자리까지', () => {
    expect(changePct(110, 100)).toBe(10);
    expect(changePct(1, 3)).toBe(-66.7);
    expect(changePct(5, 0)).toBe(0);
  });

  it('학교자율시간 권장 시수는 학기별 1주 분량이다', () => {
    const p = fresh();
    expect(autonomyRecommended(p, 5)).toBe(Math.round((gradeTotal(p, 5) / 34) * 2));
  });
});

describe('학사일정', () => {
  it('첫 등교일은 3월 2일 이후 첫 평일(공휴일 제외)', () => {
    expect(firstSchoolDay(2026)).toBe('2026-03-03');
    expect(firstSchoolDay(2027)).toBe('2027-03-02');
  });

  it('법정공휴일을 빼거나 임시공휴일을 더하면 수업일수가 바뀐다', () => {
    const p = fresh();
    const base = calendarStats(p).total;
    expect(calendarStats(E.toggleHoliday('2026-06-03')(p)).total).toBe(base + 1);
    expect(calendarStats(E.addExtraHoliday('2026-04-15', '임시공휴일')(p)).total).toBe(base - 1);
    expect(calendarStats(E.toggleDiscretionary('2026-04-16')(p)).total).toBe(base - 1);
    expect(calendarStats(E.toggleDiscretionary('2026-05-01')(p)).total).toBe(base + 1);
  });

  it('학기 날짜가 거꾸로이거나 겹치면 알려 준다', () => {
    const p = E.setTermDate('s2s', '2026-07-01')(fresh());
    expect(calendarStats(p).problems).toEqual(['1학기과 2학기 기간이 겹쳐요.']);
    const q = E.setTermDate('s1e', '2026-03-01')(fresh());
    expect(calendarStats(q).problems[0]).toMatch(/끝나는 날이/);
    expect(validate(q).some((c) => c.title === '학사일정 날짜 확인')).toBe(true);
  });

  it('겹친 기간의 날은 두 번 세지 않는다', () => {
    const p = E.setTermDate('s2e', '2026-07-24')(E.setTermDate('s2s', '2026-03-03')(fresh()));
    expect(calendarStats(p).total).toBe(98 + 8);
  });

  it('잘못된 날짜는 받지 않고, 학년말은 비울 수 있다', () => {
    const p = fresh();
    expect(E.setTermDate('s1s', '2026-02-30')(p)).toBe(p);
    const noEnd = E.setTermDate('s3e', '')(E.setTermDate('s3s', '')(p));
    expect(calendarStats(noEnd).terms).toHaveLength(2);
  });

  it('공휴일 자료가 없는 학년도는 경고한다', () => {
    const p = fresh(2029);
    expect(validate(p).some((c) => c.title === '2029학년도 공휴일 자료가 없어요')).toBe(true);
    expect(builtInHolidays(2029)).toEqual([]);
  });

  it('2027학년도에는 2028년 1월 설 연휴(26~28일)가 들어간다', () => {
    const map = holidayMap(fresh(2027));
    expect(map.get('2028-01-27')).toBe('설날');
    expect(map.get('2028-01-28')).toBe('설날 연휴');
    expect(map.has('2026-10-03')).toBe(false);
  });

  it('학년도 달은 3월부터 이듬해 2월까지', () => {
    const ms = schoolYearMonths(2026);
    expect(ms[0]).toEqual({ y: 2026, m: 2 });
    expect(ms[11]).toEqual({ y: 2027, m: 1 });
  });

  it('주말은 주말, 방학 평일은 방학으로 본다', () => {
    const cs = calendarStats(fresh());
    expect(cs.dayType('2026-03-07').type).toBe('weekend');
    expect(cs.dayType('2026-08-03').type).toBe('vacation');
    expect(cs.dayType('2026-08-17').type).toBe('holiday');
    expect(cs.dayType('2026-05-04')).toEqual({ type: 'discretionary', name: '재량휴업일(어린이날 연휴)' });
    expect(cs.dayType('2026-03-03').type).toBe('school');
  });

  it('2026이 아닌 해는 주말이 아닌 5월 1일만 재량휴업일로 둔다', () => {
    expect(defaultCalendar(2027).disc.map((d) => d.date)).toEqual([]);
    expect(defaultCalendar(2028).disc.map((d) => d.date)).toEqual(['2028-05-01']);
  });
});

describe('주간 시수', () => {
  it('0.5 단위로 나누고 합계를 교시 수에 맞춘다', () => {
    const r = distributeWeekly({ 가: 100, 나: 60, 다: 30 }, 17, 11);
    expect(Object.values(r).reduce((a, b) => a + b, 0)).toBe(11);
    for (const v of Object.values(r)) expect(v * 2).toBe(Math.round(v * 2));
  });

  it('교시가 모자라면 나머지가 작은 교과부터 줄인다', () => {
    expect(distributeWeekly({ 가: 34, 나: 34 }, 17, 3)).toEqual({ 가: 1.5, 나: 1.5 });
  });

  it('주수가 0이면 모두 0', () => {
    expect(distributeWeekly({ 가: 34 }, 0, 5)).toEqual({ 가: 0 });
  });

  it('학교자율시간은 주당 합계에 따로 더하지 않는다 (교과 시수 안에서 운영)', () => {
    const p = E.weeklyFromPlan(5)(E.setAutonomy(5, { hours: 64 })(fresh()));
    const ws = weeklyStats(p, 5);
    expect(ws.slotsMatch).toBe(true);
    expect(ws.rows.some((r) => r.subject === '학교자율시간')).toBe(false);
  });

  it('자동 시간표는 요일별 교시를 채우고 주당 시수와 맞는다', () => {
    const p = fresh();
    const w = p.weekly[3];
    const grid = autoGrid(3, w);
    expect(grid.map((d) => d.length)).toEqual([...w.perDay]);
    expect(gridCheck(3, { ...w, grid })).toEqual({ empty: 0, mismatches: [], alternating: [] });
    expect(grid[0]?.[0]).toBe('국어');
  });

  it('시간표 칸을 바꾸면 불일치를 알려 준다', () => {
    const p = E.setGridCell(3, 0, 0, '체육')(fresh());
    const gc = gridCheck(3, p.weekly[3]);
    expect(gc.mismatches.map((m) => m.subject).sort()).toEqual(['국어', '체육']);
    const cleared = E.setGridCell(3, 4, 9, '')(p);
    expect(cleared.weekly[3].grid?.[4]).toHaveLength(10);
  });

  it('교시 수를 바꾸면 불일치 경고가 뜨고, 자동 배당으로 맞출 수 있다', () => {
    const p = E.setPerDay(4, 0, 7)(fresh());
    expect(validate(p).some((c) => c.title === '4학년 주당 시수와 교시 수가 달라요')).toBe(true);
    expect(weeklyStats(E.weeklyFromPlan(4)(p), 4).slotsMatch).toBe(true);
  });

  it('주수를 줄이면 운영 시수 부족을 알려 준다', () => {
    const p = E.setWeeks(6, 1, 15)(fresh());
    expect(validate(p).some((c) => c.level === 'info' && c.title.startsWith('6학년 주간 운영'))).toBe(true);
    const all = E.weeksForAllGrades([19.8, 17.4])(p);
    for (const g of GRADES) expect(all.weekly[g].weeks).toEqual([20, 17.5]);
  });

  it('주당 시수는 0.5 단위로 저장한다', () => {
    const p = E.setWeeklyHours(1, '국어', 0, 6.3)(fresh());
    expect(p.weekly[1].hours['국어']?.[0]).toBe(6.5);
    expect(E.rebuildGrid(1)(p).weekly[1].grid).not.toBeNull();
  });
});

describe('편집 함수', () => {
  it('원본을 바꾸지 않는다', () => {
    const p = fresh();
    const q = E.setAlloc(1, '국어', 0, 999)(p);
    expect(p.alloc[1]['국어']).toEqual([121, 120]);
    expect(q.alloc[1]['국어']).toEqual([999, 120]);
  });

  it('학기 균등 분할과 기준 시수 초기화', () => {
    const p = E.setAlloc(3, '국어', 0, 150)(fresh());
    expect(E.splitEvenly('3-4')(p).alloc[3]['국어']).toEqual([126, 126]);
    expect(E.resetToStandard('3-4')(p).alloc[3]['국어']).toEqual([102, 102]);
  });

  it('창체 영역·안전·정보·적응·자율시간', () => {
    let p = E.setCcaArea(1, 0, 90)(fresh());
    expect(validate(p).some((c) => c.title.startsWith('1학년 창의적 체험활동 영역'))).toBe(true);
    p = E.setSafety(1, 10)(p);
    p = E.setInfo(5, 0)(p);
    p = E.setAdapt(20)(p);
    p = E.setAutonomy(3, { hours: 58, name: '우리 마을', semester: 2 })(p);
    expect(p.adapt).toBe(20);
    expect(p.autonomy[3]).toEqual({ hours: 58, name: '우리 마을', semester: 2 });
    const titles = validate(p).map((c) => c.title);
    expect(titles).toContain('1~2학년군 안전교육 시수 확인');
    expect(titles).toContain('5~6학년군 정보교육 시수 부족');
    expect(validate(p).find((c) => c.title.startsWith('학교자율시간'))?.detail).toBe('4·5·6학년');
  });

  it('학교 정보·학급수·학년도', () => {
    let p = E.setInfoFields({ school: '새빛초', name: '', minutes: 0 })(fresh());
    expect(p).toMatchObject({ school: '새빛초', name: '2026학년도 교육과정', minutes: 40 });
    p = E.setClasses(3, 4)(p);
    expect(p.classes[3]).toBe(4);
    const moved = E.changeYear(2027)(p);
    expect(moved.name).toBe('2027학년도 교육과정');
    expect(moved.calendar.s1s).toBe('2027-03-02');
    expect(E.changeYear(2026)(p)).toBe(p);
  });

  it('재량휴업일·임시공휴일 추가와 삭제, 중복은 무시', () => {
    let p = E.addDiscretionary('2026-06-05', ' 개교기념일 ')(fresh());
    expect(p.calendar.disc.at(-1)).toEqual({ date: '2026-06-05', name: '개교기념일' });
    expect(E.addDiscretionary('2026-06-05', 'x')(p)).toBe(p);
    expect(E.addDiscretionary('bad', 'x')(p)).toBe(p);
    p = E.removeDiscretionary('2026-06-05')(p);
    p = E.addExtraHoliday('2026-04-15', '')(p);
    expect(p.calendar.extra).toEqual([{ date: '2026-04-15', name: '임시공휴일' }]);
    expect(E.addExtraHoliday('2026-04-15', 'x')(p)).toBe(p);
    expect(E.removeExtraHoliday('2026-04-15')(p).calendar.extra).toEqual([]);
    expect(E.toggleHoliday('2026-06-03')(E.toggleHoliday('2026-06-03')(p)).calendar.excluded).toEqual([]);
  });
});

describe('불러오기 검증', () => {
  it('이전 아티팩트에서 내보낸 JSON을 읽는다', () => {
    const legacy = {
      id: 'p1', name: '옛 편제', school: '한빛초', year: 2026, minutes: 40,
      classes: { 1: 3 }, alloc: { 1: { 국어: [130, 120] } }, cca: { 1: [85, 24, 10] },
      safety: { 1: 32, 2: 32 }, adapt: { 1: 5 }, info: { 5: 17, 6: 17 },
      autonomy: { 5: { hours: 64, name: '코딩', semester: 3 } },
      calendar: { s1s: '2026-03-03', s1e: '2026-07-24', s2s: '2026-08-24', s2e: '2026-12-31', s3s: '', s3e: '', disc: [{ date: '2026-05-01', name: '근로자의 날' }], extra: [], excluded: [] },
      weekly: { 5: { perDay: [6, 7, 6, 7, 6], weeks: [17, 17], hours: { 국어: [6, 6], 학교자율시간: [2, 2] }, grid: [['국어', '<img onerror=x>']] } },
    };
    const p = normalizeProject(legacy)!;
    expect(p.alloc[1]['국어']).toEqual([130, 120]);
    expect(p.alloc[2]['국어']).toEqual([121, 120]);
    expect(p.classes).toMatchObject({ 1: 3, 2: 2 });
    expect(p.adapt).toBe(5);
    expect(p.autonomy[5]).toEqual({ hours: 64, name: '코딩', semester: 3 });
    expect(p.calendar.s3s).toBe('');
    expect(p.weekly[5].hours['학교자율시간']).toBeUndefined();
    // 이전 버전의 학교자율시간 배당은 교과 시수 안에서 다시 계산한다
    expect(p.weekly[5].grid?.flat()).not.toContain('<img onerror=x>');
    expect(weeklyStats(p, 5).slotsMatch).toBe(true);
    expect(legacyAutonomyGrades(legacy)).toEqual([5]);
  });

  it('형식이 아니면 null, 이상한 숫자는 안전한 값으로', () => {
    expect(normalizeProject(null)).toBeNull();
    expect(normalizeProject({ name: 'x' })).toBeNull();
    const p = normalizeProject({ alloc: { 3: { 국어: [-5, 'abc'] } }, year: 1999, minutes: 999, calendar: { s1s: 'nope', disc: 'x' }, weekly: { 3: { perDay: [1, 2] } } })!;
    expect(p.alloc[3]['국어']).toEqual([0, 102]);
    expect(p.year).toBe(2026);
    expect(p.minutes).toBe(60);
    expect(p.calendar.s1s).toBe('2026-03-03');
    expect(p.calendar.disc).toEqual([]);
    expect(p.weekly[3].perDay).toEqual([6, 6, 6, 6, 5]);
  });

  it('num 도우미', () => {
    expect(num('3.6')).toBe(4);
    expect(num('', 7)).toBe(7);
    expect(num(6.3, 0, 0.5)).toBe(6.5);
    expect(num(Infinity, 2)).toBe(2);
    expect(splitHalf(119)).toEqual([60, 59]);
    expect(defaultCca(5, 102)).toEqual([51, 34, 17]);
  });
});

describe('날짜 도우미·CSV', () => {
  it('날짜', () => {
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate(20260301)).toBe(false);
    expect(eachDay('2026-03-01', '2026-03-03')).toHaveLength(3);
    expect(eachDay('2026-03-03', '2026-03-01')).toEqual([]);
    expect(inSchoolYear('2027-02-28', 2026)).toBe(true);
    expect(inSchoolYear('2026-02-28', 2026)).toBe(false);
    expect(monthDay('2026-03-02')).toBe('03/02');
    expect(monthDay('')).toBe('');
  });

  it('CSV는 교과별 학기 시수와 연간 합계를 담는다', () => {
    const csv = toCsv(fresh());
    const lines = csv.split('\r\n');
    expect(lines[0]).toMatch(/^"구분","1학년 1학기"/);
    expect(lines.find((l) => l.startsWith('"국어"'))).toContain('"121","120","241"');
    expect(lines.at(-1)).toMatch(/"5892"$/);
    expect(subjectsOf(1)).toContain('바른 생활');
  });
});

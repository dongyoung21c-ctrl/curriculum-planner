import { GRADES, GROUP_KEYS, STANDARDS } from '../../data/standards';
import { calendarStats } from '../../domain/calendar';
import { ccaTotal, fmt, gradeGroupTotal, gradeTotal, minTotal } from '../../domain/hours';
import { ruleChanges } from '../../domain/rules';
import { countLevels, validate, type CheckLevel } from '../../domain/validate';
import { useStore } from '../../state/store';
import { Chip } from '../common';
import { viewHash } from '../route';

const ICON: Record<CheckLevel, string> = { ok: '✓', warn: '!', bad: '✕', info: 'i' };
const LEVEL_NAME: Record<CheckLevel, string> = { ok: '충족', warn: '확인 필요', bad: '기준 위반', info: '참고' };
const CAL_MAX = 210;

export function Overview() {
  const { project: p } = useStore();
  if (!p) return null;
  const checks = validate(p);
  const n = countLevels(checks);
  const cs = calendarStats(p);
  const classSum = GRADES.reduce((a, g) => a + p.classes[g], 0);
  const ccaSum = GRADES.reduce((a, g) => a + ccaTotal(p, g), 0);
  const allSum = GRADES.reduce((a, g) => a + gradeTotal(p, g), 0);
  const autoSum = ([3, 4, 5, 6] as const).reduce((a, g) => a + p.autonomy[g].hours, 0);
  const MIN_SCHOOL_DAYS = p.rules.minSchoolDays;
  const WEEKS = p.rules.weeks;
  const changed = ruleChanges(p.rules);

  return (
    <>
      {changed.length > 0 && (
        <p class="note">
          <b>바꾼 기준으로 검토 중</b> · {changed.join(' · ')} · <a href={viewHash('rules')}>시수 기준 설정</a>
        </p>
      )}
      <div class="kpis">
        <div class="kpi">
          <div class="l">편성 검토 결과</div>
          <div class="v" style={{ color: n.bad ? 'var(--bad)' : n.warn ? 'var(--warn)' : 'var(--ok)' }}>
            {n.bad ? <>{n.bad}<small>건 위반</small></> : n.warn ? <>{n.warn}<small>건 확인 필요</small></> : '적합'}
          </div>
          <div class="m">
            {n.bad > 0 && <Chip level="bad">기준 위반</Chip>}
            {n.warn > 0 && <Chip level="warn">확인 {n.warn}건</Chip>}
            {!n.bad && !n.warn && <Chip level="ok">모든 기준 충족</Chip>}
          </div>
        </div>
        <div class="kpi">
          <div class="l">연간 수업일수</div>
          <div class="v num">{cs.total}<small>일</small></div>
          <div class="bar" role="img" aria-label={`기준 ${MIN_SCHOOL_DAYS}일 중 ${cs.total}일`}>
            <i class={cs.total >= MIN_SCHOOL_DAYS ? 'ok' : 'bad'} style={{ width: `${Math.min(100, (cs.total / CAL_MAX) * 100)}%` }} />
            <span class="std" style={{ left: `${(MIN_SCHOOL_DAYS / CAL_MAX) * 100}%` }} />
          </div>
          <div class="m">{cs.terms.map((t) => `${t.name} ${t.days}일`).join(' · ')} · 기준 {MIN_SCHOOL_DAYS}일</div>
        </div>
        {GROUP_KEYS.map((gk) => {
          const S = { ...STANDARDS[gk], total: minTotal(p, gk) };
          const t = gradeGroupTotal(p, gk);
          return (
            <div class="kpi" key={gk}>
              <div class="l">{S.label} 총 수업시간</div>
              <div class="v num">{fmt(t)}<small>/ {fmt(S.total)}</small></div>
              <div class="bar" role="img" aria-label={`최소 ${fmt(S.total)}시간 중 ${fmt(t)}시간`}>
                <i class={t < S.total ? 'bad' : 'ok'} style={{ width: `${Math.min(100, (t / S.total) * 90)}%` }} />
                <span class="std" style={{ left: '90%' }} />
              </div>
              <div class="m">
                {t >= S.total ? <Chip level="ok">기준 충족</Chip> : <Chip level="bad">{fmt(S.total - t)}시간 부족</Chip>}
                <span class="hint">1시간 = {p.minutes}분</span>
              </div>
            </div>
          );
        })}
      </div>
      <div class="grid2">
        <section class="panel" aria-label="편성 기준 검토">
          <div class="ph">
            <div class="grow">
              <h2>편성 기준 검토</h2>
              <div class="sub">2022 개정 교육과정 총론 편성·운영 기준과 초·중등교육법 시행령으로 자동 검토해요.</div>
            </div>
          </div>
          <ul class="pb checks" style={{ listStyle: 'none', margin: 0 }}>
            {checks.map((c, i) => (
              <li key={i} class={`check ${c.level}`}>
                <div class="ic" aria-label={LEVEL_NAME[c.level]}>{ICON[c.level]}</div>
                <div class="tx">
                  <b>{c.title}</b>
                  <div class="d">{c.detail}</div>
                </div>
                <a class="go" href={viewHash(c.view)}>이동 ›</a>
              </li>
            ))}
          </ul>
        </section>
        <div class="col">
          <section class="panel" aria-label="학년별 연간 시수 요약">
            <div class="ph">
              <div class="grow">
                <h2>학년별 연간 시수 요약</h2>
                <div class="sub">교과 + 창의적 체험활동 · 단위: 시간</div>
              </div>
            </div>
            <div class="tw">
              <table class="t" style={{ minWidth: '520px' }}>
                <thead>
                  <tr><th class="l">학년</th><th>학급수</th><th>교과</th><th>창체</th><th>학교자율</th><th>연간 계</th><th>주당({WEEKS}주)</th></tr>
                </thead>
                <tbody>
                  {GRADES.map((g) => {
                    const tot = gradeTotal(p, g);
                    const c = ccaTotal(p, g);
                    const au = g >= 3 ? p.autonomy[g as 3 | 4 | 5 | 6].hours : 0;
                    return (
                      <tr key={g}>
                        <td class="l">{g}학년</td><td>{p.classes[g]}</td><td>{fmt(tot - c)}</td><td>{fmt(c)}</td><td>{au ? fmt(au) : '–'}</td>
                        <td><b>{fmt(tot)}</b></td><td>{(tot / WEEKS).toFixed(1)}</td>
                      </tr>
                    );
                  })}
                  <tr class="total">
                    <td class="l">계</td><td>{classSum}</td><td>{fmt(allSum - ccaSum)}</td><td>{fmt(ccaSum)}</td><td>{autoSum ? fmt(autoSum) : '–'}</td><td>{fmt(allSum)}</td><td />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <div class="note">
            <b>편성 순서</b> ① 설정에서 학급수 확인 → ② 편제표에서 학년·학기별 시수 조정(±20%) → ③ 창체 영역·안전·정보·학교자율시간 배분 → ④ 학사일정으로 수업일수 190일 확보 → ⑤ 주당 시수 배당으로 실제 운영 가능성 확인 → ⑥ 편제표 인쇄 후 교육과정위원회 심의
          </div>
        </div>
      </div>
    </>
  );
}

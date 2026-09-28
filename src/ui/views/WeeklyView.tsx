import { useState } from 'preact/hooks';
import { GRADES, shortName, subjectsOf } from '../../data/standards';
import { calendarStats } from '../../domain/calendar';
import { rebuildGrid, setGridCell, setPerDay, setWeeklyHours, setWeeks, weeklyFromPlan, weeksForAllGrades } from '../../domain/edits';
import { fmt, gradeTotal, signed } from '../../domain/hours';
import type { GradeNo, Project } from '../../domain/types';
import { gridCheck, weeklyStats, type WeeklyRow } from '../../domain/weekly';
import { useStore } from '../../state/store';
import { Chip, NumInput, Panel, useConfirm, useToast } from '../common';

const DAYS = ['월', '화', '수', '목', '금'];
const round1 = (n: number) => Math.round(n * 10) / 10;

function RowNote({ r }: { r: WeeklyRow }) {
  if (Math.abs(r.diff) < 0.05) return <Chip level="ok">일치</Chip>;
  if (r.diff < 0) return <Chip level="warn">{Math.abs(r.diff)}시간 추가 배당 필요</Chip>;
  return <Chip level="info">{r.diff}시간 여유</Chip>;
}

export function WeeklyView() {
  const { project: p, edit } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [g, setG] = useState<GradeNo>(1);
  if (!p) return null;
  const w = p.weekly[g];
  const ws = weeklyStats(p, g);
  const cs = calendarStats(p);

  const pullWeeks = () => {
    const [t1, t2, t3] = cs.terms;
    const weeks = [t1?.weeks ?? 0, round1((t2?.weeks ?? 0) + (t3?.weeks ?? 0))] as const;
    confirm({
      title: '학사일정 주수 가져오기',
      message: `학사일정 기준 1학기 ${weeks[0]}주, 2학기 ${weeks[1]}주(학년말 포함)를 0.5주 단위로 맞춰 1~6학년 모두에 넣어요.`,
      okLabel: '모든 학년에 넣기',
      onOk: () => {
        edit(weeksForAllGrades(weeks));
        toast('모든 학년의 학기 주수를 학사일정에 맞췄어요.');
      },
    });
  };
  const autoAssign = () =>
    confirm({
      title: '편제 ÷ 주수로 자동 배당',
      message: `${g}학년 주당 시수를 편제 시수에 맞춰 다시 정하고 시간표 예시도 다시 짜요. 직접 고친 주당 시수와 시간표는 사라져요.`,
      okLabel: '다시 배당',
      onOk: () => {
        edit(weeklyFromPlan(g));
        toast('편제 시수를 주수로 나눠 0.5 단위로 배당하고 시간표를 다시 짰어요.');
      },
    });

  return (
    <>
      <Panel
        title="학년별 주당 시수 배당"
        sub="주당 시수 × 학기 주수 = 연간 운영 시수. 편제 시수와 차이를 보고 추가 배당할 학기·주간을 정해요."
        actions={
          <>
            <button type="button" class="btn sm" onClick={autoAssign}>
              편제 ÷ 주수로 자동 배당
            </button>
            <button type="button" class="btn sm" onClick={pullWeeks}>학사일정 주수 가져오기(전 학년)</button>
          </>
        }
      >
        <div class="pb" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <div class="tabs" role="tablist" aria-label="학년">
            {GRADES.map((x) => (
              <button key={x} type="button" role="tab" aria-selected={x === g} class={x === g ? 'on' : ''} onClick={() => setG(x)}>
                {x}학년
              </button>
            ))}
          </div>
        </div>
        <div class="pb">
          <div class="grid2">
            <div>
              <h3 style={{ marginBottom: '8px' }}>요일별 교시 수</h3>
              <div class="days">
                {DAYS.map((d, i) => (
                  <div class="dy" key={d}>
                    <b aria-hidden="true">{d}</b>
                    <NumInput label={`${d}요일 교시 수`} value={w.perDay[i] ?? 0} max={12} onChange={(v) => edit(setPerDay(g, i, v))} />
                  </div>
                ))}
              </div>
              <div class="hint" style={{ marginTop: '8px' }}>주당 총 <b>{ws.slots}</b>교시 · 1교시 {p.minutes}분</div>
            </div>
            <div>
              <h3 style={{ marginBottom: '8px' }}>학기별 수업 주수</h3>
              <div class="row" style={{ gap: '12px', alignItems: 'flex-end' }}>
                <div class="field"><span>1학기 주수</span><NumInput label="1학기 주수" step={0.5} value={w.weeks[0]} onChange={(v) => edit(setWeeks(g, 0, v))} /></div>
                <div class="field"><span>2학기 주수</span><NumInput label="2학기 주수" step={0.5} value={w.weeks[1]} onChange={(v) => edit(setWeeks(g, 1, v))} /></div>
                <div class="hint" style={{ paddingBottom: '8px' }}>
                  학사일정 기준: {cs.terms.map((t) => `${t.name} ${t.weeks}주`).join(' · ')}
                  <br />연간 기준 {p.rules.weeks}주
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="tw">
          <table class="t" style={{ minWidth: '720px' }}>
            <thead>
              <tr>
                <th class="l">교과</th><th>편제 연간</th><th class="sep">1학기 주당</th><th>2학기 주당</th>
                <th class="sep">1학기 운영</th><th>2학기 운영</th><th>연간 운영</th><th>차이</th><th>비고</th>
              </tr>
            </thead>
            <tbody>
              {ws.rows.map((r) => (
                <tr key={r.subject}>
                  <td class="l">{r.subject}</td>
                  <td>{fmt(r.planned)}</td>
                  <td class="sep"><NumInput label={`${r.subject} 1학기 주당`} step={0.5} value={r.hours[0]} onChange={(v) => edit(setWeeklyHours(g, r.subject, 0, v))} /></td>
                  <td><NumInput label={`${r.subject} 2학기 주당`} step={0.5} value={r.hours[1]} onChange={(v) => edit(setWeeklyHours(g, r.subject, 1, v))} /></td>
                  <td class="sep calc">{(r.hours[0] * w.weeks[0]).toFixed(1)}</td>
                  <td class="calc">{(r.hours[1] * w.weeks[1]).toFixed(1)}</td>
                  <td><b>{r.operated.toFixed(1)}</b></td>
                  <td class={r.diff > 0 ? 'pos' : r.diff < 0 ? 'neg' : ''}>{r.diff ? signed(r.diff) : '0'}</td>
                  <td><RowNote r={r} /></td>
                </tr>
              ))}
              <tr class="total">
                <td class="l">주당 합계</td>
                <td>{fmt(gradeTotal(p, g))}</td>
                <td class="sep">{ws.weeklySum[0]}</td>
                <td>{ws.weeklySum[1]}</td>
                <td class="sep">{ws.rows.reduce((a, r) => a + r.hours[0] * w.weeks[0], 0).toFixed(1)}</td>
                <td>{ws.rows.reduce((a, r) => a + r.hours[1] * w.weeks[1], 0).toFixed(1)}</td>
                <td>{ws.rows.reduce((a, r) => a + r.operated, 0).toFixed(1)}</td>
                <td />
                <td>{ws.slotsMatch ? <Chip level="ok">교시 수 일치</Chip> : <Chip level="warn">교시 {ws.slots} vs {ws.weeklySum[0]}/{ws.weeklySum[1]}</Chip>}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pb hint">
          주당 시수 합계가 요일별 교시 수 합계와 같아야 시간표를 짤 수 있어요. 0.5는 격주 운영(2주에 1시간)이에요. 연간 운영이 편제보다 적으면 부족한 만큼 특정 주간(교과 집중 주간 등)에 더 배당하세요.
        </div>
      </Panel>
      <Timetable p={p} g={g} />
    </>
  );
}

function Timetable({ p, g }: { p: Project; g: GradeNo }) {
  const { edit } = useStore();
  const confirm = useConfirm();
  const w = p.weekly[g];
  const grid = w.grid ?? [];
  const maxPeriods = Math.max(1, ...w.perDay);
  const gc = gridCheck(g, w);
  const subjects = subjectsOf(g);
  return (
    <Panel
      title={`${g}학년 주간 시간표 예시 (1학기)`}
      sub="1학기 주당 시수를 요일별 교시에 자동으로 넣은 예시예요. 칸을 눌러 교과를 바꿀 수 있어요. 실제 학급 시간표를 짜기 전 확인용이에요."
      actions={
        <button
          type="button"
          class="btn sm"
          onClick={() =>
            confirm({ title: '자동 재배치', message: `${g}학년 시간표 예시를 주당 시수에 맞춰 다시 짜요. 직접 바꾼 칸은 사라져요.`, okLabel: '다시 짜기', onOk: () => edit(rebuildGrid(g)) })
          }
        >
          자동 재배치
        </button>
      }
    >
      <div class="pb tw">
        <table class="tt">
          <thead>
            <tr>
              <th style={{ width: '44px' }}>교시</th>
              {DAYS.map((d, i) => <th key={d}>{d} <span class="hint">({w.perDay[i] ?? 0})</span></th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxPeriods }, (_, pi) => (
              <tr key={pi}>
                <td class="pn">{pi + 1}</td>
                {DAYS.map((d, di) => {
                  if (pi >= (w.perDay[di] ?? 0)) return <td key={d} class="off" aria-label="수업 없음" />;
                  const v = grid[di]?.[pi] ?? '';
                  return (
                    <td key={d} class={`s-${shortName(v)}`}>
                      <select aria-label={`${d}요일 ${pi + 1}교시`} value={v} onChange={(e) => edit(setGridCell(g, di, pi, e.currentTarget.value))}>
                        <option value="">–</option>
                        {subjects.map((s) => <option key={s} value={s}>{shortName(s)}</option>)}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div class="hint row" style={{ marginTop: '10px' }} aria-live="polite">
          {gc.empty === 0 && gc.mismatches.length === 0 ? (
            <>
              <Chip level="ok">시간표가 1학기 주당 시수와 맞아요</Chip>
              {gc.alternating.length > 0 && <span>격주 교과: {gc.alternating.map(shortName).join('·')} (한 칸을 격주로 번갈아 운영)</span>}
            </>
          ) : (
            <>
              {gc.empty > 0 && <Chip level="warn">빈 칸 {gc.empty}</Chip>}
              {gc.mismatches.map((m) => (
                <Chip key={m.subject} level={m.have < m.want ? 'warn' : 'info'}>{shortName(m.subject)} {m.have}/{m.want}</Chip>
              ))}
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

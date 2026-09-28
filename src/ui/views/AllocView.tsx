import { useState } from 'preact/hooks';
import { GROUP_KEYS, STANDARDS } from '../../data/standards';
import { resetToStandard, setAlloc, splitEvenly } from '../../domain/edits';
import { annual, fmt, gradeGroupTotal, gradeSemesterTotal, gradeTotal, groupGradeSum, groupStatus, minTotal, semesterHours, signed } from '../../domain/hours';
import { groupsOf } from '../../domain/rules';
import type { GradeGroupKey, Project, SubjectGroup } from '../../domain/types';
import { useStore } from '../../state/store';
import { Chip, NumInput, Panel, useConfirm, useToast } from '../common';
import { SummaryTable } from './SummaryTable';

const diffClass = (d: number) => (d > 0 ? 'pos' : d < 0 ? 'neg' : '');

export function GroupTabs({ value, onChange }: { value: GradeGroupKey; onChange: (k: GradeGroupKey) => void }) {
  return (
    <div class="tabs" role="tablist" aria-label="학년군">
      {GROUP_KEYS.map((k) => (
        <button key={k} type="button" role="tab" aria-selected={k === value} class={k === value ? 'on' : ''} onClick={() => onChange(k)}>
          {STANDARDS[k].label}
        </button>
      ))}
    </div>
  );
}

export function AllocView() {
  const { project: p, edit } = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const [gk, setGk] = useState<GradeGroupKey>('1-2');
  if (!p) return null;
  const S = STANDARDS[gk];
  const tot = gradeGroupTotal(p, gk);
  const min = minTotal(p, gk);
  const max = p.rules.maxChangePct;

  return (
    <>
      <Panel
        title="학년군별 편제 및 시간 배당"
        sub={`학기별 시수를 넣으면 학년군 합계와 기준 대비 증감률을 바로 검토해요. 교과(군) ±${max}% 이내, 감축 불가 교과(군), 학년군 총 시수는 최소 기준. 기준은 “시수 기준 설정”에서 바꿀 수 있어요.`}
        actions={
          <>
            <button
              type="button"
              class="btn sm"
              onClick={() =>
                confirm({
                  title: '학기 균등 분할',
                  message: `${S.label}의 모든 교과를 연간 시수는 그대로 두고 1·2학기로 똑같이 나눠요. 학기별로 다르게 넣은 값은 사라져요.`,
                  okLabel: '나누기',
                  onOk: () => {
                    edit(splitEvenly(gk));
                    toast('학기 시수를 똑같이 나눴어요.');
                  },
                })
              }
            >
              학기 균등 분할
            </button>
            <button
              type="button"
              class="btn sm"
              onClick={() =>
                confirm({
                  title: '기준 시수로 초기화',
                  message: `${S.label} 시수를 2022 개정 기준 시수로 되돌릴까요? 입력한 값은 사라져요.`,
                  okLabel: '초기화',
                  danger: true,
                  onOk: () => {
                    edit(resetToStandard(gk));
                    toast(`${S.label}을 기준 시수로 되돌렸어요.`);
                  },
                })
              }
            >
              기준 시수로 초기화
            </button>
          </>
        }
      >
        <div class="pb" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <GroupTabs value={gk} onChange={setGk} />
        </div>
        <div class="tw">
          <table class="t" style={{ minWidth: '920px' }}>
            <thead>
              <tr>
                <th class="l" rowSpan={2} style={{ minWidth: '170px' }}>교과(군) / 교과</th>
                {S.grades.map((g) => <th key={g} colSpan={3} class="sep">{g}학년</th>)}
                <th rowSpan={2} class="sep">학년군<br />편성</th>
                <th rowSpan={2}>기준<br />시수</th>
                <th rowSpan={2}>증감</th>
                <th rowSpan={2}>증감률</th>
                <th rowSpan={2}>판정</th>
              </tr>
              <tr>
                {S.grades.map((g) => [<th key={`${g}a`} class="sep">1학기</th>, <th key={`${g}b`}>2학기</th>, <th key={`${g}c`}>계</th>])}
              </tr>
            </thead>
            <tbody>
              {groupsOf(p.rules, gk).map((grp) => <GroupRows key={grp.key} p={p} gk={gk} grp={grp} />)}
              <tr class="total">
                <td class="l">학년군 총 수업시간 수</td>
                {S.grades.map((g) => [
                  <td key={`${g}a`} class="sep">{fmt(gradeSemesterTotal(p, g, 0))}</td>,
                  <td key={`${g}b`}>{fmt(gradeSemesterTotal(p, g, 1))}</td>,
                  <td key={`${g}c`}>{fmt(gradeTotal(p, g))}</td>,
                ])}
                <td class="sep">{fmt(tot)}</td>
                <td>{fmt(min)}</td>
                <td class={diffClass(tot - min)}>{tot - min ? signed(tot - min) : '0'}</td>
                <td />
                <td><Chip level={tot < min ? 'bad' : 'ok'}>{tot < min ? '최소 미달' : '충족'}</Chip></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pb hint row" style={{ gap: '16px' }}>
          <span><Chip level="ok">기준</Chip> 기준 시수와 같음</span>
          <span><Chip level="info">+5%</Chip> {max}% 이내 증감</span>
          <span><Chip level="bad">{max}% 초과</Chip> 편성 불가</span>
          <span><Chip level="bad">감축 불가</Chip> 감축 불가 교과(군) 기준 미달</span>
        </div>
      </Panel>
      <Panel title="전체 학년 연간 편제표" sub="인쇄용 편제표의 바탕이 되는 연간 시수 요약">
        <div class="tw">
          <SummaryTable p={p} />
        </div>
      </Panel>
    </>
  );
}

function GroupRows({ p, gk, grp }: { p: Project; gk: GradeGroupKey; grp: SubjectGroup }) {
  const { edit } = useStore();
  const S = STANDARDS[gk];
  const st = groupStatus(p, gk, grp);
  const multi = grp.subs.length > 1;
  const inputs = (g: (typeof S.grades)[number], s: string) => [
    <td key={`${g}a`} class="sep">
      <NumInput label={`${g}학년 ${s} 1학기`} value={semesterHours(p, g, s, 0)} onChange={(v) => edit(setAlloc(g, s, 0, v))} width={64} />
    </td>,
    <td key={`${g}b`}>
      <NumInput label={`${g}학년 ${s} 2학기`} value={semesterHours(p, g, s, 1)} onChange={(v) => edit(setAlloc(g, s, 1, v))} width={64} />
    </td>,
  ];
  return (
    <>
      <tr class="grp">
        <td class="l">
          {grp.key}
          {grp.note && <span class="hint"> · {grp.note}</span>}
        </td>
        {S.grades.map((g) =>
          multi
            ? [
                <td key={`${g}a`} class="calc sep">{fmt(groupGradeSum(p, g, grp, 0))}</td>,
                <td key={`${g}b`} class="calc">{fmt(groupGradeSum(p, g, grp, 1))}</td>,
                <td key={`${g}c`}><b>{fmt(groupGradeSum(p, g, grp))}</b></td>,
              ]
            : [...inputs(g, grp.subs[0] ?? ''), <td key={`${g}c`}><b>{fmt(groupGradeSum(p, g, grp))}</b></td>],
        )}
        <td class="sep"><b>{fmt(st.sum)}</b></td>
        <td class="calc">{fmt(grp.std)}</td>
        <td class={diffClass(st.diff)}>{st.diff ? signed(st.diff) : '0'}</td>
        <td class={diffClass(st.diff)}>{st.diff ? `${signed(st.pct)}%` : '0%'}</td>
        <td><Chip level={st.level}>{st.label}</Chip></td>
      </tr>
      {multi &&
        grp.subs.map((s) => (
          <tr class="sub" key={s}>
            <td class="l">{s}</td>
            {S.grades.map((g) => [...inputs(g, s), <td key={`${g}c`} class="calc">{fmt(annual(p, g, s))}</td>])}
            <td class="sep calc">{fmt(S.grades.reduce((a, g) => a + annual(p, g, s), 0))}</td>
            <td /><td /><td /><td />
          </tr>
        ))}
    </>
  );
}

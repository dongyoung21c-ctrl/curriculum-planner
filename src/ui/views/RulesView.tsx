import { useState } from 'preact/hooks';
import { STANDARDS } from '../../data/standards';
import { setRules } from '../../domain/edits';
import { fmt } from '../../domain/hours';
import { defaultRules, ruleChanges, setGroupRule, setGroupTotal, setScalarRule, stdSum, type Rules, type ScalarRule } from '../../domain/rules';
import type { GradeGroupKey } from '../../domain/types';
import { useStore } from '../../state/store';
import { Chip, NumInput, Panel, useConfirm, useToast } from '../common';
import { GroupTabs } from './AllocView';

const SCALARS: readonly { key: ScalarRule; label: string; unit: string; hint: string }[] = [
  { key: 'maxChangePct', label: '교과(군) 증감 허용 범위', unit: '±%', hint: '기준 시수에서 늘리거나 줄일 수 있는 비율' },
  { key: 'minSchoolDays', label: '연간 최소 수업일수', unit: '일', hint: '초·중등교육법 시행령 제45조' },
  { key: 'safetyMin', label: '1~2학년군 안전교육', unit: '시간 이상', hint: '창의적 체험활동 안에서' },
  { key: 'infoMin', label: '5~6학년군 정보교육', unit: '시간 이상', hint: '실과 안에서' },
  { key: 'weeks', label: '연간 수업 주수', unit: '주', hint: '주당 평균·학교자율시간 권장 시수 계산에 써요' },
];

export function RulesView() {
  const { project: p, edit } = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const [gk, setGk] = useState<GradeGroupKey>('1-2');
  if (!p) return null;
  const r = p.rules;
  const d = defaultRules();
  const changes = ruleChanges(r);
  const change = (fn: (x: Rules) => Rules) => edit(setRules(fn));

  return (
    <>
      <Panel
        title="시수 기준"
        sub="기본값은 2022 개정 교육과정(교육부 고시 제2022-33호)이에요. 고시가 바뀌거나 시·도 지침이 다르면 이 프로젝트의 기준을 바꾸세요. 바꾼 기준으로 검토하고, 인쇄물과 JSON 백업에도 함께 남아요."
        actions={
          <button
            type="button"
            class="btn sm"
            disabled={changes.length === 0}
            onClick={() =>
              confirm({
                title: '기본값으로 되돌리기',
                message: '이 프로젝트의 시수 기준을 모두 2022 개정 교육과정 기본값으로 되돌릴까요?',
                okLabel: '되돌리기',
                danger: true,
                onOk: () => {
                  edit(setRules(() => defaultRules()));
                  toast('기준을 기본값으로 되돌렸어요.');
                },
              })
            }
          >
            2022 개정 기본값으로 되돌리기
          </button>
        }
      >
        <div class="pb">
          {changes.length ? (
            <p class="note"><b>기본값과 다른 기준 {changes.length}개</b> · {changes.join(' · ')}</p>
          ) : (
            <p class="hint"><Chip level="ok">기본값</Chip> 2022 개정 교육과정 기준을 그대로 쓰고 있어요.</p>
          )}
        </div>
        <div class="pb" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <GroupTabs value={gk} onChange={setGk} />
        </div>
        <div class="tw">
          <table class="t" style={{ minWidth: '520px' }}>
            <thead>
              <tr><th class="l">교과(군)</th><th>기준 시수</th><th>기본값</th><th>감축 불가</th></tr>
            </thead>
            <tbody>
              {STANDARDS[gk].groups.map((g) => {
                const cur = r.gradeGroups[gk].groups[g.key] ?? { std: g.std, noCut: Boolean(g.noCut) };
                const def = d.gradeGroups[gk].groups[g.key];
                return (
                  <tr key={g.key}>
                    <td class="l">{g.key}</td>
                    <td><NumInput label={`${STANDARDS[gk].label} ${g.key} 기준 시수`} value={cur.std} onChange={(v) => change(setGroupRule(gk, g.key, { std: v }))} /></td>
                    <td class={cur.std !== def?.std ? 'pos' : 'calc'}>{fmt(def?.std ?? 0)}</td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${STANDARDS[gk].label} ${g.key} 감축 불가`}
                        checked={cur.noCut}
                        onChange={(e) => change(setGroupRule(gk, g.key, { noCut: e.currentTarget.checked }))}
                      />
                    </td>
                  </tr>
                );
              })}
              <tr class="total">
                <td class="l">학년군 최소 총 수업시간 수</td>
                <td><NumInput label={`${STANDARDS[gk].label} 최소 총 수업시간 수`} value={r.gradeGroups[gk].total} onChange={(v) => change(setGroupTotal(gk, v))} /></td>
                <td>{fmt(d.gradeGroups[gk].total)}</td>
                <td>
                  {stdSum(r, gk) === r.gradeGroups[gk].total ? (
                    <Chip level="ok">교과(군) 합계와 같음</Chip>
                  ) : (
                    <Chip level="warn">교과(군) 합계 {fmt(stdSum(r, gk))}</Chip>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pb hint">교과(군) 구성(어떤 교과가 어느 교과(군)에 드는지)은 바꿀 수 없고, 시수와 감축 불가 여부만 바꿀 수 있어요.</div>
      </Panel>
      <Panel title="그 밖의 기준">
        <div class="tw">
          <table class="t" style={{ minWidth: '520px' }}>
            <thead>
              <tr><th class="l">항목</th><th>값</th><th>기본값</th><th class="l">설명</th></tr>
            </thead>
            <tbody>
              {SCALARS.map((s) => (
                <tr key={s.key}>
                  <td class="l">{s.label}</td>
                  <td>
                    <span class="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      <NumInput label={s.label} value={r[s.key]} onChange={(v) => change(setScalarRule(s.key, v))} />
                      <span class="hint">{s.unit}</span>
                    </span>
                  </td>
                  <td class={r[s.key] !== d[s.key] ? 'pos' : 'calc'}>{d[s.key]}</td>
                  <td class="l hint">{s.hint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

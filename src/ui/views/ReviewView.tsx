import { useMemo, useState } from 'preact/hooks';
import { ALL_SUBJECTS, CCA, GRADES, shortName, subjectsOf } from '../../data/standards';
import { fmt } from '../../domain/hours';
import { newProject, splitHalf } from '../../domain/project';
import { defaultRules, ruleChanges } from '../../domain/rules';
import { countLevels, type CheckLevel } from '../../domain/validate';
import type { GradeNo, Pair, Project } from '../../domain/types';
import { reviewValues, setReviewValue, toReviewValues, type ReviewValues } from '../../review/interpret';
import { ACCEPT, readReviewFile } from '../../review/readFile';
import type { Extracted } from '../../review/interpret';
import { useStore } from '../../state/store';
import { Chip, Panel, useToast } from '../common';
import { viewHash } from '../route';

const ICON: Record<CheckLevel, string> = { ok: '✓', warn: '!', bad: '✕', info: 'i' };
const ROWS = [...ALL_SUBJECTS, CCA];

type Loaded = { fileName: string; plans: Extracted[]; index: number; values: ReviewValues };

export function ReviewView() {
  const { project, dispatch } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const rules = project?.rules ?? defaultRules();
  const result = useMemo(() => (loaded ? reviewValues(loaded.values, rules) : null), [loaded, rules]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const r = await readReviewFile(file);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      setLoaded(null);
      return;
    }
    setLoaded({ fileName: file.name, plans: r.plans, index: 0, values: toReviewValues(r.plans[0]!) });
  };

  const choosePlan = (index: number) => {
    if (!loaded) return;
    const plan = loaded.plans[index];
    if (plan) setLoaded({ ...loaded, index, values: toReviewValues(plan) });
  };

  const makeProject = () => {
    if (!loaded || !result) return;
    const base = newProject({ name: `${loaded.fileName.replace(/\.[^.]+$/, '')} (검토본)` });
    const alloc = Object.fromEntries(GRADES.map((g) => [g, Object.fromEntries(subjectsOf(g).map((s) => [s, splitHalf(loaded.values[g][s] ?? 0) as Pair]))])) as unknown as Project['alloc'];
    dispatch({ type: 'import', projects: [{ ...base, alloc, rules }] });
    toast('검토한 시수로 새 프로젝트를 만들었어요. 학기별 시수는 반씩 나눠 두었어요.');
    window.location.hash = viewHash('alloc');
  };

  const n = result ? countLevels(result.checks) : null;
  const changes = ruleChanges(rules);

  return (
    <>
      <Panel
        title="완성된 편제표 파일 검토"
        sub="편제표가 든 파일을 올리면 교과별 연간 시수를 읽어 시수 기준 위반(교과(군) 증감 범위, 감축 불가, 학년군 최소 총 시수)을 검토해요. 파일은 이 컴퓨터 안에서만 읽고 어디에도 보내지 않아요."
      >
        <div class="pb">
          <div
            class="dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFile(e.dataTransfer?.files?.[0]);
            }}
          >
            <label class="btn primary file-btn">
              {busy ? '읽는 중…' : '파일 고르기'}
              <input
                type="file"
                accept={ACCEPT}
                disabled={busy}
                aria-label="검토할 파일"
                onChange={(e) => {
                  void onFile(e.currentTarget.files?.[0]);
                  e.currentTarget.value = '';
                }}
              />
            </label>
            <span class="hint">또는 여기로 끌어다 놓기 · 엑셀(.xlsx, .csv) · 한글(.hwpx) · PDF · 이 도구의 JSON</span>
          </div>
          <p class="hint" style={{ marginTop: '8px' }}>
            예전 한글(.hwp)은 한글에서 .hwpx나 PDF로 저장해 올려 주세요. PDF는 읽기 도구를 인터넷에서 받아 오고, 표 모양에 따라 잘못 읽을 수 있으니 아래 표에서 꼭 확인하세요.
          </p>
          <p class="hint">
            검토 기준: {project ? `“${project.name}” 프로젝트의 기준` : '2022 개정 교육과정 기본값'}
            {changes.length > 0 && ` (바꾼 기준 ${changes.length}개)`}
            {project && <> · <a href={viewHash('rules')}>시수 기준 설정</a></>}
          </p>
          {error && <p class="banner" role="alert">{error}</p>}
        </div>
      </Panel>

      {loaded && result && n && (
        <>
          <div class="kpis">
            <div class="kpi">
              <div class="l">검토 결과</div>
              <div class="v" style={{ color: n.bad ? 'var(--bad)' : n.warn ? 'var(--warn)' : 'var(--ok)' }}>
                {n.bad ? <>{n.bad}<small>건 위반</small></> : n.warn ? <>{n.warn}<small>건 확인 필요</small></> : '적합'}
              </div>
              <div class="m">{loaded.fileName}</div>
            </div>
            <div class="kpi">
              <div class="l">파일에서 못 찾은 교과(군)</div>
              <div class="v num">{result.missing.length}<small>개</small></div>
              <div class="m">{result.missing.length ? result.missing.join(', ') : <Chip level="ok">모두 찾음</Chip>}</div>
            </div>
          </div>

          <div class="col">
            <section class="panel" aria-label="시수 기준 검토 결과">
              <div class="ph">
                <div class="grow">
                  <h2>시수 기준 검토 결과</h2>
                  <div class="sub">아래 표의 숫자를 고치면 바로 다시 검토해요.</div>
                </div>
              </div>
              <ul class="pb checks" style={{ listStyle: 'none', margin: 0 }}>
                {result.checks.map((c, i) => (
                  <li key={i} class={`check ${c.level}`}>
                    <div class="ic" aria-hidden="true">{ICON[c.level]}</div>
                    <div class="tx"><b>{c.title}</b><div class="d">{c.detail}</div></div>
                  </li>
                ))}
              </ul>
            </section>
            <Panel
              title="읽은 표"
              sub={loaded.plans.length > 1 ? '파일에 편제표로 보이는 표가 여러 개예요. 맞는 표를 고르세요.' : `읽은 곳: ${loaded.plans[0]?.tableName ?? ''}`}
              actions={
                loaded.plans.length > 1 ? (
                  <select aria-label="읽을 표" value={loaded.index} onChange={(e) => choosePlan(Number(e.currentTarget.value))}>
                    {loaded.plans.map((pl, i) => <option key={i} value={i}>{pl.tableName}</option>)}
                  </select>
                ) : undefined
              }
            >
              <div class="pb hint" style={{ paddingBottom: 0 }}>
                빈칸(?)은 파일에서 못 찾은 값이에요. 잘못 읽은 숫자나 빈칸은 직접 고치세요. 교과(군)으로만 적힌 값은 그 교과(군)의 첫 교과·첫 학년 칸에 넣었어요.
              </div>
              <div class="tw">
                <table class="t review-grid" style={{ minWidth: '620px' }}>
                  <thead>
                    <tr><th class="l">교과</th>{GRADES.map((g) => <th key={g}>{g}학년</th>)}</tr>
                  </thead>
                  <tbody>
                    {ROWS.map((s) => (
                      <tr key={s}>
                        <td class="l">{s}</td>
                        {GRADES.map((g) => (
                          <td key={g}>
                            {subjectsOf(g).includes(s) ? (
                              <ValueInput
                                label={`${g}학년 ${shortName(s)} 연간 시수`}
                                value={loaded.values[g][s] ?? null}
                                onChange={(v) => setLoaded({ ...loaded, values: setReviewValue(loaded.values, g, s, v) })}
                              />
                            ) : (
                              <span class="hint">–</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr class="total">
                      <td class="l">연간 총 시수</td>
                      {GRADES.map((g) => <td key={g}>{fmt(gradeSum(loaded.values, g))}</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="pb row">
                <button type="button" class="btn" disabled={result.missing.length > 0} onClick={makeProject}>
                  이 시수로 새 프로젝트 만들기
                </button>
                {result.missing.length > 0 && <span class="hint">빈칸을 모두 채우면 새 프로젝트로 가져올 수 있어요.</span>}
              </div>
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

const gradeSum = (v: ReviewValues, g: GradeNo) => subjectsOf(g).reduce((a, s) => a + (v[g][s] ?? 0), 0);

/** 비우면 "못 찾음"(null)이 되는 숫자 칸 */
function ValueInput({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      aria-label={label}
      placeholder="?"
      class={value === null ? 'missing' : ''}
      value={value === null ? '' : String(value)}
      onInput={(e) => {
        const raw = e.currentTarget.value.trim();
        const n = Number(raw);
        if (raw === '') onChange(null);
        else if (Number.isFinite(n) && n >= 0) onChange(Math.round(n));
      }}
    />
  );
}

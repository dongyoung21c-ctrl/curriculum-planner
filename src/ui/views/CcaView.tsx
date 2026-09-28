import { CCA_AREAS, GRADES } from '../../data/standards';
import { setAdapt, setAutonomy, setCcaArea, setInfo, setSafety } from '../../domain/edits';
import { autonomyRecommended, ccaTotal, fmt, signed } from '../../domain/hours';
import type { Semester } from '../../domain/types';
import { useStore } from '../../state/store';
import { Chip, NumInput, Panel } from '../common';

export function CcaView() {
  const { project: p, edit } = useStore();
  if (!p) return null;
  const safety = p.safety[1] + p.safety[2];
  const info = p.info[5] + p.info[6];
  const SAFETY_MIN = p.rules.safetyMin;
  const INFO_MIN = p.rules.infoMin;

  return (
    <div class="grid2">
      <Panel title="창의적 체험활동 영역별 배분" sub="2022 개정: 자율·자치 / 동아리 / 진로 3개 영역. 영역 합계는 편제표의 창체 시수와 같아야 해요.">
        <div class="tw">
          <table class="t" style={{ minWidth: '560px' }}>
            <thead>
              <tr>
                <th class="l">학년</th><th>창체 편성</th>
                {CCA_AREAS.map((a) => <th key={a}>{a}</th>)}
                <th class="sep">영역 합계</th><th>차이</th>
              </tr>
            </thead>
            <tbody>
              {GRADES.map((g) => {
                const c = ccaTotal(p, g);
                const sum = p.cca[g].reduce((a, b) => a + b, 0);
                return (
                  <tr key={g}>
                    <td class="l">{g}학년</td>
                    <td>{fmt(c)}</td>
                    {p.cca[g].map((v, i) => (
                      <td key={i}>
                        <NumInput label={`${g}학년 ${CCA_AREAS[i]}`} value={v} onChange={(x) => edit(setCcaArea(g, i as 0 | 1 | 2, x))} />
                      </td>
                    ))}
                    <td class="sep"><b>{fmt(sum)}</b></td>
                    <td class={sum - c ? 'neg' : ''}>{sum - c ? signed(sum - c) : <Chip level="ok">일치</Chip>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div class="pb hint">1~2학년 창체에는 입학 초기 적응 활동과 안전교육이 들어가요. 학교스포츠클럽·범교과 학습 주제는 관련 교과와 창체에서 통합 운영해요.</div>
      </Panel>
      <div class="col">
        <Panel title="필수 반영 시수" sub="총론에서 시수를 명시한 항목">
          <div class="pb tw">
            <table class="t" style={{ minWidth: '520px' }}>
              <thead>
                <tr><th class="l">항목</th><th>1학년</th><th>2학년</th><th>5학년</th><th>6학년</th><th>학년군 계</th><th>기준</th><th>판정</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td class="l">안전교육 (1~2 창체 안)</td>
                  <td><NumInput label="1학년 안전교육" value={p.safety[1]} onChange={(v) => edit(setSafety(1, v))} /></td>
                  <td><NumInput label="2학년 안전교육" value={p.safety[2]} onChange={(v) => edit(setSafety(2, v))} /></td>
                  <td>–</td><td>–</td>
                  <td>{fmt(safety)}</td><td>{SAFETY_MIN} 이상</td>
                  <td><Chip level={safety >= SAFETY_MIN ? 'ok' : 'warn'}>{safety >= SAFETY_MIN ? '충족' : '확인'}</Chip></td>
                </tr>
                <tr>
                  <td class="l">정보교육 (5~6 실과 안)</td>
                  <td>–</td><td>–</td>
                  <td><NumInput label="5학년 정보교육" value={p.info[5]} onChange={(v) => edit(setInfo(5, v))} /></td>
                  <td><NumInput label="6학년 정보교육" value={p.info[6]} onChange={(v) => edit(setInfo(6, v))} /></td>
                  <td>{fmt(info)}</td><td>{INFO_MIN} 이상</td>
                  <td><Chip level={info >= INFO_MIN ? 'ok' : 'warn'}>{info >= INFO_MIN ? '충족' : '확인'}</Chip></td>
                </tr>
                <tr>
                  <td class="l">입학 초기 적응 (1학년 창체 안)</td>
                  <td><NumInput label="1학년 입학 초기 적응 활동" value={p.adapt} onChange={(v) => edit(setAdapt(v))} /></td>
                  <td>–</td><td>–</td><td>–</td>
                  <td>{fmt(p.adapt)}</td><td>학교 자율</td>
                  <td><Chip level="neutral">참고</Chip></td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="학교자율시간 (3~6학년)" sub="학기별 1주 분량의 수업 시간을 교과·창체 시수 안에서 확보해 운영해요. 권장 = 학년 연간 시수 ÷ 연간 주수 × 2">
          <div class="pb tw">
            <table class="t" style={{ minWidth: '520px' }}>
              <thead>
                <tr><th class="l">학년</th><th>권장(2주)</th><th>편성 시수</th><th class="l">과목·활동명</th><th>운영 학기</th></tr>
              </thead>
              <tbody>
                {([3, 4, 5, 6] as const).map((g) => {
                  const au = p.autonomy[g];
                  return (
                    <tr key={g}>
                      <td class="l">{g}학년</td>
                      <td class="calc">{autonomyRecommended(p, g)}</td>
                      <td><NumInput label={`${g}학년 학교자율시간 시수`} value={au.hours} onChange={(v) => edit(setAutonomy(g, { hours: v }))} /></td>
                      <td class="l">
                        <input
                          type="text"
                          aria-label={`${g}학년 학교자율시간 과목·활동명`}
                          value={au.name}
                          maxLength={40}
                          placeholder="예: 우리 마을 탐구"
                          style={{ width: '100%', minWidth: '140px' }}
                          onInput={(e) => edit(setAutonomy(g, { name: e.currentTarget.value }))}
                        />
                      </td>
                      <td>
                        <select aria-label={`${g}학년 학교자율시간 운영 학기`} value={au.semester} onChange={(e) => edit(setAutonomy(g, { semester: Number(e.currentTarget.value) as Semester }))}>
                          <option value={1}>1학기</option>
                          <option value={2}>2학기</option>
                          <option value={3}>연중</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div class="pb hint" style={{ paddingTop: 0 }}>
            학교자율시간은 교과(군)와 창체 시수 일부로 운영하므로 편제표 총 시수나 주당 시수에 따로 더하지 않아요. 시간표에서는 가져올 교과 칸을 그대로 두고 수업 내용으로 운영하세요.
          </div>
        </Panel>
      </div>
    </div>
  );
}

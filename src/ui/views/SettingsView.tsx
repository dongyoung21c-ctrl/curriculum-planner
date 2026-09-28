import { YEAR_OPTIONS } from '../../data/holidays';
import { GRADES } from '../../data/standards';
import { changeYear, setClasses, setInfoFields } from '../../domain/edits';
import { useStore } from '../../state/store';
import { NumInput, Panel, useConfirm, useToast } from '../common';
import { viewHash } from '../route';

export function SettingsView() {
  const { project: p, edit, dispatch } = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  if (!p) return null;

  return (
    <>
      <div class="grid2">
        <Panel title="학교 · 프로젝트 정보">
          <div class="pb cal-form">
            <div class="field">
              <label for="st-school">학교명</label>
              <input type="text" id="st-school" value={p.school} maxLength={80} placeholder="예: 한빛초등학교" onInput={(e) => edit(setInfoFields({ school: e.currentTarget.value }))} />
            </div>
            <div class="field">
              <label for="st-name">프로젝트명</label>
              <input type="text" id="st-name" value={p.name} maxLength={80} onChange={(e) => edit(setInfoFields({ name: e.currentTarget.value }))} />
            </div>
            <div class="field">
              <label for="st-year">학년도</label>
              <select
                id="st-year"
                value={p.year}
                onChange={(e) => {
                  const year = Number(e.currentTarget.value);
                  e.currentTarget.value = String(p.year);
                  confirm({
                    title: '학년도 바꾸기',
                    message: `${year}학년도로 바꾸면 학사일정(학기 날짜·재량휴업일·공휴일 설정)이 새 학년도 기본값으로 바뀌어요. 편제 시수는 그대로예요.`,
                    okLabel: '바꾸기',
                    onOk: () => {
                      edit(changeYear(year));
                      toast(`${year}학년도로 바꿨어요.`);
                    },
                  });
                }}
              >
                {[...new Set([...YEAR_OPTIONS, p.year])].sort().map((y) => <option key={y} value={y}>{y}학년도</option>)}
              </select>
            </div>
            <div class="field">
              <span>1시간 수업 시간(분)</span>
              <NumInput label="1시간 수업 시간(분)" value={p.minutes} max={60} onChange={(v) => edit(setInfoFields({ minutes: v }))} />
            </div>
          </div>
        </Panel>
        <Panel title="학년별 학급수" sub="편제표 요약과 인쇄물에 나와요.">
          <div class="pb">
            <div class="days" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              {GRADES.map((g) => (
                <div class="dy" key={g}>
                  <b aria-hidden="true">{g}학년</b>
                  <NumInput label={`${g}학년 학급수`} value={p.classes[g]} max={99} onChange={(v) => edit(setClasses(g, v))} />
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>
      <Panel
        title="프로젝트 관리"
        sub="이 브라우저에만 저장돼요. 다른 컴퓨터로 옮기려면 인쇄·내보내기에서 JSON 백업을 내려받으세요."
        actions={
          <>
            <button type="button" class="btn" onClick={() => { dispatch({ type: 'duplicate', now: new Date().toISOString() }); toast('복제했어요.'); }}>
              복제하여 새 프로젝트
            </button>
            <button
              type="button"
              class="btn danger"
              onClick={() =>
                confirm({
                  title: '프로젝트 삭제',
                  message: `“${p.name}” 프로젝트를 지울까요? 되돌릴 수 없어요. 필요하면 먼저 JSON 백업을 내려받으세요.`,
                  okLabel: '삭제',
                  danger: true,
                  onOk: () => {
                    dispatch({ type: 'delete', id: p.id });
                    toast('삭제했어요.');
                  },
                })
              }
            >
              이 프로젝트 삭제
            </button>
          </>
        }
      >
        <div class="pb hint">
          만든 날 {new Date(p.createdAt).toLocaleDateString('ko-KR')} · 마지막 수정 {new Date(p.updatedAt).toLocaleString('ko-KR')}
        </div>
      </Panel>
      <p class="note">
        시수 기준(교과(군) 기준 시수, 증감 범위, 감축 불가, 수업일수 등)은 <a href={viewHash('rules')}>시수 기준 설정</a>에서 바꿀 수 있어요. 공휴일 자료는 「관공서의 공휴일에 관한 규정」 기준 참고 자료예요. 임시공휴일·선거일은 학년도 시작 전에 꼭 확인하세요.
      </p>
    </>
  );
}

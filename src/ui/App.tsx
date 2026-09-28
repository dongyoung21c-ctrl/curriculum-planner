import { useEffect, useState } from 'preact/hooks';
import { YEAR_OPTIONS } from '../data/holidays';
import { countLevels, validate, type ViewId } from '../domain/validate';
import { useStore } from '../state/store';
import { Modal, useToast } from './common';
import { parseView, viewHash, VIEWS } from './route';
import { AllocView } from './views/AllocView';
import { CalendarView } from './views/CalendarView';
import { CcaView } from './views/CcaView';
import { Overview } from './views/Overview';
import { PrintView } from './views/PrintView';
import { ReviewView } from './views/ReviewView';
import { RulesView } from './views/RulesView';
import { SettingsView } from './views/SettingsView';
import { WeeklyView } from './views/WeeklyView';

function useView(): ViewId {
  const [view, setView] = useState<ViewId>(() => parseView(window.location.hash));
  useEffect(() => {
    const on = () => {
      setView(parseView(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return view;
}

export function App() {
  const { data, project, dispatch, warning } = useStore();
  const view = useView();
  const [creating, setCreating] = useState(false);
  const info = VIEWS.find((v) => v.id === view) ?? VIEWS[0]!;
  const bad = project ? countLevels(validate(project)).bad : 0;

  return (
    <div class="app">
      <aside class="side">
        <div class="brand">
          <div class="mark">
            <div class="logo" aria-hidden="true">편</div>
            <div>
              <div class="t">교육과정 편성 도우미</div>
              <div class="s">초등학교 · 2022 개정 교육과정 기준</div>
            </div>
          </div>
        </div>
        <div class="proj">
          <label for="projSel">학교 · 학년도 프로젝트</label>
          <div class="row">
            <select id="projSel" value={project?.id ?? ''} onChange={(e) => dispatch({ type: 'select', id: e.currentTarget.value })} disabled={!project}>
              {data.projects.length === 0 && <option value="">프로젝트 없음</option>}
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.school ? `${p.school} · ` : ''}
                  {p.name}
                </option>
              ))}
            </select>
            <button type="button" class="btn sm" aria-label="새 프로젝트" title="새 프로젝트" onClick={() => setCreating(true)}>
              ＋
            </button>
          </div>
        </div>
        <nav class="menu" aria-label="메뉴">
          {VIEWS.map((v) => (
            <a key={v.id} href={viewHash(v.id)} aria-current={view === v.id ? 'page' : undefined}>
              <svg class="ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d={v.icon} />
              </svg>
              {v.title}
              {v.id === 'overview' && bad > 0 && (
                <span class="cnt" aria-label={`기준 위반 ${bad}건`}>
                  {bad}
                </span>
              )}
            </a>
          ))}
        </nav>
        <div class="side-foot">
          <span>이 브라우저에 자동 저장돼요</span>
          <span class="foot-links">
            <a href="https://github.com/dongyoung21c-ctrl/curriculum-planner" target="_blank" rel="noopener">
              소스 코드
            </a>
          </span>
        </div>
      </aside>
      <main>
        <div class="topbar">
          <div>
            <div class="crumb">{project ? `${project.school ? `${project.school} · ` : ''}${project.name}` : '프로젝트 없음'}</div>
            <h1>{info.title}</h1>
          </div>
          <div class="grow" />
          {project && view !== 'print' && (
            <a class="btn sm" href={viewHash('print')}>
              인쇄용 보기
            </a>
          )}
        </div>
        <div class="content">
          {warning && (
            <p class="banner" role="alert">
              {warning}
            </p>
          )}
          {project || view === 'review' ? <ViewBody view={view} /> : <FirstRun onCreate={() => setCreating(true)} />}
        </div>
      </main>
      <NewProjectDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function ViewBody({ view }: { view: ViewId }) {
  switch (view) {
    case 'overview': return <Overview />;
    case 'alloc': return <AllocView />;
    case 'cca': return <CcaView />;
    case 'calendar': return <CalendarView />;
    case 'weekly': return <WeeklyView />;
    case 'print': return <PrintView />;
    case 'review': return <ReviewView />;
    case 'rules': return <RulesView />;
    case 'settings': return <SettingsView />;
  }
}

function FirstRun({ onCreate }: { onCreate: () => void }) {
  return (
    <div class="panel">
      <div class="empty">
        <h2>아직 프로젝트가 없어요</h2>
        <p>학교명과 학년도를 넣으면 2022 개정 교육과정 기준 시수로 편제표 초안이 자동으로 채워져요.</p>
        <button type="button" class="btn primary" onClick={onCreate}>
          첫 프로젝트 만들기
        </button>
        <p class="hint">
          이미 완성된 편제표가 있다면 <a href={viewHash('review')}>파일 검토</a>에서 바로 검토할 수 있어요. 이전에 claude.ai에서 쓰던 편제는 거기서 “JSON 백업”으로 내려받은 파일을 <a href={viewHash('print')}>인쇄·내보내기</a>에서 불러오세요.
        </p>
      </div>
    </div>
  );
}

function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dispatch } = useStore();
  const toast = useToast();
  const [school, setSchool] = useState('');
  const [year, setYear] = useState(YEAR_OPTIONS[0] ?? 2026);
  const [name, setName] = useState('');
  return (
    <Modal open={open} onClose={onClose} label="새 교육과정 프로젝트">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          dispatch({ type: 'create', options: { school, year, name } });
          toast('새 프로젝트를 만들었어요.');
          setSchool('');
          setName('');
          onClose();
          if (window.location.hash !== viewHash('overview')) window.location.hash = viewHash('overview');
        }}
      >
        <h2>새 교육과정 프로젝트</h2>
        <p class="hint">2022 개정 교육과정 기준 시수와 학년도 공휴일이 채워진 초안이 만들어져요.</p>
        <div class="field">
          <label for="np-school">학교명</label>
          <input type="text" id="np-school" value={school} onInput={(e) => setSchool(e.currentTarget.value)} placeholder="예: 한빛초등학교" maxLength={80} autoFocus />
        </div>
        <div class="field">
          <label for="np-year">학년도</label>
          <select id="np-year" value={year} onChange={(e) => setYear(Number(e.currentTarget.value))}>
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}학년도
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="np-name">프로젝트명</label>
          <input type="text" id="np-name" value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="비우면 학년도로 자동 지정" maxLength={80} />
        </div>
        <div class="acts">
          <button type="button" class="btn" onClick={onClose}>
            취소
          </button>
          <button type="submit" class="btn primary">
            만들기
          </button>
        </div>
      </form>
    </Modal>
  );
}

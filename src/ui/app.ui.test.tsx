import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { vi } from 'vitest';
import { newProject } from '../domain/project';
import type { AppData } from '../domain/types';
import { StoreProvider } from '../state/store';
import { STORAGE_KEY, UNREADABLE_PREFIX, toProjectJson, type KeyValueStore } from '../storage/storage';
import { App } from './App';
import { ConfirmProvider, ToastProvider } from './common';

vi.mock('./download', () => ({ downloadText: vi.fn(), pageCss: () => '' }));
import { downloadText } from './download';

const seeded = (): AppData => {
  const p = newProject({ year: 2026, school: '한빛초' });
  return { version: 1, projects: [{ ...p, id: 'p1' }], currentId: 'p1' };
};

function renderApp(opts: { data?: AppData | null; hash?: string; store?: KeyValueStore | null } = {}) {
  const data = opts.data === undefined ? seeded() : opts.data;
  if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.location.hash = opts.hash ?? '#/overview';
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <StoreProvider store={opts.store === undefined ? localStorage : opts.store}>
          <App />
        </StoreProvider>
      </ConfirmProvider>
    </ToastProvider>,
  );
}

const saved = (): AppData => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as AppData;
const go = (hash: string) => act(() => {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
});
const panel = (name: string) => screen.getByRole('region', { name });

describe('처음 쓰기', () => {
  it('프로젝트가 없으면 만들기를 안내하고, 만들면 적합 상태로 시작한다', () => {
    renderApp({ data: null });
    fireEvent.click(screen.getByRole('button', { name: '첫 프로젝트 만들기' }));
    fireEvent.input(screen.getByLabelText('학교명'), { target: { value: '새빛초' } });
    fireEvent.submit(screen.getByLabelText('학교명').closest('form') as HTMLFormElement);
    expect(saved().projects[0]).toMatchObject({ school: '새빛초', name: '2026학년도 교육과정' });
    expect(screen.getByText('적합')).toBeTruthy();
    expect(screen.getByText('모든 기준 충족')).toBeTruthy();
  });

  it('＋ 버튼으로 프로젝트를 더 만들고 바꿀 수 있다', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: '새 프로젝트' }));
    fireEvent.change(screen.getByLabelText('학년도'), { target: { value: '2027' } });
    fireEvent.submit(screen.getByLabelText('학년도').closest('form') as HTMLFormElement);
    expect(saved().projects).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('학교 · 학년도 프로젝트'), { target: { value: 'p1' } });
    expect(saved().currentId).toBe('p1');
  });
});

describe('편제표', () => {
  it('시수를 고치면 판정과 개요의 위반 개수가 바로 바뀐다', () => {
    renderApp({ hash: '#/alloc' });
    fireEvent.click(screen.getByRole('tab', { name: '5~6학년군' }));
    const music = screen.getByLabelText('5학년 음악 1학기') as HTMLInputElement;
    fireEvent.input(music, { target: { value: '30' } });
    expect(screen.getAllByText('감축 불가')).toHaveLength(2);
    expect(saved().projects[0]?.alloc[5]['음악']).toEqual([30, 34]);
    expect(screen.getByLabelText('기준 위반 2건')).toBeTruthy();
    fireEvent.blur(music);
    expect(music.value).toBe('30');
  });

  it('20% 안 증감은 증감률로, 넘으면 20% 초과로 표시한다', () => {
    renderApp({ hash: '#/alloc' });
    fireEvent.click(screen.getByRole('tab', { name: '3~4학년군' }));
    fireEvent.input(screen.getByLabelText('3학년 영어 1학기'), { target: { value: '40' } });
    expect(screen.getAllByText('+4.4%').length).toBeGreaterThan(0);
    fireEvent.input(screen.getByLabelText('3학년 영어 1학기'), { target: { value: '80' } });
    expect(screen.getAllByText('20% 초과')).toHaveLength(2);
  });

  it('기준 시수로 초기화는 확인을 받고, 균등 분할은 바로 한다', () => {
    renderApp({ hash: '#/alloc' });
    fireEvent.input(screen.getByLabelText('1학년 국어 1학기'), { target: { value: '131' } });
    fireEvent.click(screen.getByRole('button', { name: '학기 균등 분할' }));
    fireEvent.click(screen.getByRole('button', { name: '나누기' }));
    expect(saved().projects[0]?.alloc[1]['국어']).toEqual([126, 125]);
    fireEvent.click(screen.getByRole('button', { name: '기준 시수로 초기화' }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(saved().projects[0]?.alloc[1]['국어']).toEqual([126, 125]);
    fireEvent.click(screen.getByRole('button', { name: '기준 시수로 초기화' }));
    fireEvent.click(screen.getByRole('button', { name: '초기화' }));
    expect(saved().projects[0]?.alloc[1]['국어']).toEqual([121, 120]);
  });
});

describe('창체·자율시간', () => {
  it('영역·안전·정보·자율시간을 고치면 검토에 반영된다', () => {
    renderApp({ hash: '#/cca' });
    fireEvent.input(screen.getByLabelText('3학년 동아리 활동'), { target: { value: '40' } });
    expect(within(panel('창의적 체험활동 영역별 배분')).getByText('+6')).toBeTruthy();
    fireEvent.input(screen.getByLabelText('1학년 안전교육'), { target: { value: '10' } });
    fireEvent.input(screen.getByLabelText('6학년 정보교육'), { target: { value: '0' } });
    fireEvent.input(screen.getByLabelText('1학년 입학 초기 적응 활동'), { target: { value: '20' } });
    fireEvent.input(screen.getByLabelText('5학년 학교자율시간 시수'), { target: { value: '64' } });
    fireEvent.input(screen.getByLabelText('5학년 학교자율시간 과목·활동명'), { target: { value: '우리 마을 코딩' } });
    fireEvent.change(screen.getByLabelText('5학년 학교자율시간 운영 학기'), { target: { value: '3' } });
    const p = saved().projects[0]!;
    expect(p.autonomy[5]).toEqual({ hours: 64, name: '우리 마을 코딩', semester: 3 });
    expect(p.adapt).toBe(20);
    go('#/overview');
    expect(screen.getByText('1~2학년군 안전교육 시수 확인')).toBeTruthy();
    expect(screen.getByText('5~6학년군 정보교육 시수 부족')).toBeTruthy();
    expect(screen.getByText('3학년 창의적 체험활동 영역 합계가 달라요')).toBeTruthy();
  });
});

describe('학사일정', () => {
  it('달력의 평일을 눌러 재량휴업일을 넣고 뺀다', () => {
    renderApp({ hash: '#/calendar' });
    const day = screen.getByRole('button', { name: /^4월 15일 수업일/ });
    fireEvent.click(day);
    expect(document.querySelector('.kpi .v')?.textContent).toBe('193일');
    fireEvent.click(screen.getByRole('button', { name: /^4월 15일 재량휴업일/ }));
    expect(saved().projects[0]?.calendar.disc.some((d) => d.date === '2026-04-15')).toBe(false);
  });

  it('재량휴업일과 공휴일을 추가·삭제하고, 빈 날짜와 중복은 알려 준다', () => {
    renderApp({ hash: '#/calendar' });
    const disc = panel('재량휴업일');
    fireEvent.submit(within(disc).getByRole('button', { name: '추가' }).closest('form') as HTMLFormElement);
    expect(screen.getByText('날짜를 고르세요.')).toBeTruthy();
    fireEvent.change(within(disc).getByLabelText('재량휴업일 날짜'), { target: { value: '2026-05-01' } });
    fireEvent.submit(within(disc).getByRole('button', { name: '추가' }).closest('form') as HTMLFormElement);
    expect(screen.getByText('이미 있는 날짜예요.')).toBeTruthy();
    fireEvent.change(within(disc).getByLabelText('재량휴업일 날짜'), { target: { value: '2026-06-05' } });
    fireEvent.input(within(disc).getByLabelText('재량휴업일 이름'), { target: { value: '개교기념일' } });
    fireEvent.submit(within(disc).getByRole('button', { name: '추가' }).closest('form') as HTMLFormElement);
    expect(within(disc).getByText('개교기념일')).toBeTruthy();
    fireEvent.click(within(disc).getByRole('button', { name: '2026-06-05 개교기념일 삭제' }));
    expect(within(disc).queryByText('개교기념일')).toBeNull();

    const hol = panel('공휴일');
    fireEvent.click(within(hol).getByLabelText('2026-06-03 (수)'));
    expect(saved().projects[0]?.calendar.excluded).toEqual(['2026-06-03']);
    fireEvent.change(within(hol).getByLabelText('공휴일 날짜'), { target: { value: '2026-04-15' } });
    fireEvent.submit(within(hol).getByRole('button', { name: '추가' }).closest('form') as HTMLFormElement);
    fireEvent.change(within(hol).getByLabelText('공휴일 날짜'), { target: { value: '2026-04-15' } });
    fireEvent.submit(within(hol).getByRole('button', { name: '추가' }).closest('form') as HTMLFormElement);
    expect(screen.getByText('이미 있는 날짜예요.')).toBeTruthy();
    fireEvent.click(within(hol).getByRole('button', { name: '2026-04-15 임시공휴일 삭제' }));
    expect(saved().projects[0]?.calendar.extra).toEqual([]);
  });

  it('학기 날짜를 바꾸고, 겹치면 경고한다', () => {
    renderApp({ hash: '#/calendar' });
    fireEvent.change(screen.getByLabelText('2학기 시작'), { target: { value: '2026-07-01' } });
    expect(screen.getByText('1학기과 2학기 기간이 겹쳐요.')).toBeTruthy();
  });

  it('공휴일 자료가 없는 학년도는 안내한다', () => {
    const d = seeded();
    const p = newProject({ year: 2029 });
    renderApp({ data: { ...d, projects: [{ ...p, id: 'p9' }], currentId: 'p9' }, hash: '#/calendar' });
    expect(screen.getByText(/2029학년도 공휴일 자료가 아직 없어요/)).toBeTruthy();
  });
});

describe('주간 시수', () => {
  it('교시 수를 바꾸면 불일치, 자동 배당으로 맞춘다', () => {
    renderApp({ hash: '#/weekly' });
    fireEvent.click(screen.getByRole('tab', { name: '4학년' }));
    fireEvent.input(screen.getByLabelText('월요일 교시 수'), { target: { value: '7' } });
    expect(screen.getByText('교시 30 vs 29/29')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '편제 ÷ 주수로 자동 배당' }));
    fireEvent.click(screen.getByRole('button', { name: '다시 배당' }));
    expect(screen.getByText('교시 수 일치')).toBeTruthy();
  });

  it('주당 시수·주수·학사일정 주수·시간표 칸', () => {
    renderApp({ hash: '#/weekly' });
    fireEvent.input(screen.getByLabelText('국어 1학기 주당'), { target: { value: '8' } });
    fireEvent.input(screen.getByLabelText('1학기 주수'), { target: { value: '18' } });
    expect(saved().projects[0]?.weekly[1]).toMatchObject({ weeks: [18, 17] });
    fireEvent.click(screen.getByRole('button', { name: '학사일정 주수 가져오기(전 학년)' }));
    fireEvent.click(screen.getByRole('button', { name: '모든 학년에 넣기' }));
    expect(saved().projects[0]?.weekly[1].weeks).toEqual([19.5, 19]);
    expect(saved().projects[0]?.weekly[6].weeks).toEqual([19.5, 19]);
    fireEvent.change(screen.getByLabelText('월요일 1교시'), { target: { value: '체육' } });
    expect(saved().projects[0]?.weekly[1].grid?.[0]?.[0]).toBe('');
    fireEvent.change(screen.getByLabelText('월요일 1교시'), { target: { value: '수학' } });
    expect(screen.getByText(/수학 5\/4/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '자동 재배치' }));
    fireEvent.click(screen.getByRole('button', { name: '다시 짜기' }));
    expect(screen.queryByText(/수학 5\/4/)).toBeNull();
  });
});

describe('인쇄·내보내기', () => {
  it('JSON·CSV·HTML을 내려받는다', () => {
    renderApp({ hash: '#/print' });
    expect(screen.getByText(/2026학년도 한빛초 교육과정 편제 및 시간 배당표/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'JSON 백업' }));
    fireEvent.click(screen.getByRole('button', { name: '편제표 CSV' }));
    fireEvent.click(screen.getByRole('button', { name: 'HTML 문서' }));
    const names = vi.mocked(downloadText).mock.calls.map((c) => c[0]);
    expect(names).toEqual(['2026학년도_한빛초_교육과정편제.json', '2026학년도_한빛초_편제표.csv', '2026학년도_한빛초_편제표.html']);
    expect(vi.mocked(downloadText).mock.calls[2]?.[1]).toContain('교육과정 편제 및 시간 배당표');
  });

  it('이전 버전 JSON을 새 프로젝트로 불러온다', async () => {
    renderApp({ hash: '#/print' });
    const legacy = { id: 'p1', name: '옛 편제', school: '옛초', year: 2027, alloc: { 1: { 국어: [130, 120] } }, calendar: {} };
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File([JSON.stringify(legacy)], 'old.json')] } });
    });
    await waitFor(() => expect(saved().projects).toHaveLength(2));
    expect(saved().projects[1]).toMatchObject({ name: '옛 편제 (가져옴)', school: '옛초', year: 2027 });
    expect(saved().currentId).toBe(saved().projects[1]?.id);
  });

  it('잘못된 파일은 알려 준다', async () => {
    renderApp({ hash: '#/print' });
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['nope'], 'x.json')] } });
    });
    await screen.findByText(/JSON 파일이 아니에요/);
    const big = new File(['x'], 'big.json');
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    await act(async () => {
      fireEvent.change(input, { target: { files: [big] } });
    });
    await screen.findByText('파일이 너무 커요.');
  });

  it('내보낸 JSON은 다시 읽을 수 있다', () => {
    const p = seeded().projects[0]!;
    expect(JSON.parse(toProjectJson(p)).app).toBe('curriculum-planner');
  });
});

describe('설정', () => {
  it('학교 정보·학급수를 고친다', () => {
    renderApp({ hash: '#/settings' });
    fireEvent.input(screen.getByLabelText('학교명'), { target: { value: '바다초' } });
    fireEvent.change(screen.getByLabelText('프로젝트명'), { target: { value: '본안' } });
    fireEvent.input(screen.getByLabelText('3학년 학급수'), { target: { value: '5' } });
    fireEvent.input(screen.getByLabelText('1시간 수업 시간(분)'), { target: { value: '45' } });
    expect(saved().projects[0]).toMatchObject({ school: '바다초', name: '본안', minutes: 45 });
    expect(saved().projects[0]?.classes[3]).toBe(5);
  });

  it('학년도를 바꾸면 확인 뒤 학사일정이 새 학년도로 바뀐다', () => {
    renderApp({ hash: '#/settings' });
    fireEvent.change(screen.getByLabelText('학년도'), { target: { value: '2027' } });
    expect(saved().projects[0]?.year).toBe(2026);
    fireEvent.click(screen.getByRole('button', { name: '바꾸기' }));
    expect(saved().projects[0]?.year).toBe(2027);
    expect(saved().projects[0]?.calendar.s1s).toBe('2027-03-02');
  });

  it('복제와 삭제(확인)', () => {
    renderApp({ hash: '#/settings' });
    fireEvent.click(screen.getByRole('button', { name: '복제하여 새 프로젝트' }));
    expect(saved().projects.map((p) => p.name)).toEqual(['2026학년도 교육과정', '2026학년도 교육과정 (사본)']);
    fireEvent.click(screen.getByRole('button', { name: '이 프로젝트 삭제' }));
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(saved().projects).toHaveLength(1);
    expect(saved().currentId).toBe('p1');
  });
});

describe('저장', () => {
  it('읽지 못한 데이터는 따로 남기고 경고한다', () => {
    localStorage.setItem(STORAGE_KEY, '{broken');
    renderApp({ data: null });
    expect(Object.keys(localStorage).some((k) => k.startsWith(UNREADABLE_PREFIX))).toBe(true);
    expect(screen.getByRole('alert').textContent).toMatch(/따로 남겨 두었어요/);
  });

  it('새 버전 데이터는 덮어쓰지 않는다', () => {
    const newer = JSON.stringify({ version: 9, projects: [] });
    localStorage.setItem(STORAGE_KEY, newer);
    renderApp({ data: null });
    fireEvent.click(screen.getByRole('button', { name: '첫 프로젝트 만들기' }));
    fireEvent.submit(screen.getByLabelText('학교명').closest('form') as HTMLFormElement);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(newer);
  });

  it('저장할 수 없으면 경고한다', () => {
    renderApp({ data: null, store: null });
    expect(screen.getByRole('alert').textContent).toMatch(/저장할 수 없어요/);
  });

  it('저장 공간이 꽉 차면 경고한다', () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('full'); } };
    renderApp({ data: null, store: full });
    fireEvent.click(screen.getByRole('button', { name: '첫 프로젝트 만들기' }));
    fireEvent.submit(screen.getByLabelText('학교명').closest('form') as HTMLFormElement);
    expect(screen.getAllByRole('alert').some((a) => /저장 공간이 부족/.test(a.textContent ?? ''))).toBe(true);
  });

  it('다른 탭에서 고친 내용을 받되 보고 있는 프로젝트는 유지한다', () => {
    const d = seeded();
    const two: AppData = { ...d, projects: [...d.projects, { ...d.projects[0]!, id: 'p2', name: '두 번째' }], currentId: 'p1' };
    renderApp({ data: two });
    const incoming = { ...two, currentId: 'p2', projects: two.projects.map((p) => (p.id === 'p1' ? { ...p, school: '다른탭초' } : p)) };
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify(incoming) }));
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: '{bad' }));
    });
    expect((screen.getByLabelText('학교 · 학년도 프로젝트') as HTMLSelectElement).value).toBe('p1');
    expect(screen.getAllByText(/다른탭초/).length).toBeGreaterThan(0);
  });
});

describe('메뉴', () => {
  it('검토 항목의 이동 링크가 해당 화면을 연다', () => {
    renderApp();
    const link = screen.getAllByRole('link', { name: '이동 ›' })[0] as HTMLAnchorElement;
    expect(link.getAttribute('href')).toMatch(/^#\//);
    go('#/nope');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('개요');
  });
});

describe('시수 기준 설정', () => {
  it('교과(군) 기준·감축 불가·총 시수·그 밖의 기준을 바꾸면 검토가 따라 바뀐다', () => {
    renderApp({ hash: '#/rules' });
    expect(screen.getByText(/2022 개정 교육과정 기준을 그대로/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '5~6학년군' }));
    fireEvent.input(screen.getByLabelText('5~6학년군 영어 기준 시수'), { target: { value: '170' } });
    fireEvent.click(screen.getByLabelText('5~6학년군 체육 감축 불가'));
    fireEvent.input(screen.getByLabelText('5~6학년군 최소 총 수업시간 수'), { target: { value: '2142' } });
    expect(screen.getByText('교과(군) 합계와 같음')).toBeTruthy();
    fireEvent.input(screen.getByLabelText('5~6학년군 최소 총 수업시간 수'), { target: { value: '2100' } });
    expect(screen.getByText('교과(군) 합계 2,142')).toBeTruthy();
    fireEvent.input(screen.getByLabelText('교과(군) 증감 허용 범위'), { target: { value: '10' } });
    fireEvent.input(screen.getByLabelText('연간 최소 수업일수'), { target: { value: '200' } });
    const r = saved().projects[0]!.rules;
    expect(r.gradeGroups['5-6'].groups['영어']).toEqual({ std: 170, noCut: false });
    expect(r.gradeGroups['5-6'].groups['체육']?.noCut).toBe(false);
    expect(r.maxChangePct).toBe(10);
    expect(screen.getByText(/기본값과 다른 기준 5개/)).toBeTruthy();

    go('#/overview');
    expect(screen.getByText(/바꾼 기준으로 검토 중/)).toBeTruthy();
    expect(screen.getByText('5~6학년군 영어 10% 초과')).toBeTruthy();
    expect(screen.getByText('수업일수 200일 미달')).toBeTruthy();

    go('#/rules');
    fireEvent.click(screen.getByRole('button', { name: '2022 개정 기본값으로 되돌리기' }));
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(saved().projects[0]!.rules.maxChangePct).toBe(20);
  });
});

describe('파일 검토', () => {
  const csv = (rows: string[][]) => new File([rows.map((r) => r.join(',')).join('\n')], '편제.csv');
  const table = (music = '68') => [
    ['구분', '1학년', '2학년', '3학년', '4학년', '5학년', '6학년'],
    ['국어', '241', '241', '204', '204', '204', '204'],
    ['사회', '', '', '102', '102', '102', '102'],
    ['도덕', '', '', '34', '34', '34', '34'],
    ['수학', '128', '128', '136', '136', '136', '136'],
    ['과학', '', '', '102', '102', '102', '102'],
    ['실과', '', '', '', '', '68', '68'],
    ['체육', '', '', '102', '102', '102', '102'],
    ['음악', '', '', '68', '68', music, '68'],
    ['미술', '', '', '68', '68', '68', '68'],
    ['영어', '', '', '68', '68', '102', '102'],
    ['바른 생활', '72', '72'],
    ['슬기로운 생활', '112', '112'],
    ['즐거운 생활', '200', '200'],
    ['창의적 체험활동', '119', '119', '102', '102', '102', '102'],
  ];
  const upload = async (file: File) => {
    await act(async () => {
      fireEvent.change(screen.getByLabelText('검토할 파일'), { target: { files: [file] } });
    });
  };

  it('프로젝트가 없어도 파일을 올려 검토하고, 위반을 보여 준다', async () => {
    renderApp({ data: null, hash: '#/review' });
    expect(screen.getByText(/2022 개정 교육과정 기본값/)).toBeTruthy();
    await upload(csv(table('60')));
    await screen.findByText('5~6학년군 예술(음악/미술) 감축 불가');
    expect(screen.getByText('모두 찾음')).toBeTruthy();
    fireEvent.input(screen.getByLabelText('5학년 음악 연간 시수'), { target: { value: '68' } });
    expect(screen.queryByText('5~6학년군 예술(음악/미술) 감축 불가')).toBeNull();
    expect(screen.getByText('적합')).toBeTruthy();
  });

  it('빈칸은 못 찾은 교과로 알리고, 채우면 새 프로젝트로 가져온다', async () => {
    renderApp({ hash: '#/review' });
    await upload(csv(table().filter((r) => r[0] !== '영어')));
    await screen.findByText('3~4학년군 영어, 5~6학년군 영어');
    const make = screen.getByRole('button', { name: '이 시수로 새 프로젝트 만들기' }) as HTMLButtonElement;
    expect(make.disabled).toBe(true);
    for (const [g, v] of [[3, 68], [4, 68], [5, 102], [6, 102]] as const) {
      fireEvent.input(screen.getByLabelText(`${g}학년 영어 연간 시수`), { target: { value: String(v) } });
    }
    fireEvent.input(screen.getByLabelText('6학년 영어 연간 시수'), { target: { value: '' } });
    expect((screen.getByLabelText('6학년 영어 연간 시수') as HTMLInputElement).className).toBe('missing');
    fireEvent.input(screen.getByLabelText('6학년 영어 연간 시수'), { target: { value: '102' } });
    fireEvent.click(screen.getByRole('button', { name: '이 시수로 새 프로젝트 만들기' }));
    expect(saved().projects).toHaveLength(2);
    expect(saved().projects[1]).toMatchObject({ name: '편제 (검토본)' });
    expect(saved().projects[1]?.alloc[5]['영어']).toEqual([51, 51]);
  });

  it('읽을 수 없는 파일은 방법을 알려 준다', async () => {
    renderApp({ hash: '#/review' });
    await upload(new File(['x'], '편제.hwp'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/hwpx나 PDF로 저장/);
  });

  it('표가 여러 개면 고를 수 있다', async () => {
    renderApp({ hash: '#/review' });
    const p = newProject({ school: 'A초' });
    const q = newProject({ school: 'B초' });
    const all = { version: 1, projects: [{ ...p, id: 'a' }, { ...q, id: 'b', alloc: { ...q.alloc, 3: { ...q.alloc[3], 체육: [40, 40] } } }], currentId: 'a' };
    await upload(new File([JSON.stringify(all)], 'all.json'));
    await screen.findByLabelText('읽을 표');
    expect(screen.getByText('적합')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('읽을 표'), { target: { value: '1' } });
    expect(screen.getByText('3~4학년군 체육 감축 불가')).toBeTruthy();
  });
});

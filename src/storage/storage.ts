import { legacyAutonomyGrades, normalizeProject } from '../domain/project';
import type { AppData, Project } from '../domain/types';

export const STORAGE_KEY = 'curriculum-planner/v1';
export const UNREADABLE_PREFIX = `${STORAGE_KEY}.unreadable-`;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

export interface LoadResult {
  readonly data: AppData;
  readonly warning?: string;
  /** true면 저장하지 않는다(새 버전이 쓴 데이터, 옮겨 두지 못한 데이터를 지키려고) */
  readonly readOnly?: boolean;
}

export const emptyData = (): AppData => ({ version: 1, projects: [], currentId: null });

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseAppData(v: unknown): AppData | null {
  if (!isObj(v) || v.version !== 1 || !Array.isArray(v.projects)) return null;
  const seen = new Set<string>();
  const projects = v.projects
    .map(normalizeProject)
    .filter((p): p is Project => p !== null && !seen.has(p.id) && Boolean(seen.add(p.id)));
  const currentId = typeof v.currentId === 'string' && seen.has(v.currentId) ? v.currentId : (projects[0]?.id ?? null);
  return { version: 1, projects, currentId };
}

export function loadData(store: KeyValueStore | null): LoadResult {
  if (!store) return { data: emptyData(), warning: '이 브라우저에서는 저장할 수 없어요. 창을 닫기 전에 JSON 백업을 내려받으세요.' };
  let raw: string | null = null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw === null) return { data: emptyData() };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return keepUnreadable(store, raw);
  }
  const parsed = parseAppData(value);
  if (parsed) return { data: parsed };
  const version = isObj(value) ? value.version : undefined;
  if (typeof version === 'number' && version > 1) {
    return { data: emptyData(), readOnly: true, warning: '더 새 버전이 저장한 데이터예요. 기록을 지키려고 이 화면에서는 저장하지 않아요. 최신 주소로 열어 주세요.' };
  }
  return keepUnreadable(store, raw);
}

function keepUnreadable(store: KeyValueStore, raw: string): LoadResult {
  try {
    store.setItem(`${UNREADABLE_PREFIX}${Date.now()}`, raw);
    return { data: emptyData(), warning: '저장된 데이터를 읽지 못해 새로 시작해요. 원래 데이터는 브라우저에 따로 남겨 두었어요. JSON 백업이 있다면 불러오세요.' };
  } catch {
    return { data: emptyData(), readOnly: true, warning: '저장된 데이터를 읽지 못했어요. 원래 데이터를 지키려고 이 화면에서는 저장하지 않아요.' };
  }
}

export function saveData(store: KeyValueStore | null, data: AppData): boolean {
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function browserStore(): KeyValueStore | null {
  try {
    const s = window.localStorage;
    s.setItem(`${STORAGE_KEY}/probe`, '1');
    s.removeItem(`${STORAGE_KEY}/probe`);
    return s;
  } catch {
    return null;
  }
}

/* ───── JSON 파일 ───── */

export const projectFileName = (p: Project, ext: string, label = '교육과정편제'): string =>
  `${p.year}학년도_${(p.school || '학교').replace(/[\\/:*?"<>|]/g, '')}_${label}.${ext}`;

export const toProjectJson = (p: Project): string => JSON.stringify({ app: 'curriculum-planner', ...p }, null, 2);

export type ImportResult = { ok: true; projects: Project[]; notes: string[] } | { ok: false; error: string };

function importNotes(raw: unknown): string[] {
  const list = typeof raw === 'object' && raw !== null && Array.isArray((raw as { projects?: unknown }).projects) ? ((raw as { projects: unknown[] }).projects) : [raw];
  const grades = [...new Set(list.flatMap(legacyAutonomyGrades))].sort();
  return grades.length ? [`예전 버전에서 주당 시수에 따로 넣었던 학교자율시간은 교과 시수 안에서 운영하도록 바뀌어 ${grades.join('·')}학년 주간 배당을 다시 계산했어요.`] : [];
}

/** 프로젝트 하나(이전 아티팩트 형식 포함) 또는 전체 백업을 읽는다 */
export function parseImport(text: string): ImportResult {
  if (text.length > MAX_FILE_BYTES) return { ok: false, error: '파일이 너무 커요.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSON 파일이 아니에요. 이 도구에서 내려받은 JSON 파일을 고르세요.' };
  }
  const all = parseAppData(raw);
  if (all && all.projects.length) return { ok: true, projects: [...all.projects], notes: importNotes(raw) };
  const one = normalizeProject(raw);
  if (one) return { ok: true, projects: [one], notes: importNotes(raw) };
  return { ok: false, error: '교육과정 편제 JSON 형식이 아니에요.' };
}

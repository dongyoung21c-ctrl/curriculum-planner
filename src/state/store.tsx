import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import { newId, newProject, type NewProjectOptions } from '../domain/project';
import type { AppData, Project } from '../domain/types';
import { loadData, parseAppData, saveData, STORAGE_KEY, type KeyValueStore } from '../storage/storage';

export type Action =
  | { type: 'select'; id: string }
  | { type: 'create'; options: NewProjectOptions }
  | { type: 'edit'; fn: (p: Project) => Project; now: string }
  | { type: 'duplicate'; now: string }
  | { type: 'delete'; id: string }
  | { type: 'import'; projects: readonly Project[] }
  | { type: 'replaceAll'; data: AppData };

export const currentProject = (d: AppData): Project | undefined => d.projects.find((p) => p.id === d.currentId) ?? d.projects[0];

export function reducer(d: AppData, a: Action): AppData {
  switch (a.type) {
    case 'select':
      return d.projects.some((p) => p.id === a.id) ? { ...d, currentId: a.id } : d;
    case 'create': {
      const p = newProject(a.options);
      return { ...d, projects: [...d.projects, p], currentId: p.id };
    }
    case 'edit': {
      const cur = currentProject(d);
      if (!cur) return d;
      const next = a.fn(cur);
      if (next === cur) return d;
      return { ...d, projects: d.projects.map((p) => (p.id === cur.id ? { ...next, id: cur.id, updatedAt: a.now } : p)) };
    }
    case 'duplicate': {
      const cur = currentProject(d);
      if (!cur) return d;
      const copy: Project = { ...cur, id: newId(), name: `${cur.name} (사본)`, createdAt: a.now, updatedAt: a.now };
      return { ...d, projects: [...d.projects, copy], currentId: copy.id };
    }
    case 'delete': {
      const projects = d.projects.filter((p) => p.id !== a.id);
      return { ...d, projects, currentId: d.currentId === a.id ? (projects[0]?.id ?? null) : d.currentId };
    }
    case 'import': {
      // 이미 있는 id는 새 id로 바꿔 사본으로 들인다(덮어쓰지 않는다)
      const ids = new Set(d.projects.map((p) => p.id));
      const incoming = a.projects.map((p) => (ids.has(p.id) ? { ...p, id: newId(), name: `${p.name} (가져옴)` } : p));
      if (!incoming.length) return d;
      return { ...d, projects: [...d.projects, ...incoming], currentId: incoming[incoming.length - 1]?.id ?? d.currentId };
    }
    case 'replaceAll':
      return a.data;
  }
}

interface Store {
  readonly data: AppData;
  readonly project: Project | undefined;
  readonly dispatch: (a: Action) => void;
  /** 현재 프로젝트를 고친다 */
  readonly edit: (fn: (p: Project) => Project) => void;
  readonly warning: string | undefined;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider 안에서만 쓸 수 있어요');
  return s;
}

export function StoreProvider({ store, children }: { store: KeyValueStore | null; children: ComponentChildren }) {
  const initial = useMemo(() => loadData(store), [store]);
  const [data, dispatch] = useReducer(reducer, initial.data);
  const [saveFailed, setSaveFailed] = useState(false);
  const lastSynced = useRef<string | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    if (initial.readOnly) return;
    const serialized = JSON.stringify(data);
    if (serialized === lastSynced.current) return;
    lastSynced.current = serialized;
    setSaveFailed(store !== null && !saveData(store, data));
  }, [data, store, initial.readOnly]);

  // 같은 컴퓨터의 다른 탭에서 고친 내용을 받아 온다
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || e.newValue === null) return;
      try {
        const next = parseAppData(JSON.parse(e.newValue));
        if (next) {
          // 보고 있는 프로젝트는 탭마다 따로 둔다
          const localId = dataRef.current.currentId;
          const merged = localId && next.projects.some((p) => p.id === localId) ? { ...next, currentId: localId } : next;
          lastSynced.current = JSON.stringify(merged);
          dispatch({ type: 'replaceAll', data: merged });
        }
      } catch {
        /* 다른 탭이 쓰다 만 값은 무시한다 */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const edit = useCallback((fn: (p: Project) => Project) => dispatch({ type: 'edit', fn, now: new Date().toISOString() }), []);
  const warning = saveFailed ? '저장 공간이 부족해 저장하지 못했어요. 인쇄·내보내기에서 JSON 백업을 내려받으세요.' : initial.warning;
  const value = useMemo<Store>(() => ({ data, project: currentProject(data), dispatch, edit, warning }), [data, edit, warning]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

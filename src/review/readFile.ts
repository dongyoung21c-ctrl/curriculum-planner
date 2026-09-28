import { GRADES, subjectsOf } from '../data/standards';
import { annual } from '../domain/hours';
import { normalizeProject } from '../domain/project';
import { parseAppData } from '../storage/storage';
import { findPlans, type Extracted } from './interpret';
import { readPdf } from './pdf';
import { parseCsv, readHwpx, readXlsx, type Table } from './tables';

export const MAX_REVIEW_BYTES = 20 * 1024 * 1024;
export const ACCEPT = '.xlsx,.csv,.hwpx,.pdf,.json';

export type ReadResult = { ok: true; plans: Extracted[] } | { ok: false; error: string };

const extOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();

/** 이 도구의 JSON은 표를 거치지 않고 그대로 읽는다 */
function plansFromJson(text: string): Extracted[] {
  const raw: unknown = JSON.parse(text);
  const all = parseAppData(raw);
  const projects = all?.projects.length ? all.projects : [normalizeProject(raw)].filter((p) => p !== null);
  return projects.map((p) => ({
    tableName: `${p.school ? `${p.school} · ` : ''}${p.name}`,
    grades: Object.fromEntries(GRADES.map((g) => [g, Object.fromEntries(subjectsOf(g).map((s) => [s, annual(p, g, s)]))])),
    groups: {},
    score: 100,
  }));
}

async function tablesOf(ext: string, file: File): Promise<Table[]> {
  const bytes = () => file.arrayBuffer().then((b) => new Uint8Array(b));
  switch (ext) {
    case 'csv':
      return [{ name: 'CSV', rows: parseCsv(await file.text()) }];
    case 'xlsx':
      return readXlsx(await bytes());
    case 'hwpx':
      return readHwpx(await bytes());
    case 'pdf':
      return readPdf(await bytes());
    default:
      return [];
  }
}

const UNSUPPORTED: Record<string, string> = {
  hwp: '예전 한글(.hwp) 파일은 브라우저에서 읽을 수 없어요. 한글에서 “다른 이름으로 저장”으로 .hwpx나 PDF로 저장해 올려 주세요.',
  xls: '예전 엑셀(.xls) 파일은 읽을 수 없어요. 엑셀에서 .xlsx로 저장해 올려 주세요.',
};

export async function readReviewFile(file: File): Promise<ReadResult> {
  const ext = extOf(file.name);
  if (UNSUPPORTED[ext]) return { ok: false, error: UNSUPPORTED[ext] ?? '' };
  if (file.size > MAX_REVIEW_BYTES) return { ok: false, error: '파일이 너무 커요 (20MB까지).' };
  try {
    if (ext === 'json') {
      const plans = plansFromJson(await file.text());
      return plans.length ? { ok: true, plans } : { ok: false, error: '이 도구에서 만든 JSON이 아니에요.' };
    }
    if (!['csv', 'xlsx', 'hwpx', 'pdf'].includes(ext)) {
      return { ok: false, error: '엑셀(.xlsx·.csv), 한글(.hwpx), PDF, 이 도구의 JSON 파일을 올려 주세요.' };
    }
    const plans = findPlans(await tablesOf(ext, file));
    if (!plans.length) {
      return { ok: false, error: '파일에서 편제표를 찾지 못했어요. 교과 이름(국어, 수학…)과 학년(1학년…)이 적힌 표가 있는지 확인해 주세요.' };
    }
    return { ok: true, plans };
  } catch (e) {
    // 우리가 쓴 한국어 안내만 그대로 보여 주고, 라이브러리 오류는 일반 안내로 바꾼다
    const msg = e instanceof Error && /[가-힣]/.test(e.message) ? e.message : '파일을 읽지 못했어요. 파일이 손상되지 않았는지, 형식이 맞는지 확인해 주세요.';
    return { ok: false, error: msg };
  }
}

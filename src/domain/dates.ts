export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-03-02" 형식이고 실제 있는 날짜인지 */
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return toIso(d) === s;
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 시간대와 상관없이 현지 날짜로 읽는다 */
export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function weekdayOf(s: string): number {
  return parseIso(s).getDay();
}

export const isWeekend = (s: string): boolean => {
  const w = weekdayOf(s);
  return w === 0 || w === 6;
};

/** a부터 b까지(둘 다 포함) 날짜 목록. a가 b보다 늦으면 빈 목록 */
export function eachDay(a: string, b: string): string[] {
  const out: string[] = [];
  const d = parseIso(a);
  const end = parseIso(b);
  while (d <= end) {
    out.push(toIso(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** "03/02" */
export const monthDay = (s: string): string => (s ? s.slice(5).replace('-', '/') : '');

/** 학년도에 속하는 날짜인지 (그해 3월 ~ 이듬해 2월) */
export function inSchoolYear(s: string, year: number): boolean {
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  return (y === year && m >= 3) || (y === year + 1 && m <= 2);
}

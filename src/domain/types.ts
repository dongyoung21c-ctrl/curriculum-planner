import type { Rules } from './rules';

export type GradeNo = 1 | 2 | 3 | 4 | 5 | 6;
export type GradeGroupKey = '1-2' | '3-4' | '5-6';
/** [1학기, 2학기] */
export type Pair = readonly [number, number];
export type Semester = 1 | 2 | 3; // 3 = 연중

export interface SubjectGroup {
  /** 교과(군) 이름 */
  readonly key: string;
  /** 교과(군)에 속한 교과 */
  readonly subs: readonly string[];
  /** 학년군 기준 시수 */
  readonly std: number;
  /** 체육·예술처럼 기준 시수보다 줄일 수 없는 교과(군) */
  readonly noCut?: boolean;
  readonly cca?: boolean;
  readonly note?: string;
}

export interface GradeGroup {
  readonly label: string;
  readonly grades: readonly GradeNo[];
  /** 학년군 최소 총 수업시간 수 */
  readonly total: number;
  readonly groups: readonly SubjectGroup[];
}

export interface NamedDate {
  /** YYYY-MM-DD */
  readonly date: string;
  readonly name: string;
}

export interface Calendar {
  readonly s1s: string;
  readonly s1e: string;
  readonly s2s: string;
  readonly s2e: string;
  /** 학년말(2월) 등교 기간. 없으면 빈 문자열 */
  readonly s3s: string;
  readonly s3e: string;
  /** 재량휴업일 */
  readonly disc: readonly NamedDate[];
  /** 직접 추가한 공휴일(임시공휴일·선거일 등) */
  readonly extra: readonly NamedDate[];
  /** 해당 없어 뺀 법정공휴일 날짜 */
  readonly excluded: readonly string[];
}

export interface Weekly {
  /** 월~금 교시 수 */
  readonly perDay: readonly number[];
  /** [1학기 주수, 2학기 주수] */
  readonly weeks: Pair;
  /** 교과 → [1학기 주당, 2학기 주당] (0.5 단위) */
  readonly hours: Readonly<Record<string, Pair>>;
  /** 1학기 시간표 예시: 요일 → 교시 → 교과 */
  readonly grid: readonly (readonly string[])[] | null;
}

export interface Autonomy {
  readonly hours: number;
  readonly name: string;
  readonly semester: Semester;
}

export type ByGrade<T> = Readonly<Record<GradeNo, T>>;

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly school: string;
  readonly year: number;
  /** 1시간 수업 시간(분) */
  readonly minutes: number;
  readonly classes: ByGrade<number>;
  /** 학년 → 교과 → [1학기, 2학기] */
  readonly alloc: ByGrade<Readonly<Record<string, Pair>>>;
  /** 학년 → [자율·자치, 동아리, 진로] */
  readonly cca: ByGrade<readonly [number, number, number]>;
  /** 1~2학년 안전교육 */
  readonly safety: Readonly<{ 1: number; 2: number }>;
  /** 1학년 입학 초기 적응 활동 */
  readonly adapt: number;
  /** 5~6학년 실과 내 정보교육 */
  readonly info: Readonly<{ 5: number; 6: number }>;
  readonly autonomy: Readonly<{ 3: Autonomy; 4: Autonomy; 5: Autonomy; 6: Autonomy }>;
  readonly calendar: Calendar;
  readonly weekly: ByGrade<Weekly>;
  /** 검토 기준 (기본값: 2022 개정 교육과정) */
  readonly rules: Rules;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AppData {
  readonly version: 1;
  readonly projects: readonly Project[];
  readonly currentId: string | null;
}

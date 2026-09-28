import type { GradeGroup, GradeGroupKey, GradeNo } from '../domain/types';

/*
 * 2022 개정 교육과정 초등학교 시간 배당 기준 (교육부 고시 제2022-33호)
 * - 1시간 수업은 40분, 학년군별 34주 기준
 * - 교과(군)별 20% 범위 내 증감, 체육·예술(음악/미술)은 기준 시수 감축 불가
 * - 학년군별 총 수업시간 수는 최소 시수
 */
export const STANDARDS: Readonly<Record<GradeGroupKey, GradeGroup>> = {
  '1-2': {
    label: '1~2학년군', grades: [1, 2], total: 1744,
    groups: [
      { key: '국어', subs: ['국어'], std: 482 },
      { key: '수학', subs: ['수학'], std: 256 },
      { key: '바른 생활', subs: ['바른 생활'], std: 144 },
      { key: '슬기로운 생활', subs: ['슬기로운 생활'], std: 224 },
      { key: '즐거운 생활', subs: ['즐거운 생활'], std: 400 },
      { key: '창의적 체험활동', subs: ['창의적 체험활동'], std: 238, cca: true, note: '안전교육 64시간 포함' },
    ],
  },
  '3-4': {
    label: '3~4학년군', grades: [3, 4], total: 1972,
    groups: [
      { key: '국어', subs: ['국어'], std: 408 },
      { key: '사회/도덕', subs: ['사회', '도덕'], std: 272 },
      { key: '수학', subs: ['수학'], std: 272 },
      { key: '과학/실과', subs: ['과학'], std: 204 },
      { key: '체육', subs: ['체육'], std: 204, noCut: true },
      { key: '예술(음악/미술)', subs: ['음악', '미술'], std: 272, noCut: true },
      { key: '영어', subs: ['영어'], std: 136 },
      { key: '창의적 체험활동', subs: ['창의적 체험활동'], std: 204, cca: true },
    ],
  },
  '5-6': {
    label: '5~6학년군', grades: [5, 6], total: 2176,
    groups: [
      { key: '국어', subs: ['국어'], std: 408 },
      { key: '사회/도덕', subs: ['사회', '도덕'], std: 272 },
      { key: '수학', subs: ['수학'], std: 272 },
      { key: '과학/실과', subs: ['과학', '실과'], std: 340, note: '실과 내 정보교육 34시간 이상' },
      { key: '체육', subs: ['체육'], std: 204, noCut: true },
      { key: '예술(음악/미술)', subs: ['음악', '미술'], std: 272, noCut: true },
      { key: '영어', subs: ['영어'], std: 204 },
      { key: '창의적 체험활동', subs: ['창의적 체험활동'], std: 204, cca: true },
    ],
  },
};

export const GROUP_KEYS = Object.keys(STANDARDS) as GradeGroupKey[];
export const GRADES: readonly GradeNo[] = [1, 2, 3, 4, 5, 6];
export const CCA = '창의적 체험활동';
export const CCA_AREAS = ['자율·자치 활동', '동아리 활동', '진로 활동'] as const;

/** 증감 허용 범위(%) */
export const MAX_CHANGE_PCT = 20;
export const MIN_SCHOOL_DAYS = 190;
export const STANDARD_WEEKS = 34;
export const SAFETY_MIN = 64;
export const INFO_MIN = 34;

/** 한 학년의 기본 연간 시수 (학년군 기준 시수를 두 학년에 나눈 값) */
const BASE: Readonly<Record<GradeGroupKey, Readonly<Record<string, number>>>> = {
  '1-2': { 국어: 241, 수학: 128, '바른 생활': 72, '슬기로운 생활': 112, '즐거운 생활': 200, [CCA]: 119 },
  '3-4': { 국어: 204, 사회: 102, 도덕: 34, 수학: 136, 과학: 102, 체육: 102, 음악: 68, 미술: 68, 영어: 68, [CCA]: 102 },
  '5-6': { 국어: 204, 사회: 102, 도덕: 34, 수학: 136, 과학: 102, 실과: 68, 체육: 102, 음악: 68, 미술: 68, 영어: 102, [CCA]: 102 },
};

export const groupKeyOf = (g: GradeNo): GradeGroupKey => (g <= 2 ? '1-2' : g <= 4 ? '3-4' : '5-6');
export const subjectsOf = (g: GradeNo): readonly string[] => STANDARDS[groupKeyOf(g)].groups.flatMap((x) => x.subs);
export const defaultAnnual = (g: GradeNo, subject: string): number => BASE[groupKeyOf(g)][subject] ?? 0;

/** 인쇄·CSV에 쓰는 교과 순서 */
export const ALL_SUBJECTS = ['국어', '사회', '도덕', '수학', '과학', '실과', '체육', '음악', '미술', '영어', '바른 생활', '슬기로운 생활', '즐거운 생활'] as const;

const SHORT: Readonly<Record<string, string>> = { '바른 생활': '바생', '슬기로운 생활': '슬생', '즐거운 생활': '즐생', [CCA]: '창체' };
export const shortName = (s: string): string => SHORT[s] ?? s;

/** 시간표 자동 배치에서 오전(앞 교시)에 먼저 두는 순서 */
export const TIMETABLE_PRIORITY = ['국어', '수학', '사회', '과학', '영어', '도덕', '실과', '바른 생활', '슬기로운 생활', '즐거운 생활', '체육', '음악', '미술', CCA];

/** 학년 기본 요일별 교시 수 (연간 시수 ÷ 34주에 맞춤) */
export const DEFAULT_PER_DAY: Readonly<Record<GradeGroupKey, readonly number[]>> = {
  '1-2': [5, 5, 5, 5, 6],
  '3-4': [6, 6, 6, 6, 5],
  '5-6': [6, 7, 6, 7, 6],
};

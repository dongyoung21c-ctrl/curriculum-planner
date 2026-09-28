import type { ViewId } from '../domain/validate';

export interface ViewInfo {
  readonly id: ViewId;
  readonly title: string;
  /** 24×24 아이콘 경로 */
  readonly icon: string;
}

export const VIEWS: readonly ViewInfo[] = [
  { id: 'overview', title: '개요', icon: 'M3 13h6V3H3v10zm8 8h10V11H11v10zM3 21h6v-6H3v6zM11 3v6h10V3H11z' },
  { id: 'alloc', title: '편제표·시간배당', icon: 'M3 4h18v2H3zm0 5h18v2H3zm0 5h18v2H3zm0 5h18v2H3z' },
  { id: 'cca', title: '창체·자율시간', icon: 'M12 2l3 7h7l-5.5 4.5 2 7.5-6.5-4.5L5.5 21l2-7.5L2 9h7z' },
  { id: 'calendar', title: '학사일정·수업일수', icon: 'M7 2v2H4v18h16V4h-3V2h-2v2H9V2H7zm-1 8h12v10H6V10z' },
  { id: 'weekly', title: '주간 시수 배당', icon: 'M4 4h16v4H4zm0 6h7v10H4zm9 0h7v10h-7z' },
  { id: 'review', title: '파일 검토', icon: 'M6 2h9l5 5v15H6V2zm2.5 12.4l1.4-1.4 2 2 4.2-4.2 1.4 1.4-5.6 5.6z' },
  { id: 'rules', title: '시수 기준 설정', icon: 'M3 5h10v2H3zm14 0h4v2h-4zm-2-2h2v6h-2zM3 11h4v2H3zm8 0h10v2H11zM9 9h2v6H9zm-6 8h10v2H3zm14 0h4v2h-4zm-2-2h2v6h-2z' },
  { id: 'print', title: '인쇄·내보내기', icon: 'M6 3h12v5H6zm-3 6h18v8h-3v4H6v-4H3zm5 5v5h8v-5z' },
  { id: 'settings', title: '설정', icon: 'M12 8a4 4 0 100 8 4 4 0 000-8zm7 4l2-1.5-2-3.5-2.4 1a7 7 0 00-2-1.2L14 4h-4l-.6 2.8a7 7 0 00-2 1.2L5 7 3 10.5 5 12l-2 1.5L5 17l2.4-1a7 7 0 002 1.2L10 20h4l.6-2.8a7 7 0 002-1.2l2.4 1 2-3.5z' },
];

export function parseView(hash: string): ViewId {
  const id = hash.replace(/^#\/?/, '').split('/')[0];
  return VIEWS.some((v) => v.id === id) ? (id as ViewId) : 'overview';
}

export const viewHash = (id: ViewId): string => `#/${id}`;

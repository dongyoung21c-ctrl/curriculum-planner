import { ALL_SUBJECTS, CCA, GRADES } from '../../data/standards';
import { annual, ccaTotal, fmt, gradeTotal } from '../../domain/hours';
import type { GradeNo, Project } from '../../domain/types';

interface Row {
  readonly label: string;
  readonly value: (g: GradeNo) => number | null;
  readonly cls?: string;
  /** 합계 칸을 비울지 */
  readonly noTotal?: boolean;
  readonly decimals?: boolean;
}

/** 전체 학년 연간 편제표 (화면과 인쇄물에서 함께 쓴다) */
export function SummaryTable({ p, plain }: { p: Project; plain?: boolean }) {
  const hasAutonomy = ([3, 4, 5, 6] as const).some((g) => p.autonomy[g].hours > 0);
  const rows: Row[] = [
    ...ALL_SUBJECTS.map((s) => ({ label: s, value: (g: GradeNo) => (p.alloc[g][s] ? annual(p, g, s) : null) })),
    { label: '교과 소계', value: (g) => gradeTotal(p, g) - ccaTotal(p, g), cls: 'grp' },
    { label: CCA, value: (g) => ccaTotal(p, g) },
    ...(hasAutonomy
      ? [{ label: '(학교자율시간)', value: (g: GradeNo) => (g >= 3 ? p.autonomy[g as 3 | 4 | 5 | 6].hours || null : null) }]
      : []),
    { label: '학년별 연간 총 시수', value: (g) => gradeTotal(p, g), cls: 'total' },
    { label: `주당 평균(${p.rules.weeks}주)`, value: (g) => gradeTotal(p, g) / p.rules.weeks, noTotal: true, decimals: true },
  ];
  const show = (v: number | null, decimals?: boolean) => (v === null ? '' : decimals ? v.toFixed(1) : fmt(v));
  return (
    <table class={plain ? '' : 't'} style={{ minWidth: plain ? 0 : '640px' }}>
      <thead>
        <tr>
          <th class="l">구분</th>
          {GRADES.map((g) => (
            <th key={g}>{g}학년</th>
          ))}
          <th class="sep">계</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} class={r.cls ?? ''}>
            <td class="l">{r.label}</td>
            {GRADES.map((g) => (
              <td key={g}>{show(r.value(g), r.decimals)}</td>
            ))}
            <td class="sep">
              <b>{r.noTotal ? '' : fmt(GRADES.reduce((a, g) => a + (r.value(g) ?? 0), 0))}</b>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

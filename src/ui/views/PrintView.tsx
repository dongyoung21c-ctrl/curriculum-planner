import { useRef } from 'preact/hooks';
import { CCA_AREAS, GRADES, GROUP_KEYS, STANDARDS } from '../../data/standards';
import { calendarStats } from '../../domain/calendar';
import { ccaTotal, fmt, gradeGroupTotal, groupStatus, minTotal, signed } from '../../domain/hours';
import { groupsOf, ruleChanges } from '../../domain/rules';
import type { Project } from '../../domain/types';
import { toCsv } from '../../domain/validate';
import { weeklyStats } from '../../domain/weekly';
import { useStore } from '../../state/store';
import { MAX_FILE_BYTES, parseImport, projectFileName, toProjectJson } from '../../storage/storage';
import { Panel, useToast } from '../common';
import { downloadText, pageCss } from '../download';
import { SummaryTable } from './SummaryTable';

export function PrintView() {
  const { project: p, dispatch } = useStore();
  const toast = useToast();
  const sheet = useRef<HTMLDivElement>(null);
  if (!p) return null;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return toast('파일이 너무 커요.');
    try {
      const r = parseImport(await file.text());
      if (!r.ok) return toast(r.error);
      dispatch({ type: 'import', projects: r.projects });
      toast([`프로젝트 ${r.projects.length}개를 불러왔어요.`, ...r.notes].join(' '));
    } catch {
      toast('파일을 읽지 못했어요.');
    }
  };

  const exportHtml = () => {
    const body = sheet.current?.outerHTML ?? '';
    const title = `${p.year}학년도 교육과정 편제표`;
    const doc = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title><style>${pageCss()}body{padding:24px}.print-sheet{margin:0 auto}</style></head><body>${body}</body></html>`;
    downloadText(projectFileName(p, 'html', '편제표'), doc, 'text/html');
  };

  return (
    <>
      <Panel
        class="no-print"
        title="인쇄 및 내보내기"
        sub="아래 서식은 A4 가로로 인쇄돼요. JSON 백업은 다른 컴퓨터로 옮기거나 동료에게 보낼 때 쓰세요."
        actions={
          <div class="row">
            <button type="button" class="btn primary" onClick={() => window.print()}>인쇄 / PDF 저장</button>
            <button type="button" class="btn" onClick={() => downloadText(projectFileName(p, 'json'), toProjectJson(p), 'application/json')}>JSON 백업</button>
            <button type="button" class="btn" onClick={() => downloadText(projectFileName(p, 'csv', '편제표'), `﻿${toCsv(p)}`, 'text/csv')}>편제표 CSV</button>
            <button type="button" class="btn" onClick={exportHtml}>HTML 문서</button>
            <label class="btn file-btn">
              JSON 불러오기
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  void onFile(e.currentTarget.files?.[0]);
                  e.currentTarget.value = '';
                }}
              />
            </label>
          </div>
        }
      >
        <div class="pb hint">불러온 프로젝트는 지금 프로젝트를 덮어쓰지 않고 새 프로젝트로 추가돼요. 이전 claude.ai 버전에서 내려받은 JSON도 불러올 수 있어요.</div>
      </Panel>
      <div ref={sheet}>
        <PrintSheet p={p} />
      </div>
    </>
  );
}

function PrintSheet({ p }: { p: Project }) {
  const cs = calendarStats(p);
  const MIN_SCHOOL_DAYS = p.rules.minSchoolDays;
  const changed = ruleChanges(p.rules);
  const discInTerms = [...p.calendar.disc].filter((x) => cs.dayType(x.date).type === 'discretionary').sort((a, b) => (a.date < b.date ? -1 : 1));
  return (
    <div class="print-sheet" id="sheet">
      <h2>{p.year}학년도 {p.school || '○○초등학교'} 교육과정 편제 및 시간 배당표</h2>
      <div class="ps">2022 개정 교육과정(교육부 고시 제2022-33호) 시간 배당 기준 · 1시간 수업 {p.minutes}분 · 연간 {p.rules.weeks}주 기준 · 작성일 {new Date().toLocaleDateString('ko-KR')}
        {changed.length > 0 && <><br />학교·지역 기준 적용: {changed.join(', ')}</>}
      </div>

      <h3>1. 학년별 편제 및 연간 시간 배당</h3>
      <SummaryTable p={p} plain />

      <h3>2. 학년군별 교과(군) 기준 시수 대비 편성 현황</h3>
      <table>
        <thead><tr><th>학년군</th><th>교과(군)</th><th>기준 시수</th><th>편성 시수</th><th>증감</th><th>증감률</th><th>비고</th></tr></thead>
        <tbody>
          {GROUP_KEYS.map((gk) => {
            const S = { ...STANDARDS[gk], total: minTotal(p, gk) };
            const tot = gradeGroupTotal(p, gk);
            return [
              ...groupsOf(p.rules, gk).map((grp, i) => {
                const st = groupStatus(p, gk, grp);
                return (
                  <tr key={`${gk}${grp.key}`}>
                    {i === 0 && <td rowSpan={S.groups.length + 1}>{S.label}</td>}
                    <td class="l">{grp.key}</td>
                    <td>{fmt(grp.std)}</td>
                    <td>{fmt(st.sum)}</td>
                    <td>{st.diff ? signed(st.diff) : '0'}</td>
                    <td>{st.diff ? `${signed(st.pct)}%` : '-'}</td>
                    <td>{st.level === 'bad' ? '재검토' : st.level === 'info' ? '증감 편성' : '기준'}</td>
                  </tr>
                );
              }),
              <tr key={`${gk}total`}>
                <td class="l"><b>학년군 총 수업시간 수</b></td>
                <td><b>{fmt(S.total)}</b></td>
                <td><b>{fmt(tot)}</b></td>
                <td>{tot - S.total ? signed(tot - S.total) : '0'}</td>
                <td />
                <td>{tot < S.total ? '미달' : '충족'}</td>
              </tr>,
            ];
          })}
        </tbody>
      </table>

      <h3>3. 창의적 체험활동 영역별 시간 배당</h3>
      <table>
        <thead><tr><th>학년</th><th>창체 계</th>{CCA_AREAS.map((a) => <th key={a}>{a}</th>)}<th>비고</th></tr></thead>
        <tbody>
          {GRADES.map((g) => {
            const notes: string[] = [];
            if (g <= 2) notes.push(`안전교육 ${fmt(p.safety[g as 1 | 2])}시간`);
            if (g === 1 && p.adapt) notes.push(`입학 초기 적응 ${fmt(p.adapt)}시간`);
            if (g >= 5) notes.push(`실과 내 정보교육 ${fmt(p.info[g as 5 | 6])}시간`);
            if (g >= 3) {
              const au = p.autonomy[g as 3 | 4 | 5 | 6];
              if (au.hours) notes.push(`학교자율시간 ${fmt(au.hours)}시간(${au.name || '미정'})`);
            }
            return (
              <tr key={g}>
                <td>{g}학년</td>
                <td>{fmt(ccaTotal(p, g))}</td>
                {p.cca[g].map((v, i) => <td key={i}>{fmt(v)}</td>)}
                <td class="l">{notes.join(' · ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3>4. 학사 운영 및 수업일수</h3>
      <table>
        <thead><tr><th>구분</th><th>기간</th><th>수업일수</th><th>수업 주수</th><th>비고</th></tr></thead>
        <tbody>
          {cs.terms.map((t) => (
            <tr key={t.name}><td>{t.name}</td><td>{t.start} ~ {t.end}</td><td>{t.days}일</td><td>{t.weeks}주</td><td /></tr>
          ))}
          <tr>
            <td><b>계</b></td><td /><td><b>{cs.total}일</b></td><td>{cs.weeks}주</td>
            <td class="l">
              기준 {MIN_SCHOOL_DAYS}일 이상 {cs.total >= MIN_SCHOOL_DAYS ? '충족' : '미달'} · 재량휴업일 {discInTerms.length}일
              {discInTerms.length > 0 && ` (${discInTerms.map((x) => x.date.slice(5).replace('-', '.')).join(', ')})`}
            </td>
          </tr>
        </tbody>
      </table>

      <h3>5. 학년별 주당 시수 배당</h3>
      <table>
        <thead><tr><th>학년</th><th>월</th><th>화</th><th>수</th><th>목</th><th>금</th><th>주당 계</th><th>1학기 주당 편성</th><th>2학기 주당 편성</th><th>학기 주수</th></tr></thead>
        <tbody>
          {GRADES.map((g) => {
            const w = p.weekly[g];
            const ws = weeklyStats(p, g);
            return (
              <tr key={g}>
                <td>{g}학년</td>
                {w.perDay.map((x, i) => <td key={i}>{x}</td>)}
                <td><b>{ws.slots}</b></td><td>{ws.weeklySum[0]}</td><td>{ws.weeklySum[1]}</td>
                <td>{w.weeks[0]} + {w.weeks[1]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div class="sig">
        {['담당', '연구부장', '교감', '교장'].map((r) => <div key={r}>{r}<div class="box" /></div>)}
      </div>
    </div>
  );
}

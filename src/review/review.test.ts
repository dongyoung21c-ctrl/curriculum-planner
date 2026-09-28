import { strToU8, zipSync } from 'fflate';
import { defaultRules, setGroupRule } from '../domain/rules';
import { newProject } from '../domain/project';
import { columnInfo, extractFromTable, findPlans, labelOf, numberOf, reviewValues, setReviewValue, toReviewValues } from './interpret';
import { alignPdfPieces, cellRef, parseCsv, readHwpx, readXlsx } from './tables';
import { readReviewFile } from './readFile';

/* ───── 시험용 표 ───── */

const G = ['1', '2', '3', '4', '5', '6'];
const BASE: Record<string, (number | null)[]> = {
  국어: [241, 241, 204, 204, 204, 204],
  사회: [null, null, 102, 102, 102, 102],
  도덕: [null, null, 34, 34, 34, 34],
  수학: [128, 128, 136, 136, 136, 136],
  과학: [null, null, 102, 102, 102, 102],
  실과: [null, null, null, null, 68, 68],
  체육: [null, null, 102, 102, 102, 102],
  음악: [null, null, 68, 68, 68, 68],
  미술: [null, null, 68, 68, 68, 68],
  영어: [null, null, 68, 68, 102, 102],
  '바른 생활': [72, 72, null, null, null, null],
  '슬기로운 생활': [112, 112, null, null, null, null],
  '즐거운 생활': [200, 200, null, null, null, null],
  '창의적 체험활동': [119, 119, 102, 102, 102, 102],
};

/** 학년마다 1학기·2학기·계 세 칸, 머리글 두 줄 (학년 칸은 병합) */
function semesterLayout(values = BASE): string[][] {
  const head1 = ['교과', ...G.flatMap((g) => [`${g}학년`, '', ''])];
  const head2 = ['', ...G.flatMap(() => ['1학기', '2학기', '계'])];
  const rows = Object.entries(values).map(([s, v]) => [s, ...v.flatMap((n) => (n === null ? ['', '', ''] : [String(Math.ceil(n / 2)), String(Math.floor(n / 2)), String(n)]))]);
  return [['2026학년도 교육과정 편제표'], head1, head2, ...rows, ['합계', '1', '2', '3']];
}

/** 교과(군)·교과 두 칸, 기준 칸, 학년별 연간 한 칸 */
function annualLayout(): string[][] {
  const rows = [['구분', '', '기준 시수', ...G.map((g) => `${g}학년`), '계']];
  rows.push(['사회/도덕', '사회', '272', '', '', '102', '102', '102', '102', '408']);
  rows.push(['', '도덕', '', '', '', '34', '34', '34', '34', '136']);
  rows.push(['국어', '', '482', '241', '241', '204', '204', '204', '204', '1,298']);
  rows.push(['수학', '', '256', '128', '128', '136', '136', '136', '136', '800']);
  rows.push(['창의적 체험활동', '', '238', '119', '119', '102', '102', '102', '102', '646']);
  return rows;
}

function xlsx(rows: string[][], merges: string[] = []): Uint8Array {
  const col = (i: number) => String.fromCharCode(65 + (i % 26)).padStart(i >= 26 ? 2 : 1, 'A');
  const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
    .map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => (v === '' ? '' : /^\d+$/.test(v) ? `<c r="${col(ci)}${ri + 1}"><v>${v}</v></c>` : `<c r="${col(ci)}${ri + 1}" t="inlineStr"><is><t>${v}</t></is></c>`)).join('')}</row>`)
    .join('')}</sheetData>${merges.length ? `<mergeCells>${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}</worksheet>`;
  return zipSync({
    'xl/workbook.xml': strToU8('<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="편제" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  });
}

function hwpx(rows: string[][], spans: Record<string, number> = {}): Uint8Array {
  const cell = (v: string, r: number, c: number) =>
    `<hp:tc><hp:subList><hp:p><hp:run><hp:t>${v}</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="${c}" rowAddr="${r}"/><hp:cellSpan colSpan="${spans[`${r},${c}`] ?? 1}" rowSpan="1"/></hp:tc>`;
  const tbl = `<hp:tbl>${rows.map((r, ri) => `<hp:tr>${r.map((v, ci) => cell(v, ri, ci)).join('')}</hp:tr>`).join('')}</hp:tbl>`;
  const xml = `<?xml version="1.0"?><hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"><hp:p><hp:run><hp:t>머리말</hp:t></hp:run></hp:p><hp:p><hp:run>${tbl}</hp:run></hp:p></hs:sec>`;
  return zipSync({ 'Contents/section0.xml': strToU8(xml), mimetype: strToU8('application/hwp+zip') });
}

const fileOf = (name: string, data: Uint8Array | string) => new File([typeof data === 'string' ? data : new Uint8Array(data)], name);

/* ───── 테스트 ───── */

describe('칸 읽기 도우미', () => {
  it('교과 이름을 알아본다', () => {
    expect(labelOf('창의적 체험활동')).toBe('창의적 체험활동');
    expect(labelOf('창체')).toBe('창의적 체험활동');
    expect(labelOf('사회 · 도덕')).toBe('사회/도덕');
    expect(labelOf('예술(음악/미술)')).toBe('예술(음악/미술)');
    expect(labelOf('국어(국어활동 포함)')).toBe('국어');
    expect(labelOf('교과 소계')).toBeNull();
    expect(labelOf('합계')).toBeNull();
    expect(labelOf('비고')).toBeNull();
  });

  it('숫자를 읽는다', () => {
    expect(numberOf('1,744')).toBe(1744);
    expect(numberOf('482(+34)')).toBe(482);
    expect(numberOf('(204)')).toBe(204);
    expect(numberOf('-')).toBeNull();
    expect(numberOf(undefined)).toBeNull();
  });

  it('머리글에서 학년·학기·기준을 알아본다', () => {
    expect(columnInfo('3학년 1학기')).toMatchObject({ grade: 3, sem: 0, skip: false });
    expect(columnInfo('5학년 계')).toMatchObject({ grade: 5, sem: 'total' });
    expect(columnInfo('1~2학년군 편성')).toMatchObject({ grade: null, group: '1-2', plan: true });
    expect(columnInfo('3-4학년군 기준')).toMatchObject({ group: '3-4', skip: true });
    expect(columnInfo('증감')).toMatchObject({ skip: true });
  });

  it('CSV·셀 주소·PDF 줄 묶기', () => {
    expect(parseCsv('﻿"국어","1,744"\r\n수학,2\n')).toEqual([['국어', '1,744'], ['수학', '2']]);
    expect(parseCsv('a\tb\nc\td')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseCsv('"a ""b"""')).toEqual([['a "b"']]);
    expect(cellRef('C5')).toEqual({ row: 4, col: 2 });
    expect(cellRef('AA1')).toEqual({ row: 0, col: 26 });
    expect(alignPdfPieces([{ str: '수학', x: 10, y: 100 }, { str: '128', x: 60, y: 101 }, { str: '국어', x: 10, y: 120 }, { str: ' ', x: 5, y: 1 }])).toEqual([['국어'], ['수학', '128']]);
  });
});

describe('편제표 찾기', () => {
  it('학기·계 칸이 있는 표에서 학년별 연간 시수를 읽는다', () => {
    const [plan] = findPlans([{ name: 'csv', rows: semesterLayout() }]);
    expect(plan?.grades[1]).toMatchObject({ 국어: 241, 수학: 128, '창의적 체험활동': 119 });
    expect(plan?.grades[5]).toMatchObject({ 실과: 68, 영어: 102 });
    expect(plan?.grades[1]?.['사회']).toBeUndefined();
  });

  it('교과(군)·교과 두 칸, 기준 칸이 있는 표', () => {
    const ex = extractFromTable({ name: 't', rows: annualLayout() });
    expect(ex.grades[3]).toMatchObject({ 사회: 102, 도덕: 34, 국어: 204 });
    expect(ex.grades[1]).toMatchObject({ 국어: 241 });
    expect(ex.grades[1]?.['사회']).toBeUndefined();
  });

  it('학년군 칸만 있는 표', () => {
    const rows = [['교과(군)', '1~2학년군 기준', '1~2학년군 편성', '3~4학년군 기준', '3~4학년군 편성'], ['국어', '482', '490', '408', '400'], ['수학', '256', '256', '272', '272'], ['체육', '', '', '204', '200']];
    const ex = extractFromTable({ name: 't', rows });
    expect(ex.groups['1-2']).toEqual({ 국어: 490, 수학: 256 });
    expect(ex.groups['3-4']).toEqual({ 국어: 400, 수학: 272, 체육: 200 });
  });

  it('머리글 칸이 없으면 숫자 순서로 읽는다', () => {
    const rows = [['교육과정 편제'], ['구분 1학년 2학년 3학년 4학년 5학년 6학년 계'], ['1학년', '2학년', '3학년', '4학년', '5학년', '6학년'], ['국어 시수'], ['국어', '241', '241', '204', '204', '204', '204', '1,298'], ['수학', '128', '128', '136', '136', '136', '136', '800'], ['창의적 체험활동', '119', '119', '102', '102', '102', '102']];
    const ex = extractFromTable({ name: 't', rows: rows.slice(2) });
    expect(ex.grades[6]).toMatchObject({ 국어: 204, 수학: 136, '창의적 체험활동': 102 });
  });

  it('PDF는 숫자의 가로 위치로 학년 칸을 맞춘다 (빈칸이 있어도 밀리지 않는다)', () => {
    const w = 20;
    const xs = [100, 150, 200, 250, 300, 350];
    const piece = (str: string, x: number, y: number) => ({ str, x, y, width: w });
    const pieces = [
      piece('2026학년도 편제표', 10, 800),
      piece('구분', 10, 700), ...xs.map((x, i) => piece(`${i + 1}학년`, x, 700)),
      piece('국어', 10, 680), ...xs.map((x, i) => piece(String([241, 241, 204, 204, 204, 204][i]), x + 4, 680)),
      piece('체육', 10, 660), ...xs.slice(2).map((x) => piece('102', x + 4, 660)),
      piece('창의적', 10, 640), piece('체험활동', 40, 640), ...xs.map((x, i) => piece(String([119, 119, 102, 102, 102, 102][i]), x + 4, 640)),
    ];
    const rows = alignPdfPieces(pieces);
    expect(rows[0]).toEqual(['구분', '1학년', '2학년', '3학년', '4학년', '5학년', '6학년']);
    const ex = extractFromTable({ name: '1쪽', rows });
    expect(ex.grades[3]?.['체육']).toBe(102);
    expect(ex.grades[1]?.['체육']).toBeUndefined();
    expect(ex.grades[1]?.['창의적 체험활동']).toBe(119);
  });

  it('PDF에 학기 머리글 줄이 있으면 계 칸을 쓴다', () => {
    const piece = (str: string, x: number, y: number) => ({ str, x, y, width: 16 });
    const pieces = [
      piece('1학년', 130, 700), piece('2학년', 250, 700),
      piece('1학기', 100, 690), piece('2학기', 130, 690), piece('계', 160, 690), piece('1학기', 220, 690), piece('2학기', 250, 690), piece('계', 280, 690),
      piece('국어', 10, 670), piece('121', 100, 670), piece('120', 130, 670), piece('241', 160, 670), piece('121', 220, 670), piece('120', 250, 670), piece('241', 280, 670),
      piece('수학', 10, 650), piece('64', 100, 650), piece('64', 130, 650), piece('128', 160, 650), piece('64', 220, 650), piece('64', 250, 650), piece('128', 280, 650),
      piece('즐거운 생활', 10, 630), piece('100', 100, 630), piece('100', 130, 630), piece('200', 160, 630), piece('100', 220, 630), piece('100', 250, 630), piece('200', 280, 630),
    ];
    const ex = extractFromTable({ name: '1쪽', rows: alignPdfPieces(pieces) });
    expect(ex.grades[2]).toEqual({ 국어: 241, 수학: 128, '즐거운 생활': 200 });
  });

  it('편제표가 아닌 표는 버리고, 여러 개면 값이 많은 표가 먼저', () => {
    const small = { name: '작은 표', rows: [['구분', '1학년'], ['국어', '1'], ['수학', '2'], ['영어', '3']] };
    const plans = findPlans([{ name: '표 1', rows: [['이름', '전화']] }, small, { name: '큰 표', rows: semesterLayout() }]);
    expect(plans.map((p) => p.tableName)).toEqual(['큰 표', '작은 표']);
  });
});

describe('파일 읽기', () => {
  it('엑셀(.xlsx) — 병합된 학년 머리글', async () => {
    const r = await readReviewFile(fileOf('편제.xlsx', xlsx(semesterLayout(), ['B2:D2', 'E2:G2', 'H2:J2', 'K2:M2', 'N2:P2', 'Q2:S2'])));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plans[0]?.grades[4]).toMatchObject({ 국어: 204, 영어: 68 });
    expect(readXlsx(xlsx([['a']]))[0]?.name).toBe('시트 편제');
  });

  it('한글(.hwpx) — 칸 병합(colSpan)', async () => {
    const rows = semesterLayout().slice(1);
    const spans = Object.fromEntries(G.map((_, i) => [`0,${1 + i * 3}`, 3]));
    const withSpans = rows.map((r, ri) => (ri === 0 ? r.filter((_, ci) => ci === 0 || (ci - 1) % 3 === 0) : r));
    // colSpan을 쓴 첫 줄은 칸 수가 줄어든 대신 cellAddr로 자리를 잡는다
    const data = hwpx(withSpans.map((r, ri) => (ri === 0 ? r : r)), spans);
    const tables = readHwpx(data);
    expect(tables).toHaveLength(1);
    const r = await readReviewFile(fileOf('편제.hwpx', hwpxWithAddr(rows)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plans[0]?.grades[6]).toMatchObject({ 국어: 204, 실과: 68 });
  });

  it('CSV·JSON', async () => {
    const csv = semesterLayout().map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const r = await readReviewFile(fileOf('편제.csv', csv));
    expect(r.ok && r.plans[0]?.grades[2]?.['즐거운 생활']).toBe(200);
    const p = newProject({ school: '한빛초' });
    const j = await readReviewFile(fileOf('p.json', JSON.stringify(p)));
    expect(j.ok && j.plans[0]?.tableName).toBe('한빛초 · 2026학년도 교육과정');
    expect(j.ok && j.plans[0]?.grades[1]?.['국어']).toBe(241);
    const bad = await readReviewFile(fileOf('x.json', '{"a":1}'));
    expect(bad).toMatchObject({ ok: false });
  });

  it('읽을 수 없는 형식은 방법을 알려 준다', async () => {
    expect(await readReviewFile(fileOf('a.hwp', 'x'))).toMatchObject({ ok: false, error: expect.stringMatching(/hwpx/) });
    expect(await readReviewFile(fileOf('a.xls', 'x'))).toMatchObject({ ok: false, error: expect.stringMatching(/xlsx/) });
    expect(await readReviewFile(fileOf('a.docx', 'x'))).toMatchObject({ ok: false, error: expect.stringMatching(/올려 주세요/) });
    expect(await readReviewFile(fileOf('a.xlsx', 'not zip'))).toMatchObject({ ok: false, error: expect.stringMatching(/읽지 못했어요/) });
    expect(await readReviewFile(fileOf('a.csv', '이름,전화\n홍길동,1'))).toMatchObject({ ok: false, error: expect.stringMatching(/편제표를 찾지 못했어요/) });
    const big = fileOf('b.csv', 'x');
    Object.defineProperty(big, 'size', { value: 30 * 1024 * 1024 });
    expect(await readReviewFile(big)).toMatchObject({ ok: false, error: expect.stringMatching(/너무 커요/) });
  });
});

describe('검토', () => {
  const plan = () => findPlans([{ name: 't', rows: semesterLayout() }])[0]!;

  it('기준대로 짠 편제표는 위반이 없다', () => {
    const r = reviewValues(toReviewValues(plan()), defaultRules());
    expect(r.missing).toEqual([]);
    expect(r.checks.filter((c) => c.level === 'bad')).toEqual([]);
  });

  it('체육을 줄이거나 20%를 넘기면 위반으로 잡는다', () => {
    let v = toReviewValues(plan());
    v = setReviewValue(v, 3, '체육', 90);
    v = setReviewValue(v, 5, '영어', 150);
    const bad = reviewValues(v, defaultRules()).checks.filter((c) => c.level === 'bad').map((c) => c.title);
    expect(bad).toContain('3~4학년군 체육 감축 불가');
    expect(bad).toContain('5~6학년군 영어 20% 초과');
  });

  it('바꾼 기준으로 검토한다', () => {
    const rules = setGroupRule('3-4', '체육', { noCut: false })(defaultRules());
    const v = setReviewValue(toReviewValues(plan()), 3, '체육', 90);
    const titles = reviewValues(v, rules).checks.map((c) => c.title);
    expect(titles).not.toContain('3~4학년군 체육 감축 불가');
  });

  it('못 찾은 교과(군)은 위반 대신 따로 알리고 총 시수는 확인하지 않는다', () => {
    let v = toReviewValues(plan());
    v = setReviewValue(v, 3, '영어', null);
    v = setReviewValue(v, 4, '영어', null);
    const r = reviewValues(v, defaultRules());
    expect(r.missing).toEqual(['3~4학년군 영어']);
    expect(r.checks.some((c) => c.title.includes('3~4학년군 영어'))).toBe(false);
    expect(r.checks.some((c) => c.title === '3~4학년군 총 수업시간 수는 확인하지 못했어요')).toBe(true);
  });

  it('교과(군)으로 묶인 값·학년군 값은 첫 교과·첫 학년에 넣는다', () => {
    const v = toReviewValues({ tableName: 't', grades: { 3: { '사회/도덕': 136 } }, groups: { '5-6': { 영어: 204, '예술(음악/미술)': 272 } }, score: 3 });
    expect(v[3]).toMatchObject({ 사회: 136, 도덕: 0 });
    expect(v[5]).toMatchObject({ 영어: 204, 음악: 272, 미술: 0 });
    expect(v[6]).toMatchObject({ 영어: 0, 음악: 0, 미술: 0 });
    const r = reviewValues(v, defaultRules());
    expect(r.checks.find((c) => c.title.startsWith('5~6학년군 예술'))).toBeUndefined();
  });
});

/** cellAddr로 칸 자리를 잡는 한글 표 (첫 줄은 학년 머리글이 세 칸씩 병합) */
function hwpxWithAddr(rows: string[][]): Uint8Array {
  const cells = rows.map((r, ri) =>
    ri === 0
      ? r.flatMap((v, ci) => (ci === 0 ? [{ v, c: 0, span: 1 }] : (ci - 1) % 3 === 0 ? [{ v, c: ci, span: 3 }] : []))
      : r.map((v, ci) => ({ v, c: ci, span: 1 })),
  );
  const tbl = `<hp:tbl>${cells
    .map((r, ri) => `<hp:tr>${r.map(({ v, c, span }) => `<hp:tc><hp:subList><hp:p><hp:run><hp:t>${v}</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="${c}" rowAddr="${ri}"/><hp:cellSpan colSpan="${span}" rowSpan="1"/></hp:tc>`).join('')}</hp:tr>`)
    .join('')}</hp:tbl>`;
  const xml = `<?xml version="1.0"?><hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"><hp:p><hp:run>${tbl}</hp:run></hp:p></hs:sec>`;
  return zipSync({ 'Contents/section0.xml': strToU8(xml) });
}

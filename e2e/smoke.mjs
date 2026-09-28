// 빌드한 dist/index.html을 실제 브라우저(설치된 Chrome)로 열어 핵심 흐름을 확인한다.
// 사용: npm run build && npm run e2e   (SCREENSHOTS=폴더 를 주면 화면을 저장한다)
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';

const url = pathToFileURL(resolve('dist/index.html')).href;
const shots = process.env.SCREENSHOTS;
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
const errors = [];

const nav = (page, name) => page.getByRole('navigation', { name: '메뉴' }).getByRole('link', { name });
const shot = async (page, name) => shots && page.screenshot({ path: `${shots}/${name}.png` });
async function step(name, fn) {
  process.stdout.write(`- ${name} … `);
  await fn();
  console.log('ok');
}

try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 880 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('fonts.g') && errors.push(m.text()));
  await page.goto(url);

  await step('첫 프로젝트를 만들면 기준을 모두 충족한다', async () => {
    await page.getByRole('button', { name: '첫 프로젝트 만들기' }).click();
    await page.getByLabel('학교명').fill('한빛초등학교');
    await page.getByRole('button', { name: '만들기', exact: true }).click();
    await page.getByText('모든 기준 충족').waitFor();
    assert.equal(await page.locator('.kpi .v').nth(1).innerText(), '194일');
    await shot(page, '1-overview');
  });

  await step('편제표에서 예술을 줄이면 위반으로 잡는다', async () => {
    await nav(page, '편제표·시간배당').click();
    await page.getByRole('tab', { name: '5~6학년군' }).click();
    await page.getByLabel('5학년 음악 1학기').fill('30');
    await page.getByLabel('기준 위반 2건').waitFor();
    await page.getByLabel('5학년 음악 1학기').fill('34');
    await page.getByText('모든 기준 충족').count();
    await shot(page, '2-alloc');
  });

  await step('기준 시수로 초기화는 확인 창을 거친다', async () => {
    await page.getByRole('button', { name: '기준 시수로 초기화' }).click();
    await page.getByRole('dialog', { name: '기준 시수로 초기화' }).waitFor();
    await page.getByRole('button', { name: '초기화', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  });

  await step('달력에서 재량휴업일을 넣으면 수업일수가 줄어든다', async () => {
    await nav(page, '학사일정·수업일수').click();
    await page.getByRole('button', { name: /^4월 15일 수업일/ }).click();
    await page.waitForFunction(() => document.querySelector('.kpi .v')?.textContent === '193일');
    await shot(page, '3-calendar');
    await page.getByRole('button', { name: /^4월 15일 재량휴업일/ }).click();
  });

  await step('학교자율시간을 넣어도 주당 시수가 교시 수와 맞는다', async () => {
    await nav(page, '창체·자율시간').click();
    await page.getByLabel('5학년 학교자율시간 시수').fill('64');
    await nav(page, '주간 시수 배당').click();
    await page.getByRole('tab', { name: '5학년' }).click();
    await page.getByRole('button', { name: '편제 ÷ 주수로 자동 배당' }).click();
    await page.getByRole('button', { name: '다시 배당' }).click();
    await page.getByText('교시 수 일치').waitFor();
    await page.getByText('시간표가 1학기 주당 시수와 맞아요').waitFor();
    await shot(page, '4-weekly');
  });

  await step('시수 기준을 바꾸면 검토가 따라 바뀐다', async () => {
    await nav(page, '시수 기준 설정').click();
    await page.getByLabel('교과(군) 증감 허용 범위').fill('0');
    await nav(page, '개요').click();
    await page.getByText('바꾼 기준으로 검토 중').waitFor();
    await nav(page, '시수 기준 설정').click();
    await page.getByRole('button', { name: '2022 개정 기본값으로 되돌리기' }).click();
    await page.getByRole('button', { name: '되돌리기', exact: true }).click();
    await shot(page, '4b-rules');
  });

  await step('엑셀 편제표 파일을 검토한다', async () => {
    await nav(page, '파일 검토').click();
    await page.getByLabel('검토할 파일').setInputFiles({ name: '편제.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(sampleXlsx()) });
    await page.getByText('5~6학년군 체육 감축 불가').waitFor();
    await shot(page, '4c-review-xlsx');
  });

  await step('PDF 편제표도 읽는다 (pdf.js를 인터넷에서 불러옴)', async () => {
    const pdfPage = await browser.newPage();
    await pdfPage.setContent(sampleHtmlTable());
    const pdf = await pdfPage.pdf({ format: 'A4', landscape: true });
    await pdfPage.close();
    await page.getByLabel('검토할 파일').setInputFiles({ name: '편제.pdf', mimeType: 'application/pdf', buffer: pdf });
    await page.getByText('3~4학년군 영어 20% 초과').waitFor({ timeout: 60000 });
    assert.equal(await page.getByLabel('6학년 실과 연간 시수').inputValue(), '68');
    assert.equal(await page.getByLabel('1학년 국어 연간 시수').inputValue(), '241');
    await shot(page, '4d-review-pdf');
  });

  await step('인쇄 화면과 JSON 내려받기', async () => {
    await nav(page, '인쇄·내보내기').click();
    await page.getByText('2026학년도 한빛초등학교 교육과정 편제 및 시간 배당표').waitFor();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'JSON 백업' }).click()]);
    assert.equal(dl.suggestedFilename(), '2026학년도_한빛초등학교_교육과정편제.json');
    await shot(page, '5-print');
  });

  await step('새로고침해도 남아 있다', async () => {
    await page.reload();
    await page.locator('.crumb', { hasText: '한빛초등학교 · 2026학년도 교육과정' }).waitFor();
  });

  await step('휴대폰 너비에서 가로 스크롤이 없다', async () => {
    await page.setViewportSize({ width: 375, height: 800 });
    for (const h of ['overview', 'alloc', 'cca', 'calendar', 'weekly', 'print', 'settings']) {
      await page.goto(`${url}#/${h}`);
      await page.waitForTimeout(120);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `${h} 가로 넘침 ${overflow}px`);
    }
    await shot(page, '6-mobile');
  });

  assert.deepEqual(errors, [], '콘솔 오류가 없어야 한다');
  console.log('\n모든 흐름 통과');
} finally {
  await browser.close();
}

/* ───── 검토용 시험 파일 ───── */

function sampleRows(overrides = {}) {
  const base = {
    국어: [241, 241, 204, 204, 204, 204], 사회: [null, null, 102, 102, 102, 102], 도덕: [null, null, 34, 34, 34, 34],
    수학: [128, 128, 136, 136, 136, 136], 과학: [null, null, 102, 102, 102, 102], 실과: [null, null, null, null, 68, 68],
    체육: [null, null, 102, 102, 102, 102], 음악: [null, null, 68, 68, 68, 68], 미술: [null, null, 68, 68, 68, 68],
    영어: [null, null, 68, 68, 102, 102], '바른 생활': [72, 72, null, null, null, null], '슬기로운 생활': [112, 112, null, null, null, null],
    '즐거운 생활': [200, 200, null, null, null, null], '창의적 체험활동': [119, 119, 102, 102, 102, 102], ...overrides,
  };
  return [['교과', '1학년', '2학년', '3학년', '4학년', '5학년', '6학년'], ...Object.entries(base).map(([s, v]) => [s, ...v.map((n) => (n === null ? '' : String(n)))])];
}

function sampleXlsx() {
  const rows = sampleRows({ 체육: [null, null, 102, 102, 90, 102] });
  const col = (i) => String.fromCharCode(65 + i);
  const cells = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => (v === '' ? '' : /^\d+$/.test(v) ? `<c r="${col(ci)}${ri + 1}"><v>${v}</v></c>` : `<c r="${col(ci)}${ri + 1}" t="inlineStr"><is><t>${v}</t></is></c>`)).join('')}</row>`).join('');
  return zipSync({
    'xl/workbook.xml': strToU8('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="편제" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${cells}</sheetData></worksheet>`),
  });
}

function sampleHtmlTable() {
  const rows = sampleRows({ 영어: [null, null, 90, 90, 102, 102] });
  const tr = (r, tag) => `<tr>${r.map((c) => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
  return `<!doctype html><meta charset="utf-8"><style>body{font-family:'Malgun Gothic',sans-serif}table{border-collapse:collapse}td,th{border:1px solid #333;padding:4px 14px;text-align:right}td:first-child{text-align:left}</style>
    <h1>2026학년도 교육과정 편제표</h1><table>${tr(rows[0], 'th')}${rows.slice(1).map((r) => tr(r, 'td')).join('')}</table>`;
}

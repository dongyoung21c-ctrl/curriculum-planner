/*
 * 여러 형식의 파일에서 표를 꺼내 모두 같은 모양(문자열 2차원 배열)으로 만든다.
 * 병합된 칸은 왼쪽 위 칸의 글자로 채워서, 머리글이 "1학년"처럼 여러 칸에 걸쳐 있어도 칸마다 읽히게 한다.
 */
import { unzipSync, strFromU8 } from 'fflate';

export interface Table {
  /** 화면에 보여 줄 이름 (예: "시트 편제표", "표 3") */
  readonly name: string;
  readonly rows: readonly (readonly string[])[];
}

/* ───── CSV ───── */

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const delimiter = src.split('\n', 1)[0]?.includes('\t') && !src.split('\n', 1)[0]?.includes(',') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/* ───── 공통 ───── */

const byLocal = (el: Element | Document, name: string): Element[] => [...el.getElementsByTagNameNS('*', name)];
const children = (el: Element, name: string): Element[] => [...el.children].filter((c) => c.localName === name);
const textOf = (el: Element, name = 't'): string => byLocal(el, name).map((t) => t.textContent ?? '').join('');

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML을 읽지 못했어요.');
  return doc;
}

/** 칸 채우기: (행, 열) 위치에 글자를 넣고, 병합 범위는 같은 글자로 채운다 */
class Grid {
  private readonly cells = new Map<string, string>();
  private maxRow = -1;
  private maxCol = -1;

  set(r: number, c: number, v: string, rowSpan = 1, colSpan = 1): void {
    for (let i = 0; i < Math.max(1, rowSpan); i++) {
      for (let j = 0; j < Math.max(1, colSpan); j++) {
        const key = `${r + i},${c + j}`;
        if (!this.cells.has(key) || (i === 0 && j === 0)) this.cells.set(key, v);
        this.maxRow = Math.max(this.maxRow, r + i);
        this.maxCol = Math.max(this.maxCol, c + j);
      }
    }
  }

  get(r: number, c: number): string {
    return this.cells.get(`${r},${c}`) ?? '';
  }

  toRows(): string[][] {
    return Array.from({ length: this.maxRow + 1 }, (_, r) => Array.from({ length: this.maxCol + 1 }, (_, c) => this.get(r, c)));
  }
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/* ───── XLSX ───── */

/** "BC12" → { row: 11, col: 54 } */
export function cellRef(ref: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.toUpperCase());
  if (!m) return { row: 0, col: 0 };
  const col = [...(m[1] ?? 'A')].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return { row: Number(m[2]) - 1, col };
}

export function readXlsx(data: Uint8Array): Table[] {
  const files = unzipSync(data);
  const read = (path: string) => {
    const f = files[path];
    return f ? strFromU8(f) : null;
  };
  const workbook = read('xl/workbook.xml');
  if (!workbook) throw new Error('엑셀(.xlsx) 파일이 아니에요.');
  const shared = read('xl/sharedStrings.xml');
  const strings = shared ? byLocal(parseXml(shared), 'si').map((si) => textOf(si)) : [];
  const rels = read('xl/_rels/workbook.xml.rels');
  const targets = new Map<string, string>();
  if (rels) {
    for (const r of byLocal(parseXml(rels), 'Relationship')) {
      const target = (r.getAttribute('Target') ?? '').replace(/^\//, '');
      targets.set(r.getAttribute('Id') ?? '', target.startsWith('xl/') ? target : `xl/${target}`);
    }
  }
  const sheets = byLocal(parseXml(workbook), 'sheet');
  return sheets.flatMap((sheet, i) => {
    const rid = sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? sheet.getAttribute('r:id') ?? '';
    const xml = read(targets.get(rid) ?? `xl/worksheets/sheet${i + 1}.xml`);
    if (!xml) return [];
    const doc = parseXml(xml);
    const grid = new Grid();
    for (const c of byLocal(doc, 'c')) {
      const { row, col } = cellRef(c.getAttribute('r') ?? 'A1');
      const t = c.getAttribute('t');
      const v = byLocal(c, 'v')[0]?.textContent ?? '';
      const value = t === 's' ? (strings[Number(v)] ?? '') : t === 'inlineStr' ? textOf(c) : v;
      grid.set(row, col, clean(value));
    }
    for (const m of byLocal(doc, 'mergeCell')) {
      const [a, b] = (m.getAttribute('ref') ?? '').split(':');
      if (!a || !b) continue;
      const s = cellRef(a);
      const e = cellRef(b);
      grid.set(s.row, s.col, grid.get(s.row, s.col), e.row - s.row + 1, e.col - s.col + 1);
    }
    return [{ name: `시트 ${sheet.getAttribute('name') ?? i + 1}`, rows: grid.toRows() }];
  });
}

/* ───── HWPX (한글) ───── */

export function readHwpx(data: Uint8Array): Table[] {
  const files = unzipSync(data);
  const sections = Object.keys(files)
    .filter((p) => /^Contents\/section\d+\.xml$/i.test(p))
    .sort((a, b) => Number(/\d+/.exec(a)?.[0]) - Number(/\d+/.exec(b)?.[0]));
  if (!sections.length) throw new Error('한글(.hwpx) 파일이 아니에요.');
  const tables: Table[] = [];
  for (const path of sections) {
    const file = files[path];
    if (!file) continue;
    for (const tbl of byLocal(parseXml(strFromU8(file)), 'tbl')) {
      const grid = new Grid();
      children(tbl, 'tr').forEach((tr, ri) => {
        children(tr, 'tc').forEach((tc, ci) => {
          const addr = byLocal(tc, 'cellAddr')[0];
          const span = byLocal(tc, 'cellSpan')[0];
          const col = Number(addr?.getAttribute('colAddr') ?? ci);
          const row = Number(addr?.getAttribute('rowAddr') ?? ri);
          // 칸 안에 표가 또 있으면 그 표의 글자는 빼고 읽는다
          const text = byLocal(tc, 't')
            .filter((t) => nearestTable(t) === tbl)
            .map((t) => t.textContent ?? '')
            .join('');
          grid.set(row, col, clean(text), Number(span?.getAttribute('rowSpan') ?? 1), Number(span?.getAttribute('colSpan') ?? 1));
        });
      });
      tables.push({ name: `표 ${tables.length + 1}`, rows: grid.toRows() });
    }
  }
  return tables;
}

function nearestTable(el: Element): Element | null {
  let cur = el.parentElement;
  while (cur && cur.localName !== 'tbl') cur = cur.parentElement;
  return cur;
}

/* ───── PDF 글자 조각 → 줄 ───── */

export interface TextPiece {
  readonly str: string;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
}

const GRADE_TOKEN = /[1-6]\s*학년/;
const SUB_TOKEN = /(학기|^계$|합계)/;
const NUMBER_TOKEN = /^\(?[\d,]+/;

function groupLines(pieces: readonly TextPiece[], tolerance: number): TextPiece[][] {
  const sorted = pieces.filter((p) => p.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextPiece[][] = [];
  for (const p of sorted) {
    const line = lines.find((l) => Math.abs((l[0]?.y ?? 0) - p.y) <= tolerance);
    if (line) line.push(p);
    else lines.push([p]);
  }
  return lines.map((l) => l.sort((a, b) => a.x - b.x));
}

const center = (p: TextPiece) => p.x + (p.width ?? 0) / 2;
const nearest = (x: number, cols: readonly number[]) =>
  cols.reduce((best, c, i) => (Math.abs(c - x) < Math.abs((cols[best] ?? Infinity) - x) ? i : best), 0);

/**
 * PDF 한 쪽의 글자 조각을 표로 맞춘다. "1학년 … 6학년" 머리글 줄(아래에 "1학기·2학기·계" 줄이 있으면 그 줄)의
 * 가로 위치를 칸으로 삼아, 아래 줄의 숫자를 가장 가까운 칸에 넣는다. 빈칸이 있어도 숫자가 옆 학년으로 밀리지 않는다.
 * 머리글을 못 찾으면 조각을 왼쪽부터 늘어놓기만 한다.
 */
export function alignPdfPieces(pieces: readonly TextPiece[], tolerance = 3): string[][] {
  const lines = groupLines(pieces, tolerance);
  const gi = lines.findIndex((l) => l.filter((p) => GRADE_TOKEN.test(p.str)).length >= 2);
  if (gi < 0) return lines.map((l) => l.map((p) => clean(p.str)));
  const gradeLine = (lines[gi] ?? []).filter((p) => GRADE_TOKEN.test(p.str) || SUB_TOKEN.test(p.str.trim()));
  const next = lines[gi + 1] ?? [];
  const subLine = next.filter((p) => SUB_TOKEN.test(p.str.trim())).length >= 2 ? next.filter((p) => SUB_TOKEN.test(p.str.trim())) : null;
  const gradeCenters = gradeLine.map(center);
  const headers = (subLine ?? gradeLine).map((p) =>
    subLine ? `${clean(gradeLine[nearest(center(p), gradeCenters)]?.str ?? '')} ${clean(p.str)}` : clean(p.str),
  );
  const cols = (subLine ?? gradeLine).map(center);
  const out: string[][] = [['구분', ...headers]];
  for (const line of lines.slice(gi + (subLine ? 2 : 1))) {
    const row = Array.from({ length: cols.length + 1 }, () => '');
    const label: string[] = [];
    for (const p of line) {
      if (NUMBER_TOKEN.test(p.str.trim())) {
        const i = nearest(center(p), cols) + 1;
        row[i] = row[i] ? row[i] : clean(p.str);
      } else if (!row.slice(1).some(Boolean)) label.push(clean(p.str));
    }
    row[0] = label.join(' ');
    out.push(row);
  }
  return out;
}

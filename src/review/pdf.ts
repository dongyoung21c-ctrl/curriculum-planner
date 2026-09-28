import { alignPdfPieces, type Table, type TextPiece } from './tables';

/*
 * PDF 읽기 라이브러리(pdf.js)는 1MB가 넘어서 앱에 넣지 않고, PDF를 고를 때만 인터넷에서 불러온다.
 * (엑셀·한글·CSV·JSON은 인터넷 없이 읽는다.)
 */
const PDFJS_VERSION = '6.3.289';
const BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build`;

interface PdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
}
interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: { data: Uint8Array }) => {
    promise: Promise<{
      numPages: number;
      getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: PdfTextItem[] }> }>;
    }>;
  };
}

const MAX_PAGES = 30;

export async function readPdf(data: Uint8Array): Promise<Table[]> {
  let lib: PdfJs;
  try {
    lib = (await import(/* @vite-ignore */ `${BASE}/pdf.min.mjs`)) as PdfJs;
  } catch {
    throw new Error('PDF를 읽으려면 인터넷 연결이 필요해요. 엑셀이나 한글(.hwpx) 파일은 인터넷 없이도 읽을 수 있어요.');
  }
  lib.GlobalWorkerOptions.workerSrc = `${BASE}/pdf.worker.min.mjs`;
  const doc = await lib.getDocument({ data }).promise;
  const tables: Table[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
    const page = await doc.getPage(n);
    const { items } = await page.getTextContent();
    const pieces: TextPiece[] = items.flatMap((it) => (it.str && it.transform ? [{ str: it.str, x: it.transform[4] ?? 0, y: it.transform[5] ?? 0, width: it.width ?? 0 }] : []));
    tables.push({ name: `${n}쪽`, rows: alignPdfPieces(pieces) });
  }
  return tables;
}

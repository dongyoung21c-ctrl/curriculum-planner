/** 문자열을 파일로 내려받는다 */
export function downloadText(fileName: string, text: string, type = 'application/octet-stream'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 페이지에 들어 있는 스타일 전부 (HTML 문서로 내보낼 때 함께 넣는다) */
export function pageCss(): string {
  return [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
}

import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useRef, useState } from 'preact/hooks';

export type Level = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

export function Chip({ level, children }: { level: Level; children: ComponentChildren }) {
  return <span class={`chip ${level}`}>{children}</span>;
}

interface NumProps {
  readonly value: number;
  readonly onChange: (v: number) => void;
  readonly label: string;
  readonly step?: number;
  readonly max?: number;
  readonly width?: number;
}

/**
 * 숫자 칸. 입력하는 동안 합계가 바로 바뀌고, 칸을 벗어나면 저장된 값(반올림·범위 적용)으로 다시 보인다.
 */
export function NumInput({ value, onChange, label, step = 1, max, width }: NumProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      max={max}
      step={step}
      aria-label={label}
      style={width ? { width: `${width}px` } : undefined}
      value={draft ?? String(value)}
      onInput={(e) => {
        const v = e.currentTarget.value;
        setDraft(v);
        if (v.trim() !== '' && Number.isFinite(Number(v))) onChange(Number(v));
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

export function Panel({ title, sub, actions, children, class: cls }: { title: string; sub?: ComponentChildren; actions?: ComponentChildren; children: ComponentChildren; class?: string }) {
  return (
    <section class={`panel${cls ? ` ${cls}` : ''}`} aria-label={title}>
      <div class="ph">
        <div class="grow">
          <h2>{title}</h2>
          {sub && <div class="sub">{sub}</div>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/* ───── 알림 ───── */

interface ToastMsg {
  readonly id: number;
  readonly text: string;
}
type ShowToast = (text: string) => void;
const ToastCtx = createContext<ShowToast>(() => undefined);
export const useToast = (): ShowToast => useContext(ToastCtx);
const TOAST_MS = 2600;

export function ToastProvider({ children }: { children: ComponentChildren }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  useEffect(() => {
    if (!msg) return undefined;
    const t = window.setTimeout(() => setMsg(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [msg]);
  const show = useCallback<ShowToast>((text) => setMsg({ id: Date.now(), text }), []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div role="status" aria-live="polite">
        {msg && (
          <div class="toast" key={msg.id}>
            {msg.text}
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  );
}

/* ───── 대화상자 ───── */

export function Modal({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ComponentChildren }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
    } else if (!open && el.open) {
      if (typeof el.close === 'function') el.close();
      else el.removeAttribute('open');
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      class="modal-d"
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && children}
    </dialog>
  );
}

interface ConfirmRequest {
  readonly title: string;
  readonly message: string;
  readonly okLabel: string;
  readonly danger?: boolean;
  readonly onOk: () => void;
}
type AskConfirm = (req: ConfirmRequest) => void;
const ConfirmCtx = createContext<AskConfirm>(() => undefined);
export const useConfirm = (): AskConfirm => useContext(ConfirmCtx);

/** 브라우저 confirm() 대신 쓰는 확인 창 (막혀 있는 환경에서도 동작) */
export function ConfirmProvider({ children }: { children: ComponentChildren }) {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  const close = () => setReq(null);
  return (
    <ConfirmCtx.Provider value={setReq}>
      {children}
      <Modal open={req !== null} onClose={close} label={req?.title ?? '확인'}>
        {req && (
          <div class="box">
            <h2>{req.title}</h2>
            <p>{req.message}</p>
            <div class="acts">
              <button type="button" class="btn" onClick={close} autoFocus>
                취소
              </button>
              <button
                type="button"
                class={`btn ${req.danger ? 'danger' : 'primary'}`}
                onClick={() => {
                  req.onOk();
                  close();
                }}
              >
                {req.okLabel}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  );
}

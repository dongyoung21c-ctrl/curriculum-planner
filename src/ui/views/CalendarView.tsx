import { useState } from 'preact/hooks';
import { builtInHolidays, calendarStats, hasHolidayData, schoolYearMonths, type CalendarStats } from '../../domain/calendar';
import { monthDay, toIso, weekdayOf, WEEKDAYS } from '../../domain/dates';
import { addDiscretionary, addExtraHoliday, removeDiscretionary, removeExtraHoliday, setTermDate, toggleDiscretionary, toggleHoliday } from '../../domain/edits';
import type { Calendar } from '../../domain/types';
import { useStore } from '../../state/store';
import { Chip, Panel, useToast } from '../common';

type TermKey = 's1s' | 's1e' | 's2s' | 's2e' | 's3s' | 's3e';
const TERM_FIELDS: readonly [TermKey, string][] = [
  ['s1s', '1학기 시작(입학·개학)'],
  ['s1e', '1학기 종료(여름방학 전날)'],
  ['s2s', '2학기 시작'],
  ['s2e', '2학기 종료(겨울방학 전날)'],
  ['s3s', '학년말 등교 시작 (선택)'],
  ['s3e', '종업·졸업일 (선택)'],
];

const dayLabel = (d: string) => `${d} (${WEEKDAYS[weekdayOf(d)]})`;

/** 학기 날짜 칸. 1·2학기 날짜를 지우면 알려 주고 원래 날짜로 되돌린다 */
function TermDate({ id, label, value, onChange }: { id: TermKey; label: string; value: string; onChange: (v: string) => void }) {
  const toast = useToast();
  const required = !id.startsWith('s3');
  const [rev, setRev] = useState(0);
  return (
    <div class="field">
      <label for={`cal-${id}`}>{label}</label>
      <input
        key={rev}
        type="date"
        id={`cal-${id}`}
        value={value}
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (required && !v) {
            toast('1·2학기 날짜는 비울 수 없어요.');
            setRev((x) => x + 1);
            return;
          }
          onChange(v);
        }}
      />
    </div>
  );
}

export function CalendarView() {
  const { project: p, edit } = useStore();
  if (!p) return null;
  const cs = calendarStats(p);
  const c = p.calendar;
  const MIN_SCHOOL_DAYS = p.rules.minSchoolDays;

  return (
    <>
      <div class="kpis">
        <div class="kpi">
          <div class="l">연간 수업일수</div>
          <div class="v num" style={{ color: cs.total >= MIN_SCHOOL_DAYS ? 'inherit' : 'var(--bad)' }}>{cs.total}<small>일</small></div>
          <div class="m">
            {cs.total >= MIN_SCHOOL_DAYS ? <><Chip level="ok">{MIN_SCHOOL_DAYS}일 이상</Chip> 여유 {cs.total - MIN_SCHOOL_DAYS}일</> : <Chip level="bad">{MIN_SCHOOL_DAYS - cs.total}일 부족</Chip>}
          </div>
        </div>
        {cs.terms.map((t) => (
          <div class="kpi" key={t.name}>
            <div class="l">{t.name} 수업일수</div>
            <div class="v num">{t.days}<small>일</small></div>
            <div class="m">약 {t.weeks}주 · {monthDay(t.start)} ~ {monthDay(t.end)}</div>
          </div>
        ))}
        <div class="kpi">
          <div class="l">학기 중 쉬는 평일</div>
          <div class="v num">{cs.closed.holiday + cs.closed.discretionary}<small>일</small></div>
          <div class="m">공휴일 {cs.closed.holiday} · 재량휴업일 {cs.closed.discretionary}</div>
        </div>
      </div>

      {!hasHolidayData(p.year) && (
        <p class="banner" role="alert">
          {p.year}학년도 공휴일 자료가 아직 없어요. 아래 “공휴일”에서 설·추석·대체공휴일을 직접 추가해야 수업일수가 맞아요.
        </p>
      )}
      {cs.problems.map((m) => (
        <p class="banner" role="alert" key={m}>{m}</p>
      ))}

      <Panel title="학기 운영 기간" sub="토·일, 공휴일, 재량휴업일을 뺀 평일을 수업일로 계산해요.">
        <div class="pb cal-form">
          {TERM_FIELDS.map(([k, label]) => (
            <TermDate key={`${k}-${c[k]}`} id={k} label={label} value={c[k]} onChange={(v) => edit(setTermDate(k, v))} />
          ))}
        </div>
      </Panel>

      <Panel
        title={`${p.year}학년도 학사력`}
        sub="수업일이나 재량휴업일인 평일을 누르면 재량휴업일로 넣거나 뺄 수 있어요."
        actions={
          <div class="legend" aria-hidden="true">
            <span><i style={{ background: 'var(--accent-soft)' }} />수업일</span>
            <span><i style={{ background: 'var(--bad-soft)' }} />공휴일</span>
            <span><i style={{ background: 'var(--warn-soft)' }} />재량휴업일</span>
            <span><i style={{ background: 'var(--vac)' }} />방학</span>
          </div>
        }
      >
        <div class="pb months">
          {schoolYearMonths(p.year).map(({ y, m }) => (
            <MonthGrid key={`${y}-${m}`} y={y} m={m} cs={cs} onToggle={(d) => edit(toggleDiscretionary(d))} />
          ))}
        </div>
      </Panel>

      <div class="grid2">
        <DiscretionaryPanel c={c} />
        <HolidayPanel year={p.year} c={c} onToggle={(d) => edit(toggleHoliday(d))} />
      </div>
    </>
  );
}

const CELL_CLASS = { school: 'sch', holiday: 'hol', discretionary: 'disc', vacation: 'vac', weekend: '' } as const;
const CELL_NAME = { school: '수업일', holiday: '공휴일', discretionary: '재량휴업일', vacation: '방학', weekend: '주말' } as const;

function MonthGrid({ y, m, cs, onToggle }: { y: number; m: number; cs: CalendarStats; onToggle: (d: string) => void }) {
  const first = new Date(y, m, 1).getDay();
  const last = new Date(y, m + 1, 0).getDate();
  const days = Array.from({ length: last }, (_, i) => toIso(new Date(y, m, i + 1)));
  const schoolDays = days.filter((d) => cs.dayType(d).type === 'school').length;
  return (
    <div class="month">
      <div class="mh">
        <b>{y}년 {m + 1}월</b>
        <span>{schoolDays ? `${schoolDays}일 수업` : '방학'}</span>
      </div>
      <div class="dgrid">
        {WEEKDAYS.map((w) => <div class="wd" key={w} aria-hidden="true">{w}</div>)}
        {Array.from({ length: first }, (_, i) => <div key={`b${i}`} />)}
        {days.map((d, i) => {
          const t = cs.dayType(d);
          const w = (first + i) % 7;
          const cls = ['d', w === 0 ? 'sun' : w === 6 ? 'we' : '', CELL_CLASS[t.type]].filter(Boolean).join(' ');
          const label = `${m + 1}월 ${i + 1}일 ${CELL_NAME[t.type]}${t.name && t.type !== 'school' ? ` (${t.name})` : ''}`;
          if (t.type === 'school' || t.type === 'discretionary') {
            return (
              <button key={d} type="button" class={`${cls} clk`} title={t.name} aria-label={`${label} · 눌러서 재량휴업일 ${t.type === 'school' ? '지정' : '해제'}`} onClick={() => onToggle(d)}>
                {i + 1}
              </button>
            );
          }
          return <div key={d} class={cls} title={t.name} aria-label={label}>{i + 1}</div>;
        })}
      </div>
    </div>
  );
}

function AddRow({ label, placeholder, onAdd }: { label: string; placeholder: string; onAdd: (date: string, name: string) => boolean }) {
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  return (
    <form
      class="addrow"
      onSubmit={(e) => {
        e.preventDefault();
        if (onAdd(date, name)) {
          setDate('');
          setName('');
        }
      }}
    >
      <input type="date" aria-label={`${label} 날짜`} value={date} onChange={(e) => setDate(e.currentTarget.value)} />
      <input type="text" aria-label={`${label} 이름`} value={name} maxLength={40} placeholder={placeholder} onInput={(e) => setName(e.currentTarget.value)} />
      <button type="submit" class="btn sm">추가</button>
    </form>
  );
}

function DiscretionaryPanel({ c }: { c: Calendar }) {
  const { edit } = useStore();
  const toast = useToast();
  const list = [...c.disc].sort((a, b) => (a.date < b.date ? -1 : 1));
  return (
    <Panel title="재량휴업일" sub="학교장이 정하는 휴업일 (개교기념일, 연휴 사이 등)">
      <div class="pb">
        <ul class="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {list.map((x) => (
            <li class="it" key={x.date}>
              <span class="dt">{dayLabel(x.date)}</span>
              <span class="nm">{x.name}</span>
              <button type="button" class="x" aria-label={`${x.date} ${x.name} 삭제`} onClick={() => edit(removeDiscretionary(x.date))}>×</button>
            </li>
          ))}
          {list.length === 0 && <li class="hint">등록된 재량휴업일이 없어요.</li>}
        </ul>
        <AddRow
          label="재량휴업일"
          placeholder="이름 (예: 개교기념일)"
          onAdd={(date, name) => {
            const problem = !date ? '날짜를 고르세요.' : c.disc.some((x) => x.date === date) ? '이미 있는 날짜예요.' : null;
            if (problem) toast(problem);
            else edit(addDiscretionary(date, name));
            return problem === null;
          }}
        />
      </div>
    </Panel>
  );
}

function HolidayPanel({ year, c, onToggle }: { year: number; c: Calendar; onToggle: (d: string) => void }) {
  const { edit } = useStore();
  const toast = useToast();
  return (
    <Panel title="공휴일" sub="법정공휴일은 자동으로 들어가요. 임시공휴일·선거일은 직접 추가하고, 해당 없는 날은 체크를 해제하세요.">
      <div class="pb">
        <ul class="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {builtInHolidays(year).map((h) => (
            <li class="it" key={h.date}>
              <input type="checkbox" id={`hol-${h.date}`} checked={!c.excluded.includes(h.date)} onChange={() => onToggle(h.date)} />
              <label for={`hol-${h.date}`} class="dt">{dayLabel(h.date)}</label>
              <span class="nm">{h.name}</span>
            </li>
          ))}
          {c.extra.map((x) => (
            <li class="it" key={x.date}>
              <span class="dt" style={{ marginLeft: '21px' }}>{dayLabel(x.date)}</span>
              <span class="nm">{x.name} <Chip level="info">추가</Chip></span>
              <button type="button" class="x" aria-label={`${x.date} ${x.name} 삭제`} onClick={() => edit(removeExtraHoliday(x.date))}>×</button>
            </li>
          ))}
        </ul>
        <AddRow
          label="공휴일"
          placeholder="이름 (예: 임시공휴일)"
          onAdd={(date, name) => {
            const problem = !date ? '날짜를 고르세요.' : c.extra.some((x) => x.date === date) ? '이미 있는 날짜예요.' : null;
            if (problem) toast(problem);
            else edit(addExtraHoliday(date, name));
            return problem === null;
          }}
        />
      </div>
    </Panel>
  );
}

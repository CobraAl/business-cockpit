import { useMemo, useState } from 'react';
import { MonthPicker } from '../components/Calendar';
import { Seg } from '../components/ui';
import { catLabel } from '../lib/constants';
import { allTxns, isActive, monthlyEquivalent, sumType, totals } from '../lib/finance';
import { fmtDate, fmtMonth, money, monthEnd, monthKey, pct, shiftMonth } from '../lib/format';
import { EntryModal, RecurringModal } from '../components/MoneyForms';
import type { AppData, Entry, Recurring } from '../types';

type Update = (fn: (d: AppData) => AppData) => void;

type Period = '1m' | '3m' | '12m' | 'all';

export default function FinancesPage({ data, update, goToData }: { data: AppData; update: Update; goToData: () => void }) {
  // Clicking a recent transaction opens its edit form (a recurring line opens the subscription).
  const [editing, setEditing] = useState<{ entry?: Entry; recurring?: Recurring } | null>(null);
  const [period, setPeriod] = useState<Period>('1m');
  // The month the view ends on (this month by default); 3 and 12 months count back from it.
  const [anchor, setAnchor] = useState(monthKey());
  const P = data.profile;
  const cur = P.currency;
  const m = (n: number) => money(n, cur);
  // Green = the business made money, red = it lost money. No target to configure.
  const tone = (rate: number | null) => (rate === null ? 'var(--faint)' : rate >= 0 ? 'var(--green)' : 'var(--red)');

  const txns = useMemo(() => allTxns(data), [data]);
  const thisMonth = monthKey();
  const end = period === 'all' ? thisMonth : anchor;
  const cutoff = { '1m': end, '3m': shiftMonth(end, -2), '12m': shiftMonth(end, -11), all: '0000' }[period];
  // allTxns already leaves out anything dated after today (planned invoices, upcoming renewals).
  const inPeriod = txns.filter((e) => e.date.slice(0, 7) >= cutoff && e.date.slice(0, 7) <= end);
  // Fixed costs as they stood at the end of the viewed month (today for the current month).
  const asOf = end === thisMonth ? new Date() : new Date(monthEnd(end) + 'T12:00:00');
  const T = totals(inPeriod);

  // Fixed monthly burn: what recurring costs take out every month, whatever you sell.
  const activeRec = data.recurring.filter((r) => isActive(r, asOf));
  const fixedCost = activeRec.filter((r) => r.type !== 'revenue').reduce((a, r) => a + monthlyEquivalent(r), 0);
  const fixedRev = activeRec.filter((r) => r.type === 'revenue').reduce((a, r) => a + monthlyEquivalent(r), 0);

  const revCount = inPeriod.filter((e) => e.type === 'revenue').length;
  const subCount = activeRec.filter((r) => r.type !== 'revenue').length;
  const kpis = [
    { label: 'Revenue', value: m(T.rev), sub: `${revCount} ${revCount === 1 ? 'payment' : 'payments'} received`, color: 'var(--muted)', dot: '#2f6fde' },
    { label: 'Expenses', value: m(T.charges), sub: T.rev ? `${pct((T.charges / T.rev) * 100)} of revenue` : 'No revenue in this period', color: 'var(--muted)', dot: '#f0a6aa' },
    { label: 'Net profit', value: m(T.net), sub: T.rev ? `Net margin ${pct(T.netRate)}` : '—', color: T.rev ? tone(T.net) : 'var(--muted)', dot: '#2fa565' },
    { label: 'Fixed costs / month', value: m(fixedCost), sub: `${subCount} active ${subCount === 1 ? 'subscription' : 'subscriptions'}${fixedRev ? ` · recurring income ${m(fixedRev)}` : ''}`, color: 'var(--muted)', dot: '#e9a23b' },
  ];

  const cl = (x: number) => Math.max(0, Math.min(100, x)) + '%';
  const share = (x: number) => (T.rev ? (x / T.rev) * 100 : 0);

  const byCat = new Map<string, { name: string; type: string; amount: number }>();
  inPeriod.filter((e) => e.type !== 'revenue').forEach((e) => {
    const c = byCat.get(e.category) ?? { name: e.category, type: e.type, amount: 0 };
    c.amount += Number(e.amount || 0);
    byCat.set(e.category, c);
  });
  const cats = [...byCat.values()].sort((a, b) => b.amount - a.amount);
  const maxCat = Math.max(1, ...cats.map((c) => c.amount));

  // 6-month chart and 12-month table ending on the viewed month.
  const monthRows = (n: number) =>
    Array.from({ length: n }, (_, i) => shiftMonth(end, -(n - 1 - i))).map((k) => {
      const me = txns.filter((e) => e.date.slice(0, 7) === k);
      const r = sumType(me, 'revenue');
      const c = sumType(me, 'direct') + sumType(me, 'opex');
      return { k, r, c, net: r - c, rate: r ? ((r - c) / r) * 100 : null };
    });
  const chart = monthRows(6);
  const max = Math.max(1, ...chart.map((x) => Math.max(x.r, x.c)));
  // Hide the empty months before the first recorded transaction.
  const firstMonth = txns.reduce((a, e) => (e.date.slice(0, 7) < a ? e.date.slice(0, 7) : a), thisMonth);
  const table = monthRows(12).filter((x) => x.k >= firstMonth).reverse();
  const tableTot = table.reduce((a, x) => ({ r: a.r + x.r, c: a.c + x.c }), { r: 0, c: 0 });

  const insights: { dot: string; text: string }[] = [];
  if (T.rev) {
    insights.push(
      T.net >= 0
        ? { dot: '#2fa565', text: `You keep ${m(T.net)} out of ${m(T.rev)} in revenue, a net margin of ${pct(T.netRate)}.` }
        : { dot: '#e0525a', text: `You're losing ${m(-T.net)} over this period: expenses exceed revenue by ${pct(-T.netRate)}.` },
    );
  }
  if (cats.length && T.rev) {
    const top = cats[0];
    insights.push({ dot: '#e9a23b', text: `Your biggest expense: ${catLabel(top.name)}, ${m(top.amount)} (${pct((top.amount / T.rev) * 100)} of revenue).` });
  }
  if (fixedCost) insights.push({ dot: '#e9a23b', text: `Your fixed costs are ${m(fixedCost)} a month, or ${m(fixedCost * 12)} a year, before any project.` });
  // Compare two complete months: the current one is still filling up.
  const [prev, last] = end === thisMonth ? chart.slice(-3, -1) : chart.slice(-2);
  if (prev.c && last.c) {
    const d = ((last.c - prev.c) / prev.c) * 100;
    insights.push({ dot: d > 10 ? '#e9a23b' : '#2fa565', text: `Expenses in ${fmtMonth(last.k, true)} went ${d >= 0 ? 'up' : 'down'} ${pct(Math.abs(d))} compared with ${fmtMonth(prev.k, true)}.` });
  }
  if (!insights.length) insights.push({ dot: '#9aa0ae', text: 'Add transactions or subscriptions in "Data & profile" to see your numbers.' });

  const recent = [...inPeriod].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  const range = (from: string) =>
    `${fmtMonth(from)}${from.slice(0, 4) !== end.slice(0, 4) ? ' ' + from.slice(0, 4) : ''} – ${fmtMonth(end)} ${end.slice(0, 4)}`;
  const periodLabel = { '1m': fmtMonth(end, true), '3m': range(cutoff), '12m': range(cutoff), all: 'All time' }[period];

  return (
    <section className="section loose">
      <div className="head">
        <div className="head-title">
          <h1>Finances</h1>
          <span className="sub">{periodLabel}</span>
        </div>
        <div className="row">
          <Seg label="Period" value={period} onChange={setPeriod} options={[['1m', 'Month'], ['3m', '3 months'], ['12m', '12 months'], ['all', 'All time']]} />
          {period !== 'all' && <MonthPicker value={anchor} onChange={setAnchor} ariaLabel="Month shown" />}
          <button className="btn" onClick={goToData}>+ Add a transaction</button>
        </div>
      </div>

      <div className="kpis">
        {kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="kpi-k"><span className="dot" style={{ background: k.dot }} />{k.label}</div>
            <div className="kpi-v">{k.value}</div>
            <div className="kpi-s" style={{ color: k.color }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid-2 stretch">
        <div className="card" style={{ gap: '1.125rem' }}>
          <div className="head">
            <div className="card-title">Revenue vs expenses, 6 months to {fmtMonth(end, true)}</div>
            <div className="legend">
              <span><span className="dot" style={{ background: '#2f6fde' }} />Revenue</span>
              <span><span className="dot" style={{ background: '#f0a6aa' }} />Expenses</span>
            </div>
          </div>
          <div className="bars">
            {chart.map((x) => (
              <div className="bar-pair" key={x.k} tabIndex={0} aria-label={`${fmtMonth(x.k, true)}: revenue ${m(x.r)}, expenses ${m(x.c)}`}>
                <div style={{ height: `${(x.r / max) * 100}%`, background: '#2f6fde' }} />
                <div style={{ height: `${(x.c / max) * 100}%`, background: '#f0a6aa' }} />
                <span className="bar-tip">Revenue {m(x.r)} · Expenses {m(x.c)}</span>
              </div>
            ))}
          </div>
          <div className="bar-labels">
            {chart.map((x) => (
              <div key={x.k}>
                <span className="m">{fmtMonth(x.k)}</span>
                <span className="n" style={{ color: tone(x.rate) }}>
                  {x.rate === null ? '—' : pct(x.rate)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Where each {cur === 'EUR' ? 'euro' : 'unit'} of revenue goes</div>
          <div className="split">
            <div style={{ width: cl(share(T.direct)), background: '#e9a23b' }} />
            <div style={{ width: cl(share(T.opex)), background: '#f0a6aa' }} />
            <div style={{ width: cl(T.netRate), background: '#2fa565' }} />
          </div>
          <div className="section" style={{ gap: '0.625rem' }}>
            <div className="split-row"><span><span className="dot" style={{ background: '#e9a23b' }} />Direct costs (subcontracting…)</span><span>{pct(share(T.direct))}</span></div>
            <div className="split-row"><span><span className="dot" style={{ background: '#f0a6aa' }} />Operating expenses</span><span>{pct(share(T.opex))}</span></div>
            <div className="split-row"><span><span className="dot" style={{ background: '#2fa565' }} />Net profit</span><span>{pct(T.netRate)}</span></div>
          </div>
          <div className="insights">
            {insights.map((i) => (
              <div className="insight" key={i.text}><span className="dot" style={{ background: i.dot }} /><span style={{ textWrap: 'pretty' }}>{i.text}</span></div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-2 stretch">
        <div className="card" style={{ gap: '0.875rem' }}>
          <div className="head">
            <div className="card-title">What eats your margin</div>
            <div className="small">Amount and share of revenue in this period</div>
          </div>
          {cats.map((c) => {
            const p = share(c.amount);
            const color = '#2f6fde';
            return (
              <div className="catbar" key={c.name}>
                <div className="catbar-top">
                  <span className="row" style={{ gap: '0.5rem' }}><b style={{ fontWeight: 600 }}>{catLabel(c.name)}</b><span className="mini-tag">{c.type === 'direct' ? 'Direct cost' : 'Operating'}</span></span>
                  <span className="row" style={{ gap: '0.625rem', flexWrap: 'nowrap' }}>
                    <span style={{ color: 'var(--ink-2)' }}>{m(c.amount)}</span>
                    <b style={{ minWidth: '3rem', textAlign: 'right', color }}>{T.rev ? pct(p) : '—'}</b>
                  </span>
                </div>
                <div className="catbar-track"><div style={{ width: cl((c.amount / maxCat) * 100), background: color }} /></div>
              </div>
            );
          })}
          {cats.length === 0 && <div className="small">No expenses in this period.</div>}
        </div>

        <div className="card" style={{ gap: '0.375rem' }}>
          <div className="card-title" style={{ marginBottom: '0.5rem' }}>Recent transactions</div>
          {recent.map((r) => (
            <button
              type="button"
              className="trow t-recent t-click"
              key={r.id}
              title={r.recurringId ? 'Edit this subscription' : 'Edit this transaction'}
              onClick={() => {
                if (r.recurringId) {
                  const rec = data.recurring.find((x) => x.id === r.recurringId);
                  if (rec) setEditing({ recurring: rec });
                } else {
                  const entry = data.entries.find((x) => x.id === r.id);
                  if (entry) setEditing({ entry });
                }
              }}
            >
              <span className="small">{fmtDate(r.date, r.date.slice(0, 4) === String(new Date().getFullYear()))}</span>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span className="ellipsis" style={{ fontWeight: 600 }}>{r.label}{r.recurringId && <span className="auto-flag">recurring</span>}</span>
                <span style={{ fontSize: '0.6875rem', color: 'var(--muted)' }}>{catLabel(r.category)}</span>
              </span>
              <b style={{ color: r.type === 'revenue' ? 'var(--green)' : 'var(--ink)', whiteSpace: 'nowrap' }}>
                {r.type === 'revenue' ? '+ ' : '− '}{m(r.amount)}
              </b>
            </button>
          ))}
          {recent.length === 0 && <div className="small">No transactions in this period.</div>}
        </div>
      </div>

      <div className="card" style={{ gap: '0.375rem' }}>
        <div className="head">
          <div className="card-title">Month by month</div>
          <div className="small">What comes in, what goes out, what's left · 12 months to {fmtMonth(end, true)}</div>
        </div>
        <div className="table-wrap">
          <div className="trow th t-months"><span>Month</span><span className="r">Revenue</span><span className="r">Expenses</span><span className="r">Net</span><span className="r">Margin</span></div>
          {table.map((x) => (
            <div className="trow t-months" key={x.k} style={{ color: x.r || x.c ? undefined : 'var(--faint)' }}>
              <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{fmtMonth(x.k, true)}</span>
              <span className="r">{m(x.r)}</span>
              <span className="r">{m(x.c)}</span>
              <span className="r" style={{ fontWeight: 700, color: x.net < 0 ? 'var(--red)' : x.net > 0 ? 'var(--green)' : undefined }}>{m(x.net)}</span>
              <span className="r" style={{ color: tone(x.rate) }}>{x.rate === null ? '—' : pct(x.rate)}</span>
            </div>
          ))}
          <div className="trow t-months total">
            <span>Total{table.length > 1 ? ` (${table.length} months)` : ''}</span>
            <span className="r">{m(tableTot.r)}</span>
            <span className="r">{m(tableTot.c)}</span>
            <span className="r" style={{ color: tableTot.r - tableTot.c < 0 ? 'var(--red)' : 'var(--green)' }}>{m(tableTot.r - tableTot.c)}</span>
            <span className="r">{tableTot.r ? pct(((tableTot.r - tableTot.c) / tableTot.r) * 100) : '—'}</span>
          </div>
        </div>
      </div>
      {editing?.entry && <EntryModal entry={editing.entry} data={data} update={update} onClose={() => setEditing(null)} />}
      {editing?.recurring && <RecurringModal item={editing.recurring} data={data} update={update} onClose={() => setEditing(null)} />}
    </section>
  );
}

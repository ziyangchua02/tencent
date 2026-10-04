import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ARRIVAL_BAND, BOARD_NAMES, boardStatus, CHILLER, fmtKw, fmtTime, LOADS, SCHEDULE, TOWER,
  type Actions, type Board, type Diagnosis, type SimResult, type Step,
} from '../../shared/model.ts';
import { Explained, Icon } from './ui.tsx';

const kwNum = (n: number) => Math.round(n).toLocaleString('en-SG');

/** Width of an element in CSS pixels, so drawings render 1:1 and their lettering stays legible. */
function useWidth<T extends HTMLElement>(initial: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.offsetWidth || initial); // layout px, unaffected by CSS zoom
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width) || initial));
    ro.observe(el);
    return () => ro.disconnect();
  }, [initial]);
  return [ref, w] as const;
}
const STATUS_WORD = { overload: 'Over rating', warning: 'Above 90%', ok: 'OK' } as const;

/** Scalloped revision cloud around a rectangle, drawn clockwise so every arc bulges outward. */
function cloudPath(x: number, y: number, w: number, h: number, r = 9) {
  const edge = (len: number) => Math.max(2, Math.round(len / (r * 1.6)));
  let d = `M${x} ${y}`;
  const run = (n: number, dx: number, dy: number) => { for (let i = 0; i < n; i++) d += ` a${r} ${r} 0 0 1 ${dx / n} ${dy / n}`; };
  run(edge(w), w, 0);
  run(edge(h), 0, h);
  run(edge(w), -w, 0);
  run(edge(h), 0, -h);
  return `${d} Z`;
}

// ---------- the single-line diagram: the working surface ----------

const BOX_H = 132;
const BOX_Y = 182;
const SUBS: { key: Board | 'base'; name: string; role: string }[] = [
  { key: 'sb1', name: 'SB-1', role: 'Chillers' },
  { key: 'sb2', name: 'SB-2', role: 'Floors 1–10' },
  { key: 'sb3', name: 'SB-3', role: 'Floors 11–20' },
  { key: 'sb4', name: 'SB-4', role: 'Lifts, car park, EV' },
  { key: 'base', name: 'Base load', role: 'IT, common areas' },
];

export function SingleLine({ today, proposal, revision, caption }: { today: SimResult; proposal?: SimResult; revision?: number; caption?: string }) {
  const [ref, measured] = useWidth<HTMLDivElement>(860);
  const W = Math.max(720, measured);
  const H = BOX_Y + BOX_H + 10;
  const gap = 16;
  const side = 20; // room for the revision cloud's scallops
  const bw = (W - 2 * side - 4 * gap) / 5;
  const xs = SUBS.map((_, i) => side + bw / 2 + i * (bw + gap));
  const msb = { w: 290, h: 70, x: W / 2 - 145, y: 62 };
  const r = TOWER.boardRatings;
  const scale = (pct: number) => Math.min(pct, 125) / 125; // bars run 0–125% of rating
  const changed = (b: Board) => !!proposal && Math.abs(proposal.maxBoardPct[b] - today.maxBoardPct[b]) >= 2;
  const shown = proposal ?? today;
  // Red markup on any board at or above 90% in what's shown, proposal or not; it outranks the blue revision cloud.
  const marked = (b: Board) => shown.maxBoardPct[b] >= 90;
  const revised = (b: Board) => changed(b) && !marked(b);
  const label = `Single-line diagram of ${TOWER.name}. ` + (Object.keys(r) as Board[]).map((b) =>
    `${BOARD_NAMES[b]}: peak ${Math.round(today.maxBoardPct[b])}% of rating today` +
    (proposal ? `, ${Math.round(proposal.maxBoardPct[b])}% with the proposal` : '') + ` (${STATUS_WORD[boardStatus(shown.maxBoardPct[b])]}).`).join(' ');

  function bars(b: Board, x: number, y: number, w: number) {
    const rows: { pct: number; cls: string; tag: string }[] = proposal
      ? [{ pct: today.maxBoardPct[b], cls: 'today', tag: 'Today' }, { pct: proposal.maxBoardPct[b], cls: 'pill', tag: 'Proposal' }]
      : [{ pct: today.maxBoardPct[b], cls: `now status-${boardStatus(today.maxBoardPct[b])}`, tag: 'Today' }];
    return (
      <g>
        {rows.map((row, i) => (
          <g key={row.tag} transform={`translate(0 ${i * 13})`}>
            <rect x={x} y={y} width={w} height={8} className="sld-track" />
            <rect x={x} y={y} width={Math.max(2, scale(row.pct) * w)} height={8} rx={1} className={`sld-bar sld-bar--${row.cls}`} />
          </g>
        ))}
        <line x1={x + w * (100 / 125)} x2={x + w * (100 / 125)} y1={y - 3} y2={y + rows.length * 13 - 2} className="sld-limit" />
      </g>
    );
  }
  const pctText = (b: Board) => proposal
    ? <>{Math.round(today.maxBoardPct[b])}% → <tspan className="sld-strong">{Math.round(proposal.maxBoardPct[b])}%</tspan></>
    : <tspan className="sld-strong">{Math.round(today.maxBoardPct[b])}%</tspan>;
  const status = (b: Board) => boardStatus(shown.maxBoardPct[b]);

  return (
    <figure className="sld">
      <div className="scroll-x" ref={ref}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
          {/* intake */}
          <circle cx={W / 2} cy={16} r={11} className="sld-sym" />
          <circle cx={W / 2} cy={30} r={11} className="sld-sym" />
          <text x={W / 2 + 20} y={20} className="sld-small">Utility intake</text>
          <text x={W / 2 + 20} y={36} className="sld-small sld-muted">Contracted capacity {kwNum(TOWER.contractedCapacityKw)} kW</text>
          <line x1={W / 2} x2={W / 2} y1={41} y2={msb.y} className="sld-wire" />
          {/* MSB */}
          <rect x={msb.x} y={msb.y} width={msb.w} height={msb.h} className={`sld-box${revised('msb') ? ' sld-box--changed' : ''}`} />
          <text x={msb.x + 12} y={msb.y + 21} className="sld-title">MSB · Main switchboard</text>
          <text x={msb.x + msb.w - 12} y={msb.y + 21} textAnchor="end" className="sld-pct">{pctText('msb')}</text>
          <text x={msb.x + 12} y={msb.y + 38} className="sld-small sld-muted">Rating {kwNum(r.msb)} kW</text>
          <text x={msb.x + msb.w - 12} y={msb.y + 38} textAnchor="end" className={`sld-status status-${status('msb')}`}>{STATUS_WORD[status('msb')]}</text>
          {bars('msb', msb.x + 12, msb.y + 48, msb.w - 24)}
          {revised('msb') && <Revision x={msb.x} y={msb.y} w={msb.w} h={msb.h} rev={revision} />}
          {marked('msb') && <Markup x={msb.x} y={msb.y} w={msb.w} h={msb.h} />}
          {/* busbar */}
          <line x1={W / 2} x2={W / 2} y1={msb.y + msb.h} y2={152} className="sld-wire" />
          <line x1={xs[0]} x2={xs[4]} y1={152} y2={152} className="sld-bus" />
          {SUBS.map((sub, i) => {
            const cx = xs[i];
            const x = cx - bw / 2;
            const b = sub.key === 'base' ? null : sub.key;
            return (
              <g key={sub.key}>
                <line x1={cx} x2={cx} y1={152} y2={BOX_Y} className="sld-wire" />
                {b && <rect x={cx - 6} y={160} width={12} height={12} className="sld-breaker" />}
                <rect x={x} y={BOX_Y} width={bw} height={BOX_H} className={`sld-box${b && revised(b) ? ' sld-box--changed' : ''}`} />
                <text x={x + 10} y={BOX_Y + 20} className="sld-title">{sub.name}</text>
                <text x={x + 10} y={BOX_Y + 37} className="sld-small">{sub.role}</text>
                <text x={x + 10} y={BOX_Y + 53} className="sld-small sld-muted">{b ? `Rating ${kwNum(r[b])} kW` : `${kwNum(LOADS.baseKw)} kW constant`}</text>
                {b ? (
                  <>
                    {bars(b, x + 10, BOX_Y + 64, bw - 20)}
                    <text x={x + 10} y={BOX_Y + 106} className="sld-pct">{pctText(b)}</text>
                    <text x={x + 10} y={BOX_Y + 122} className={`sld-status status-${status(b)}`}>{STATUS_WORD[status(b)]}</text>
                    {revised(b) && <Revision x={x} y={BOX_Y} w={bw} h={BOX_H} rev={revision} />}
                    {marked(b) && <Markup x={x} y={BOX_Y} w={bw} h={BOX_H} />}
                  </>
                ) : (
                  <text x={x + 10} y={BOX_Y + 122} className="sld-small sld-muted">No sub-board</text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="sld-legend">
        {proposal && (
          <>
            <span className="key"><span className="key-bar key-bar--today" />Today</span>
            <span className="key"><span className="key-bar key-bar--pill" />Proposal</span>
          </>
        )}
        {(Object.keys(r) as Board[]).some(revised) && (
          <span className="key"><span className="key-cloud key-cloud--rev" />Changed by this revision</span>
        )}
        {(Object.keys(r) as Board[]).some(marked) && (
          <span className="key"><span className="key-cloud key-cloud--markup" />Marked up: above 90% of rating</span>
        )}
        <span className="key"><span className="key-tick" />Board rating (100%)</span>
        {caption && <span className="sld-caption">{caption}</span>}
      </figcaption>
    </figure>
  );
}

function Revision({ x, y, w, h, rev }: { x: number; y: number; w: number; h: number; rev?: number }) {
  const pad = 7;
  return (
    <g className="cloud cloud--rev">
      <path d={cloudPath(x - pad, y - pad, w + pad * 2, h + pad * 2)} pathLength={100} />
      {rev !== undefined && (
        <g transform={`translate(${x + w + pad - 4} ${y - pad - 4})`}>
          <path d="M0 -12 L11 7 L-11 7 Z" className="rev-tri" />
          <text y={4.5} textAnchor="middle" className="rev-num">{rev}</text>
        </g>
      )}
    </g>
  );
}

function Markup({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const pad = 7;
  return (
    <g className="cloud cloud--markup">
      <path d={cloudPath(x - pad, y - pad, w + pad * 2, h + pad * 2)} pathLength={100} />
    </g>
  );
}

// ---------- load profile: today (grey context) vs proposal (bold blue) ----------

const M = { l: 46, r: 14, t: 26, b: 24 };
const TIP_W = 150;
function niceStep(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const n of [1, 2, 2.5, 5, 10]) if (n * p >= v) return n * p;
  return 10 * p;
}
const peakIndex = (vs: number[]) => vs.reduce((best, v, i) => (v > vs[best] ? i : best), 0);

export interface LoadChartProps {
  title: string;
  hours: number[];
  today: number[];
  pill?: number[];
  pillLabel?: string;
  limit?: { value: number; label: string };
  band?: { from: number; to: number; label: string };
  width?: number;
  height?: number;
  cursor?: number;
}

export function LoadChart({ title, hours, today, pill, pillLabel = 'Proposal', limit, band, width: initial = 720, height = 220, cursor }: LoadChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, measured] = useWidth<HTMLDivElement>(initial);
  const width = Math.max(300, measured);
  const iw = width - M.l - M.r;
  const ih = height - M.t - M.b;
  const t0 = hours[0];
  const t1 = hours[hours.length - 1];
  const span = t1 - t0;
  const max = Math.max(...today, ...(pill ?? []), limit?.value ?? 0) * 1.08;
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const X = (t: number) => M.l + ((t - t0) / span) * iw;
  const Y = (v: number) => M.t + ih - (v / top) * ih;
  const line = (vs: number[]) => vs.map((v, i) => `${i ? 'L' : 'M'}${X(hours[i]).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const area = (vs: number[]) => `${line(vs)} L${X(t1).toFixed(1)} ${Y(0)} L${X(t0).toFixed(1)} ${Y(0)} Z`;
  const every = (span <= 4 ? 1 : span <= 8 ? 2 : span <= 16 ? 3 : 4) * (width < 480 ? 2 : 1);
  const ticks: number[] = [];
  for (let t = Math.ceil(t0 / every) * every; t <= t1 + 1e-9; t += every) ticks.push(t);
  const ti = peakIndex(today);
  const pi = pill ? peakIndex(pill) : -1;
  const desc = `${title}. Today peaks at ${kwNum(today[ti])} kW at ${fmtTime(hours[ti])}` +
    (pill ? `; ${pillLabel.toLowerCase()} peaks at ${kwNum(pill[pi])} kW at ${fmtTime(hours[pi])}` : '') + (limit ? `. ${limit.label}.` : '.');

  function pick(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const t = t0 + (((e.clientX - box.left) / box.width) * width - M.l) / iw * span;
    let best = 0;
    hours.forEach((h, i) => { if (Math.abs(h - t) < Math.abs(hours[best] - t)) best = i; });
    setHover(best);
  }
  function key(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setHover((h) => Math.max(0, Math.min(hours.length - 1, (h ?? ti) + (e.key === 'ArrowLeft' ? -1 : 1))));
  }
  const hx = hover === null ? 0 : X(hours[hover]);
  const tipX = hx + 10 + TIP_W <= width - M.r ? hx + 10 : hx - 10 - TIP_W;

  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <span className="chart-title">{title}</span>
        <span className="chart-legend">
          <span className="key"><span className="key-line key-line--today" />Today · peak {kwNum(today[ti])} kW</span>
          {pill && <span className="key"><span className="key-line key-line--pill" />{pillLabel} · peak {kwNum(pill[pi])} kW</span>}
        </span>
      </figcaption>
      <div ref={ref}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={desc} tabIndex={0}
        onPointerMove={pick} onPointerLeave={() => setHover(null)} onFocus={() => setHover(ti)} onBlur={() => setHover(null)} onKeyDown={key}>
        {band && band.to > t0 && band.from < t1 && (
          <g>
            <rect x={X(Math.max(band.from, t0))} y={M.t} width={X(Math.min(band.to, t1)) - X(Math.max(band.from, t0))} height={ih} className="chart-band" />
            <text x={X(Math.max(band.from, t0)) + 4} y={M.t - 8} className="chart-note">{band.label}</text>
          </g>
        )}
        {[0, top / 2, top].map((v) => (
          <g key={v}>
            <line x1={M.l} x2={width - M.r} y1={Y(v)} y2={Y(v)} className="chart-grid" />
            <text x={M.l - 6} y={Y(v) + 4} textAnchor="end" className="chart-tick">{kwNum(v)}</text>
          </g>
        ))}
        {ticks.map((t) => <text key={t} x={X(t)} y={height - 6} textAnchor="middle" className="chart-tick">{fmtTime(t)}</text>)}
        {limit && (
          <g>
            <line x1={M.l} x2={width - M.r} y1={Y(limit.value)} y2={Y(limit.value)} className="chart-limit" />
            <text x={width - M.r} y={Y(limit.value) - 5} textAnchor="end" className="chart-note chart-note--limit">{limit.label}</text>
          </g>
        )}
        <path d={area(today)} className="chart-area chart-area--today" />
        <path d={line(today)} className="chart-line chart-line--today" />
        {pill && <path d={area(pill)} className="chart-area chart-area--pill" />}
        {pill && <path d={line(pill)} className="chart-line chart-line--pill" />}
        {cursor !== undefined && <line x1={X(cursor)} x2={X(cursor)} y1={M.t} y2={M.t + ih} className="chart-cursor" />}
        {pill && hover === null && (
          <g>
            <circle cx={X(hours[pi])} cy={Y(pill[pi])} r={4.5} className="chart-dot chart-dot--pill" />
            <text x={X(hours[pi])} y={Y(pill[pi]) - 10} textAnchor="middle" className="chart-label">{kwNum(pill[pi])}</text>
          </g>
        )}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={hx} x2={hx} y1={M.t} y2={M.t + ih} className="chart-cross" />
            <circle cx={hx} cy={Y(today[hover])} r={4.5} className="chart-dot chart-dot--today" />
            {pill && <circle cx={hx} cy={Y(pill[hover])} r={4.5} className="chart-dot chart-dot--pill" />}
            <g transform={`translate(${tipX} ${M.t})`}>
              <rect width={TIP_W} height={pill ? 58 : 40} rx={2} className="chart-tip" />
              <text x={10} y={17} className="chart-tip-time">{fmtTime(hours[hover])}</text>
              <line x1={10} x2={22} y1={30} y2={30} className="chart-line chart-line--today" />
              <text x={28} y={34} className="chart-tip-row"><tspan className="chart-tip-val">{kwNum(today[hover])} kW</tspan> today</text>
              {pill && <line x1={10} x2={22} y1={47} y2={47} className="chart-line chart-line--pill" />}
              {pill && <text x={28} y={51} className="chart-tip-row"><tspan className="chart-tip-val">{kwNum(pill[hover])} kW</tspan> {pillLabel.toLowerCase()}</text>}
            </g>
          </g>
        )}
      </svg>
      </div>
    </figure>
  );
}

/** Whole-building chart between two hours, for a result against today. */
export function BuildingChart({ today, pill, pillLabel, from = 5, to = 20, height = 220, cursor, title }: {
  today: SimResult; pill?: SimResult; pillLabel?: string; from?: number; to?: number; height?: number; cursor?: number; title?: string;
}) {
  const idx = today.series.flatMap((s, i) => (s.t >= from && s.t <= to ? [i] : []));
  return (
    <LoadChart
      title={title ?? `${TOWER.name}, whole building, kW`}
      hours={idx.map((i) => today.series[i].t)}
      today={idx.map((i) => today.series[i].msb)}
      pill={pill && idx.map((i) => pill.series[i].msb)}
      pillLabel={pillLabel}
      limit={{ value: TOWER.contractedCapacityKw, label: `Contracted capacity ${fmtKw(TOWER.contractedCapacityKw)}` }}
      band={ARRIVAL_BAND}
      height={height}
      cursor={cursor}
    />
  );
}

// ---------- what's running at the peak ----------

export function Contributors({ d }: { d: Diagnosis }) {
  const top = d.contributors[0]?.kw ?? 1;
  return (
    <div className="contributors" role="list" aria-label={`What is running at ${fmtTime(d.peakAtHour)}`}>
      {d.contributors.map((c) => (
        <div key={c.label} className="contributor" role="listitem">
          <span className="contributor-label"><Explained text={c.label} /></span>
          <span className="contributor-track" aria-hidden="true">
            <span className="contributor-fill" style={{ width: `${((c.kw - (c.surgeKw ?? 0)) / top) * 100}%` }} />
            {c.surgeKw ? <span className="contributor-surge" style={{ width: `${(c.surgeKw / top) * 100}%` }} /> : null}
          </span>
          <span className="contributor-kw">
            {fmtKw(c.kw)}
            {c.surgeKw ? <span className="contributor-note"> incl. {fmtKw(c.surgeKw)} start-up surge <Explained text="(inrush)" /></span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------- what runs when: schedule rows, today vs proposal ----------

interface Bar { from: number; to: number; surgeTo?: number; text?: string; title: string }
function chillerBar(a: Actions, i: number, who: string): Bar {
  const s = a.chillerStarts[i];
  return { from: s, to: SCHEDULE.hvacStop, surgeTo: s + CHILLER.inrushMin / 60, title: `${who}: chiller ${i + 1} starts ${fmtTime(s)} (surge ${a.inrushMult.toFixed(2)}× for ${CHILLER.inrushMin} min)` };
}
function evBar(a: Actions, who: string): Bar {
  if (a.ev.mode === 'managed') return { from: a.ev.start, to: a.ev.end, text: `${a.ev.chargers} chargers`, title: `${who}: managed charging ${fmtTime(a.ev.start)}–${fmtTime(a.ev.end)}, max ${a.ev.chargers} chargers` };
  const { start, fullUntil, rampHours } = SCHEDULE.evArrival;
  return { from: start, to: fullUntil + rampHours, text: `${LOADS.evChargers} chargers`, title: `${who}: charging on arrival from ${fmtTime(start)}, up to ${LOADS.evChargers} chargers` };
}

export function Timeline({ today, pill, window: [w0, w1] = [5, 16] }: { today: Actions; pill: Actions; window?: [number, number] }) {
  const ahu = (a: Actions, g: number, who: string): Bar => ({ from: a.ahuStarts[g], to: SCHEDULE.hvacStop, title: `${who}: AHUs for floors ${g === 0 ? '1–10' : '11–20'} start ${fmtTime(a.ahuStarts[g])}` });
  const sp = (a: Actions, who: string): Bar | null => a.setpoint && { from: a.setpoint.window[0], to: a.setpoint.window[1], text: `+${a.setpoint.offsetC}°C`, title: `${who}: setpoint +${a.setpoint.offsetC}°C, ${fmtTime(a.setpoint.window[0])}–${fmtTime(a.setpoint.window[1])}` };
  const rows: { name: string; today: Bar | null; pill: Bar | null }[] = [
    ...[0, 1, 2].map((i) => ({ name: `Chiller ${i + 1}`, today: chillerBar(today, i, 'Today'), pill: chillerBar(pill, i, 'Proposal') })),
    { name: 'AHUs fl 1–10', today: ahu(today, 0, 'Today'), pill: ahu(pill, 0, 'Proposal') },
    { name: 'AHUs fl 11–20', today: ahu(today, 1, 'Today'), pill: ahu(pill, 1, 'Proposal') },
    { name: 'EV charging', today: evBar(today, 'Today'), pill: evBar(pill, 'Proposal') },
    { name: 'Setpoint', today: sp(today, 'Today'), pill: sp(pill, 'Proposal') },
  ];
  const [ref, measured] = useWidth<HTMLDivElement>(720);
  const W = Math.max(600, measured), L = 104, R = W - 70, RH = 26, TOP = 24, BAR = 8;
  const H = TOP + rows.length * RH + 22;
  const X = (t: number) => L + ((Math.min(Math.max(t, w0), w1) - w0) / (w1 - w0)) * (R - L);
  const ticks: number[] = [];
  for (let t = Math.ceil(w0 / 2) * 2; t <= w1; t += 2) ticks.push(t);
  const draw = (b: Bar | null, y: number, cls: string) => {
    if (!b || b.to <= w0 || b.from >= w1) return null;
    const x0 = X(b.from), x1 = X(b.to);
    const roomRight = x1 + 6 + (b.text?.length ?? 0) * 6 <= W;
    return (
      <g>
        <title>{b.title}</title>
        <rect x={x0} y={y} width={Math.max(2, x1 - x0)} height={BAR} rx={1} className={`tl-bar tl-bar--${cls}`} />
        {b.surgeTo !== undefined && <rect x={x0} y={y} width={Math.max(2, X(b.surgeTo) - x0)} height={BAR} rx={1} className={`tl-surge tl-surge--${cls}`} />}
        {b.text && <text x={roomRight ? x1 + 5 : x0 - 5} y={y + BAR - 0.5} textAnchor={roomRight ? 'start' : 'end'} className="tl-note">{b.text}</text>}
      </g>
    );
  };
  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <span className="chart-title">What runs when</span>
        <span className="chart-legend">
          <span className="key"><span className="key-bar key-bar--today" />Today</span>
          <span className="key"><span className="key-bar key-bar--pill" />Proposal</span>
          <span className="key"><span className="key-bar key-bar--surge" />Solid start = start-up surge</span>
        </span>
      </figcaption>
      <div className="scroll-x" ref={ref}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" className="timeline"
          aria-label={rows.map((r) => `${r.name}: today ${r.today ? fmtTime(r.today.from) : 'none'}, proposal ${r.pill ? fmtTime(r.pill.from) : 'none'}`).join('; ')}>
          <rect x={X(SCHEDULE.liftsRush[0])} y={TOP} width={X(SCHEDULE.liftsRush[1]) - X(SCHEDULE.liftsRush[0])} height={rows.length * RH} className="chart-band" />
          <text x={X(SCHEDULE.liftsRush[0]) + 4} y={TOP - 8} className="chart-note">Arrival rush</text>
          {rows.map((r, i) => {
            const y = TOP + i * RH;
            return (
              <g key={r.name}>
                <line x1={0} x2={R} y1={y + RH} y2={y + RH} className="chart-grid" />
                <text x={0} y={y + RH / 2 + 4} className="tl-label">{r.name}</text>
                {draw(r.today, y + 4, 'today')}
                {draw(r.pill, y + 4 + BAR + 2, 'pill')}
              </g>
            );
          })}
          {ticks.map((t) => <text key={t} x={X(t)} y={H - 4} textAnchor="middle" className="chart-tick">{fmtTime(t)}</text>)}
        </svg>
      </div>
    </figure>
  );
}

// ---------- the building through the day: floors and boards ----------

function floorShade(t: number) {
  const v = Math.max(0, Math.min(1, t));
  return { background: `hsl(214 52% ${92 - v * 58}%)`, color: v > 0.5 ? '#fff' : '#16202B' };
}

function BuildingAt({ step, label }: { step: Step; label: string }) {
  const r = TOWER.boardRatings;
  const half = TOWER.floors / 2;
  const upper = step.sb3 / half;
  const lower = step.sb2 / half;
  return (
    <div className="building">
      <div className="building-label">{label}</div>
      <div className="building-body">
        <div className="floors" role="img" aria-label={`${label}: floors 1–10 draw about ${Math.round(lower)} kW each, floors 11–20 about ${Math.round(upper)} kW each, chiller plant ${Math.round(step.sb1)} kW.`}>
          {Array.from({ length: TOWER.floors }, (_, i) => {
            const floor = TOWER.floors - i;
            const kw = floor > half ? upper : lower;
            return <div key={floor} className="floor" style={floorShade(kw / 70)}>{floor % 5 === 0 ? floor : ''}</div>;
          })}
          <div className="floor floor--plant" style={floorShade(step.sb1 / 1300)}>Plant</div>
        </div>
        <div className="board-bars">
          {(Object.keys(r) as Board[]).map((b) => {
            const pct = (step[b] / r[b]) * 100;
            const s = boardStatus(pct);
            return (
              <div key={b} className="board-bar">
                <div className="board-bar-name">{b.toUpperCase()}</div>
                <div className="board-bar-track" role="img" aria-label={`${BOARD_NAMES[b]} ${Math.round(pct)}% of rating, ${STATUS_WORD[s]}`}>
                  <div className={`board-bar-fill status-${s}`} style={{ transform: `scaleY(${Math.min(100, pct) / 100})` }} />
                </div>
                <div className={`board-bar-pct status-${s}`}>{Math.round(pct)}%</div>
                <div className={`board-bar-word status-${s}`}>{s === 'overload' ? 'Over' : s === 'warning' ? '90%+' : 'OK'}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function BuildingThroughTheDay({ today, pill }: { today: SimResult; pill: SimResult }) {
  const [i, setI] = useState(32);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => setI((n) => (n + 1) % today.series.length), 160);
    return () => clearInterval(timer.current);
  }, [playing, today.series.length]);
  const t = today.series[i].t;
  return (
    <div className="day">
      <div className="day-controls">
        <button type="button" className="btn btn-icon" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play through the day'}>
          <Icon name={playing ? 'pause' : 'play'} size={16} />
        </button>
        <label className="day-slider">
          <span className="sr-only">Time of day</span>
          <input type="range" min={0} max={today.series.length - 1} value={i} onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }} />
        </label>
        <output className="day-time">{fmtTime(t)}</output>
        <span className="day-msb">
          Whole building: <strong>{kwNum(today.series[i].msb)} kW</strong> today · <strong className="pill-ink">{kwNum(pill.series[i].msb)} kW</strong> with the pill · cap {kwNum(TOWER.contractedCapacityKw)} kW
        </span>
      </div>
      <div className="day-grid">
        <BuildingAt step={today.series[i]} label="Today" />
        <BuildingAt step={pill.series[i]} label="With the pill" />
      </div>
      <p className="fineprint">Floors: darker means more power drawn. Bars: each power board against its rating, with the status in words. Drag the slider or press play to move through the day.</p>
    </div>
  );
}

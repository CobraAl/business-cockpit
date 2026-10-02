import { useEffect, useRef, useState } from 'react';
import { PALETTE } from '../lib/colors';
import { Popover } from './Popover';

/** Swatch button that opens the label palette plus a free color picker. */
export function ColorPicker({ value, onChange, label = 'Colour' }: { value: string; onChange: (hex: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const custom = !PALETTE.includes(value.toLowerCase());

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() =>
      (panel.current?.querySelector<HTMLElement>('.palette-swatch.is-on') ?? panel.current?.querySelector<HTMLElement>('.palette-swatch'))?.focus(),
    );
    return () => cancelAnimationFrame(id);
  }, [open]);

  const choose = (hex: string) => {
    onChange(hex.toLowerCase());
    setOpen(false);
    button.current?.focus();
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className="color-btn"
        style={{ background: value }}
        aria-label={`${label}: ${value}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      <Popover anchor={button} panelRef={panel} open={open} onClose={() => setOpen(false)} minWidth={228} label={label}>
        <div className="palette" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); button.current?.focus(); } }}>
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className={'palette-swatch' + (c === value.toLowerCase() ? ' is-on' : '')}
              style={{ background: c }}
              aria-label={c}
              onClick={() => choose(c)}
            />
          ))}
          <label className={'palette-custom' + (custom ? ' is-on' : '')} title="Pick another colour">
            <span style={{ background: custom ? value : 'conic-gradient(#e0525a, #e9a23b, #7ab83a, #22a6c9, #8b6fe8, #dd5aa6, #e0525a)' }} />
            Other colour
            <input type="color" value={value} onChange={(e) => onChange(e.target.value.toLowerCase())} />
          </label>
        </div>
      </Popover>
    </>
  );
}

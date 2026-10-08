import { useRef } from 'react';
import { useAtlas } from '../store/atlas';

/**
 * Grab bar of the phone bottom sheet: tap toggles half ⇄ full height, a swipe up expands,
 * a swipe down shrinks (and from half height closes). Hidden above the phone breakpoint.
 */
export function SheetHandle() {
  const { sheet, setSheet, togglePanel, lang } = useAtlas();
  const start = useRef<number | null>(null);
  const ms = lang === 'ms';
  const onUp = (y: number) => {
    const s = start.current;
    start.current = null;
    if (s === null) return;
    const dy = y - s;
    if (Math.abs(dy) < 12) setSheet(sheet === 'full' ? 'peek' : 'full'); // a tap
    else if (dy < 0) setSheet('full');
    else if (sheet === 'full') setSheet('peek');
    else togglePanel('right', false);
  };
  return (
    <button
      className="sheet-handle only-mobile"
      aria-label={sheet === 'full' ? (ms ? 'Kecilkan panel' : 'Collapse panel') : ms ? 'Besarkan panel' : 'Expand panel'}
      aria-expanded={sheet === 'full'}
      onPointerDown={(e) => { start.current = e.clientY; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }}
      onPointerUp={(e) => onUp(e.clientY)}
      onPointerCancel={() => { start.current = null; }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSheet(sheet === 'full' ? 'peek' : 'full'); } }}
    >
      <span aria-hidden="true" />
    </button>
  );
}

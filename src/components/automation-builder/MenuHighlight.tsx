import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * The one highlight a builder menu has, sliding between rows.
 *
 * Each row used to paint its own tint when it became active, which reads as
 * a light blinking on and off down the list. One element that GLIDES to the
 * active row says something different — "the same choice, moving" — and is
 * the detail that makes arrowing through a menu feel physical.
 *
 * It is decoration, strictly: aria-hidden, pointer-events-none, and the
 * active row is still announced through aria-activedescendant exactly as
 * before. Rows sit above it (they're positioned; it comes first in the
 * DOM), so nothing about hit-testing or reading order changes.
 *
 * Positioned by measurement rather than by index arithmetic because rows
 * have real, different heights — an option with a description is taller
 * than one without, and the highlight must fit the row it is on, not an
 * average. The styles are written to the node in a layout effect (before
 * paint), not held in React state: a state round-trip would paint one frame
 * of the highlight in the wrong place on every keystroke.
 *
 * First appearance lands instead of travelling: the slide is for moving
 * between rows the creator can see, and gliding in from wherever the
 * element happened to be last reads as a glitch. The reduced-motion rule in
 * index.css collapses the transition wholesale, so under that preference
 * every move lands the same way.
 */
export default function MenuHighlight({
  listRef,
  activeIndex,
}: {
  /** The listbox containing the `[role="option"]` rows — must be positioned. */
  listRef: RefObject<HTMLElement | null>;
  activeIndex: number;
}) {
  const highlightRef = useRef<HTMLDivElement>(null);
  const wasVisible = useRef(false);

  useLayoutEffect(() => {
    const highlight = highlightRef.current;
    if (!highlight) return;

    const rows = listRef.current?.querySelectorAll('[role="option"]');
    const row = activeIndex >= 0 ? (rows?.[activeIndex] as HTMLElement | undefined) : undefined;
    if (!row) {
      highlight.style.opacity = '0';
      wasVisible.current = false;
      return;
    }

    const place = () => {
      highlight.style.transform = `translateY(${row.offsetTop}px)`;
      highlight.style.height = `${row.offsetHeight}px`;
      highlight.style.opacity = '1';
    };

    if (wasVisible.current) {
      place();
    } else {
      highlight.style.transitionProperty = 'none';
      place();
      // Flush the un-transitioned position so the next move animates FROM
      // here rather than from wherever the hidden element last stood.
      void highlight.getBoundingClientRect();
      highlight.style.transitionProperty = '';
    }
    wasVisible.current = true;
  }, [listRef, activeIndex]);

  return (
    <div
      ref={highlightRef}
      aria-hidden="true"
      className="pointer-events-none absolute left-1 right-1 top-0 rounded-lg bg-[#F4F7EC]
        opacity-0 transition-[transform,height] duration-150 ease-out-quint"
    />
  );
}

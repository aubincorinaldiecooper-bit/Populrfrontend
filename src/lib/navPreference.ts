import { useCallback, useState } from 'react';

/**
 * Whether the builder's navigation is collapsed, as the creator last left it.
 *
 * The rail exists for a real reason: the canvas is the product, and the full
 * sidebar spends a quarter of a laptop on a Create button you cannot use from
 * inside an automation. But deciding that purely from the route makes it
 * something the app does TO you — you move between two screens and the
 * furniture rearranges itself, with no way to say you'd rather it didn't.
 *
 * So the route only chooses the DEFAULT. The creator's own choice, once made,
 * outranks it and is remembered — which is what makes this a journey rather
 * than a mode: the app proposes, the person decides, and it stops asking.
 *
 * Stored rather than held in state because the point is continuity across
 * visits. A preference that resets on reload is the same surprise again, just
 * less often.
 */
const KEY = 'populr.builderNavCollapsed';

/** Read once, defensively — Safari private mode throws on localStorage. */
function read(): boolean | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === null ? null : raw === '1';
  } catch {
    return null;
  }
}

function write(value: boolean): void {
  try {
    window.localStorage.setItem(KEY, value ? '1' : '0');
  } catch {
    // A creator with storage disabled keeps the default for the session. That
    // is a smaller cost than a shell that refuses to render.
  }
}

export interface BuilderNav {
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
}

/**
 * `defaultCollapsed` is what the route wants; the stored answer wins when the
 * creator has expressed one.
 *
 * Read in a lazy initialiser rather than an effect. An effect would paint the
 * route's default first and the creator's actual preference a frame later —
 * the sidebar visibly snapping to the other width on every load, which is the
 * exact jarring thing this whole change exists to remove. This app renders
 * only on the client, so there is no server paint to agree with and nothing
 * to gain by deferring the read.
 */
export function useBuilderNav(defaultCollapsed: boolean): BuilderNav {
  const [stored, setStored] = useState<boolean | null>(() => read());

  const setCollapsed = useCallback((next: boolean) => {
    setStored(next);
    write(next);
  }, []);

  return { collapsed: stored ?? defaultCollapsed, setCollapsed };
}

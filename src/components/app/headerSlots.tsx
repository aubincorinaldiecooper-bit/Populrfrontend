import * as React from 'react';
import { createPortal } from 'react-dom';

/**
 * Where a page puts things that belong in the app's header.
 *
 * The rule this exists to enforce: the content changes between pages, the
 * shell does not. A page that needs a breadcrumb or an Activate button in
 * the top bar renders it into a slot rather than rendering a top bar of its
 * own — which is what the automation builder used to do, and why the app
 * had two headers of different heights, grounds and geographies.
 *
 * Portals rather than passing nodes up through state. Handing JSX upward
 * means the parent re-renders whenever the child's JSX identity changes,
 * which is every render — a loop, unless every page remembers to memoize.
 * A portal inverts it: the header publishes an empty element, the page
 * renders into it, and neither has to know what the other is holding.
 *
 * When there is no header — a page mounted on its own, which is how most of
 * the test suite renders them — the slot renders its children inline
 * instead of swallowing them. A control must not vanish because the shell
 * it usually sits in wasn't there.
 */

interface Slots {
  local: HTMLElement | null;
  actions: HTMLElement | null;
}

const SlotsContext = React.createContext<Slots>({ local: null, actions: null });
const PublishContext = React.createContext<(slot: keyof Slots, node: HTMLElement | null) => void>(
  () => {},
);

export function HeaderSlotsProvider({ children }: { children: React.ReactNode }) {
  const [slots, setSlots] = React.useState<Slots>({ local: null, actions: null });
  const publish = React.useCallback((slot: keyof Slots, node: HTMLElement | null) => {
    // Guarded so a re-render that hands back the same element doesn't churn
    // the tree: callback refs fire again on every commit that touches them.
    setSlots(current => (current[slot] === node ? current : { ...current, [slot]: node }));
  }, []);
  return (
    <PublishContext.Provider value={publish}>
      <SlotsContext.Provider value={slots}>{children}</SlotsContext.Provider>
    </PublishContext.Provider>
  );
}

/**
 * Where a slot's content lands — AppHeader renders one per slot. A component
 * rather than a ref-returning hook so this file exports only components,
 * which is what keeps Fast Refresh working on the whole slot mechanism.
 */
export function HeaderSlotTarget({ slot, className }: { slot: keyof Slots; className?: string }) {
  const publish = React.useContext(PublishContext);
  const ref = React.useCallback(
    (node: HTMLElement | null) => publish(slot, node),
    [publish, slot],
  );
  return <div className={className} ref={ref} />;
}

function Slot({ slot, children }: { slot: keyof Slots; children: React.ReactNode }) {
  const target = React.useContext(SlotsContext)[slot];
  return target ? createPortal(children, target) : <>{children}</>;
}

/**
 * Page-scoped content for the left of the header: a breadcrumb, the name of
 * the thing being edited, its status. What page am I on.
 */
export function HeaderLocal({ children }: { children: React.ReactNode }) {
  return <Slot slot="local">{children}</Slot>;
}

/**
 * Page-scoped controls, to the left of the global cluster. What can I do to
 * this page. The global controls stay where they always are — a creator's
 * eye should never have to hunt for the bell because a page brought its own
 * buttons.
 */
export function HeaderActions({ children }: { children: React.ReactNode }) {
  return <Slot slot="actions">{children}</Slot>;
}

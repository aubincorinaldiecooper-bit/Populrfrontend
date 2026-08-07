import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/**
 * The builder's dropdown.
 *
 * A native `<select>` renders its option list with the operating system's own
 * chrome — dark grey on macOS, nothing like the rest of Populr — and it can't
 * show a description under an option. Since half of making this builder
 * understandable is explaining what each choice *does* at the moment you pick
 * it, the list has to be ours.
 *
 * Keyboard behaviour matches a native select closely enough to be unsurprising:
 * Enter/Space/ArrowDown opens, arrows move, Enter commits, Escape closes and
 * returns focus, Tab closes. Typing a letter jumps to the next option starting
 * with it.
 */

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** One line under the label — what this choice actually does. */
  description?: string;
  disabled?: boolean;
  /** Shown greyed after the label, e.g. why a choice isn't available. */
  note?: string;
}

export interface SelectProps<T extends string> {
  value: T | '';
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

export default function Select<T extends string>({
  value, options, onChange, placeholder = 'Choose…', ariaLabel, className = '',
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  // Seeded when the menu opens rather than synced by an effect: which row is
  // highlighted follows directly from the current value, so computing it at
  // open time avoids a render pass that exists only to correct itself.
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find(o => o.value === value) ?? null;
  const selectableIndex = (from: number, step: number): number => {
    for (let i = from; i >= 0 && i < options.length; i += step) {
      if (!options[i].disabled) return i;
    }
    return activeIndex;
  };

  // Close on an outside click or a scroll of the panel behind — an open menu
  // left floating over content the user has moved on from reads as stuck.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Keep the highlighted row in view when arrowing through a long list.
  // Optional-called: scrollIntoView is missing in jsdom and in a few older
  // mobile browsers, and losing the whole dropdown to a scrolling nicety
  // would be a poor trade.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const row = listRef.current?.querySelectorAll('[role="option"]')[activeIndex];
    (row as HTMLElement | undefined)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, activeIndex]);

  const commit = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(options.findIndex(o => o.value === value));
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (e.key === 'Tab') { setOpen(false); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => selectableIndex(Math.min(i + 1, options.length - 1), 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => selectableIndex(Math.max(i - 1, 0), -1));
      return;
    }
    if (e.key === 'Home') { e.preventDefault(); setActiveIndex(selectableIndex(0, 1)); return; }
    if (e.key === 'End') { e.preventDefault(); setActiveIndex(selectableIndex(options.length - 1, -1)); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(activeIndex); return; }

    if (e.key.length === 1 && /\S/.test(e.key)) {
      const letter = e.key.toLowerCase();
      const start = activeIndex + 1;
      const order = [...options.slice(start), ...options.slice(0, start)];
      const match = order.find(o => !o.disabled && o.label.toLowerCase().startsWith(letter));
      if (match) setActiveIndex(options.indexOf(match));
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (open) { setOpen(false); return; }
          setActiveIndex(options.findIndex(o => o.value === value));
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        className={`w-full flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-left
          text-[13px] transition-colors focus:outline-none focus:ring-2 focus:ring-[#C5FF3D]
          focus:border-transparent
          ${open ? 'border-[#C5FF3D]' : 'border-[#E8E4DF] hover:border-[#D8D3CC]'}`}
      >
        <span className={`flex-1 truncate ${selected ? 'text-[#111111]' : 'text-[#B0AAA2]'}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-[#8A857E] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-72 overflow-y-auto
            rounded-xl border border-[#E8E4DF] bg-white p-1
            shadow-[0_8px_28px_rgba(17,17,17,0.12)]"
        >
          {options.length === 0 && (
            <p className="px-2.5 py-2 text-[12px] text-[#8A857E]">Nothing to choose from yet.</p>
          )}
          {options.map((option, i) => {
            const isSelected = option.value === value;
            const isActive = i === activeIndex;
            return (
              <div
                key={option.value}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled}
                onClick={() => commit(i)}
                onMouseEnter={() => !option.disabled && setActiveIndex(i)}
                className={`flex items-start gap-2 rounded-lg px-2.5 py-2 cursor-pointer
                  ${option.disabled ? 'opacity-45 cursor-not-allowed' : ''}
                  ${isActive && !option.disabled ? 'bg-[#F4F7EC]' : ''}`}
              >
                <Check
                  size={14}
                  className={`mt-0.5 shrink-0 ${isSelected ? 'text-[#4D7C0F]' : 'text-transparent'}`}
                />
                <span className="min-w-0">
                  <span className="block text-[13px] leading-snug text-[#111111]">
                    {option.label}
                    {option.note && (
                      <span className="ml-1.5 text-[11px] text-[#8A857E]">{option.note}</span>
                    )}
                  </span>
                  {option.description && (
                    <span className="block text-[11px] leading-snug text-[#8A857E] mt-0.5">
                      {option.description}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

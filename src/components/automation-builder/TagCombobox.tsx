import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Tag } from 'lucide-react';
import MenuHighlight from './MenuHighlight';
import { normalizeTag } from '../../lib/tags';

/**
 * Tag picker: the workspace's existing tags, with the option to make a new one.
 *
 * A bare text input invites near-duplicates — `warm_lead`, `warmlead`,
 * `Warm Lead` — and every one of them fragments the Contacts filters that tags
 * exist to drive. Showing what already exists makes reuse the path of least
 * resistance, while the Create row keeps a new tag one keystroke away rather
 * than sending the creator off to another page.
 *
 * New tags are normalised the way the rest of the product stores them
 * (lowercase, spaces to underscores) so "Warm Lead" typed here and `warm_lead`
 * chosen from the list are the same tag, not two.
 */

export interface TagComboboxProps {
  value: string | null;
  tags: string[];
  onChange: (tag: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

export default function TagCombobox({
  value, tags, onChange, placeholder = 'Choose or create a tag', ariaLabel = 'Tag',
}: TagComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const normalized = normalizeTag(query);
  const needle = query.trim().toLowerCase();
  const matches = useMemo(
    () => (needle ? tags.filter(t => t.toLowerCase().includes(needle)) : tags),
    [tags, needle],
  );
  // Offer creation only when the typed tag isn't already one of theirs —
  // otherwise "Create warm_lead" sits under an identical existing row.
  const canCreate = normalized.length > 0 && !tags.includes(normalized);
  const rows = canCreate ? [...matches, `__create__${normalized}`] : matches;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const commit = (row: string) => {
    const tag = row.startsWith('__create__') ? row.slice('__create__'.length) : row;
    if (!tag) return;
    onChange(tag);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActiveIndex(i => Math.min(i + 1, rows.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      if (rows[activeIndex]) commit(rows[activeIndex]);
      // Enter on a typed value with no rows still creates it — the creator
      // has said what they want and shouldn't have to reach for the mouse.
      else if (canCreate) commit(`__create__${normalized}`);
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setQuery(''); }
  };

  return (
    <div ref={rootRef} className="relative">
      <div
        className={`flex items-center gap-2 rounded-lg border bg-white px-3 py-2 transition-colors
          ${open ? 'border-[#C5FF3D]' : 'border-[#E8E4DF] hover:border-[#D8D3CC]'}`}
      >
        <Tag size={14} className="shrink-0 text-[#8A857E]" />
        <input
          ref={inputRef}
          value={open ? query : value ?? ''}
          onChange={e => {
            setQuery(e.target.value);
            // Reset the highlight with the query rather than in an effect
            // reacting to it — the two always change together.
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={value ? value : placeholder}
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-autocomplete="list"
          role="combobox"
          className="flex-1 min-w-0 bg-transparent text-[13px] text-[#111111]
            placeholder:text-[#B0AAA2] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => { setOpen(o => !o); inputRef.current?.focus(); }}
          aria-label={open ? 'Close tag list' : 'Show tag list'}
          className="shrink-0 -mr-1 p-0.5 text-[#8A857E] hover:text-[#111111]"
        >
          <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-64 overflow-y-auto
            rounded-xl border border-[#E8E4DF] bg-white p-1
            shadow-[0_8px_28px_rgba(17,17,17,0.12)]
            origin-top motion-safe:animate-[pop-menu-in_140ms_cubic-bezier(0.23,1,0.32,1)]"
        >
          <MenuHighlight listRef={listRef} activeIndex={activeIndex} />
          {rows.length === 0 && (
            <p className="px-2.5 py-2 text-[12px] text-[#8A857E]">
              No tags yet — type one to create it.
            </p>
          )}
          {rows.map((row, i) => {
            const isCreate = row.startsWith('__create__');
            const tag = isCreate ? row.slice('__create__'.length) : row;
            return (
              <div
                key={row}
                role="option"
                aria-selected={!isCreate && tag === value}
                onClick={() => commit(row)}
                onMouseEnter={() => setActiveIndex(i)}
                // relative, so rows paint above the sliding highlight -- the one
                // element that now marks the active row.
                className="relative flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer"
              >
                {isCreate ? (
                  <>
                    <Plus size={14} className="shrink-0 text-[#4D7C0F]" />
                    <span className="text-[13px] text-[#111111]">
                      Create <span className="font-medium">{tag}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <Check
                      size={14}
                      className={`shrink-0 ${tag === value ? 'text-[#4D7C0F]' : 'text-transparent'}`}
                    />
                    <span className="text-[13px] text-[#111111] truncate">{tag}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

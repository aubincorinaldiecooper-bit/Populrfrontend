import { useState } from 'react';
import { X } from 'lucide-react';

const MAX_KEYWORDS = 10;

export default function KeywordInput({
  keywords, onChange, hint,
}: {
  keywords: string[];
  onChange: (keywords: string[]) => void;
  /** Contextual helper under the field. The default speaks about comments,
   *  which is wrong wherever the keywords match a reply or a DM — pass the
   *  sentence that's true where the field actually lives. */
  hint?: string;
}) {
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const addKeyword = () => {
    const value = draft.trim();
    if (!value) return;
    if (keywords.length >= MAX_KEYWORDS) {
      setNotice(`You can add up to ${MAX_KEYWORDS} keywords.`);
      return;
    }
    if (keywords.some(k => k.toLowerCase() === value.toLowerCase())) {
      setNotice('That keyword is already added.');
      setDraft('');
      return;
    }
    onChange([...keywords, value]);
    setDraft('');
    setNotice(null);
  };

  const removeKeyword = (keyword: string) => {
    onChange(keywords.filter(k => k !== keyword));
    setNotice(null);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border border-[#E8E4DF] rounded-xl px-2.5 py-2 focus-within:border-chartreuse focus-within:ring-2 focus-within:ring-chartreuse/20 transition-all">
        {keywords.map(k => (
          <span key={k} className="inline-flex items-center gap-1 bg-[#FAFAF8] text-[#111111] text-[12px] font-medium px-2.5 py-1 rounded-full">
            {k}
            <button type="button" onClick={() => removeKeyword(k)} aria-label={`Remove keyword ${k}`} className="hover:text-[#DC2626] transition-all">
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={e => { setDraft(e.target.value); setNotice(null); }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addKeyword(); }
            if (e.key === 'Backspace' && !draft && keywords.length > 0) removeKeyword(keywords[keywords.length - 1]);
          }}
          onBlur={() => draft.trim() && addKeyword()}
          placeholder={keywords.length === 0 ? 'Add keyword and press Enter' : 'Add another...'}
          className="flex-1 min-w-[120px] text-[13px] placeholder:text-[#9B9B8F] outline-none py-1"
        />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-[11px] text-[#9B9B8F]">{notice ?? hint ?? 'Matching is case-insensitive and checks if a comment contains the keyword.'}</p>
        <p className="text-[11px] text-[#9B9B8F] flex-shrink-0">{keywords.length}/{MAX_KEYWORDS}</p>
      </div>
    </div>
  );
}

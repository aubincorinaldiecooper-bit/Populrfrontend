import { useState } from 'react';

export interface PopulrQuestionOption { value: string; label: string }
interface Props { question: string; options: PopulrQuestionOption[]; onSubmit: (value: string) => void; progress?: string }

export default function PopulrQuestionCard({ question, options, onSubmit, progress }: Props) {
  const [selected, setSelected] = useState('');
  return <section className="rounded-2xl border border-[#E2DED8] bg-white p-3.5 shadow-[0_4px_16px_rgba(17,17,17,0.05)]">
    {progress && <p className="mb-2 text-[10.5px] font-medium uppercase tracking-wide text-[#8A857E]">{progress}</p>}
    <p className="text-[13px] font-medium leading-snug text-[#111111]">{question}</p>
    <div className="mt-3 space-y-1">{options.map(option => <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-[12px] text-[#4F4A45] hover:bg-[#F7F5F2]"><input type="radio" name="populr-question" value={option.value} checked={selected === option.value} onChange={() => setSelected(option.value)} className="accent-[#111111]" />{option.label}</label>)}</div>
    <button type="button" disabled={!selected} onClick={() => onSubmit(selected)} className="mt-3 w-full rounded-xl bg-[#111111] px-3 py-2 text-[12px] font-medium text-white disabled:opacity-30">Continue</button>
  </section>;
}

import { useEffect, useRef, useState } from 'react';
import { PanelRightClose, Sparkles } from 'lucide-react';
import { NODE_LABEL, type FlowNode } from '../../lib/flowSchema';
import type { ChangeCard, HistoryEntry } from './useFlowBuilder';
import PopulrAIComposer from './PopulrAIComposer';
import PopulrAIMessage from './PopulrAIMessage';
import PopulrWorkingState from './PopulrWorkingState';

const SUGGESTIONS = [
  'Message someone when they comment a keyword',
  'Reply when someone responds to my story',
  'Follow up if someone doesn\'t respond',
  'Capture an email before sending a link',
];

export interface AIChatPanelProps {
  history: HistoryEntry[]; composing: boolean; changeCard: ChangeCard | null;
  activity: string[]; canUndo: boolean; aiConfigured: boolean; empty: boolean;
  selectedNode: FlowNode | null; onSubmit: (prompt: string) => void; onUndo: () => void;
  onOpenHistory: () => void; onCollapse: () => void;
}

/** The chronological, canvas-aware Ask Populr conversation. */
export default function AIChatPanel({
  history, composing, changeCard, activity, canUndo, aiConfigured, empty, selectedNode,
  onSubmit, onUndo, onOpenHistory, onCollapse,
}: AIChatPanelProps) {
  const [value, setValue] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasNearBottom = useRef(true);

  useEffect(() => {
    if (!composing) return;
    const start = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [composing]);

  useEffect(() => {
    const container = scrollRef.current;
    if (container && wasNearBottom.current) {
      if (typeof container.scrollTo === 'function') container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      else container.scrollTop = container.scrollHeight;
    }
  }, [history.length, composing, activity.length]);

  const submit = () => {
    const prompt = value.trim();
    if (!prompt || composing) return;
    setValue(''); setSeconds(0); setPendingPrompt(prompt); onSubmit(prompt);
  };

  return <aside aria-label="Ask Populr" className="flex h-full w-full flex-col bg-white">
    <header className="flex items-center justify-between border-b border-[#F0EDE8] px-4 py-3.5">
      <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#EDFFC1]"><Sparkles size={14} /></span><div><h2 className="text-[14px] font-semibold leading-none text-[#111111]">Populr</h2><p className="mt-1 text-[10.5px] text-[#8A857E]">{composing ? 'Working…' : 'Automation copilot'}</p></div></div>
      <button type="button" onClick={onCollapse} title="Collapse chat" aria-label="Collapse AI" className="rounded-lg p-1.5 text-[#6B6B6B] hover:bg-[#F7F5F2] hover:text-[#111111]"><PanelRightClose size={16} /></button>
    </header>

    <div ref={scrollRef} onScroll={event => { const el = event.currentTarget; wasNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} className="flex-1 overflow-y-auto bg-[#FCFBF9] px-4 py-5">
      {history.length === 0 && !pendingPrompt && (empty ? <div className="pt-5 text-center"><h3 className="text-[17px] font-semibold tracking-tight text-[#111111]">What should happen?</h3><p className="mt-1.5 text-[12.5px] text-[#6B6B6B]">Describe it naturally. Populr will build it beside you.</p><div className="mt-4 flex flex-wrap justify-center gap-1.5">{SUGGESTIONS.map(suggestion => <button key={suggestion} type="button" onClick={() => setValue(suggestion)} className="rounded-full border border-[#E8E4DF] bg-white px-3 py-1.5 text-[11.5px] text-[#6B6B6B] hover:border-[#C5FF3D] hover:text-[#111111]">{suggestion}</button>)}</div></div> : <p className="pt-2 text-[12.5px] leading-relaxed text-[#8A857E]">Ask for a change and watch it happen on the canvas. You can keep refining it here.</p>)}

      <div className="space-y-7">
        {history.map((entry, index) => {
          const latest = index === history.length - 1;
          return <article key={`${entry.at}-${index}`} className="space-y-4">
            <div className="ml-auto max-w-[82%]"><p className="mb-1 text-right text-[10px] font-semibold uppercase tracking-wide text-[#8A857E]">You</p><p className="rounded-2xl rounded-tr-md bg-[#EDEAE5] px-3 py-2 text-[12.5px] leading-relaxed text-[#302D2A]">{entry.prompt}</p></div>
            <div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#687A36]">Populr</p><PopulrAIMessage text={entry.summary} changes={latest && changeCard?.touchedNodeIds.length ? (activity.length ? activity : ['Updated automation']) : []} canUndo={latest && !!changeCard && canUndo} onUndo={onUndo} onOpenHistory={latest && changeCard ? onOpenHistory : undefined} /></div>
          </article>;
        })}
        {composing && pendingPrompt && <article className="space-y-4"><div className="ml-auto max-w-[82%]"><p className="mb-1 text-right text-[10px] font-semibold uppercase tracking-wide text-[#8A857E]">You</p><p className="rounded-2xl rounded-tr-md bg-[#EDEAE5] px-3 py-2 text-[12.5px] leading-relaxed text-[#302D2A]">{pendingPrompt}</p></div><div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#687A36]">Populr</p><PopulrWorkingState seconds={seconds} /></div></article>}
      </div>
    </div>
    <PopulrAIComposer value={value} onChange={setValue} onSubmit={submit} working={composing} contextLabel={selectedNode ? NODE_LABEL[selectedNode.type] : undefined} aiConfigured={aiConfigured} />
  </aside>;
}

import { useState } from 'react';
import { X, Play, Loader2, Check, AlertCircle, MessageCircle, Send } from 'lucide-react';
import { NODE_LABEL, type FlowGraph, type FlowNodeType } from '../../lib/flowSchema';
import type { FlowSimulationResult } from '../../lib/api';

/**
 * Test mode: send a pretend comment or DM through the automation and watch
 * where it goes.
 *
 * The backend runs the *real* executors with side effects switched off, so
 * what appears here is produced by the same code that will run live — not a
 * preview that can quietly disagree with it. Nothing is sent, tagged or
 * scored, and waits fast-forward so a creator can see step five without
 * waiting a day for it.
 */

export interface TestPanelProps {
  graph: FlowGraph;
  running: boolean;
  result: FlowSimulationResult | null;
  onRun: (input: { channel: 'comment' | 'dm'; text: string; replied: boolean }) => void;
  onClose: () => void;
}

export default function TestPanel({ graph, running, result, onRun, onClose }: TestPanelProps) {
  const [channel, setChannel] = useState<'comment' | 'dm'>('comment');
  const [text, setText] = useState('guide');
  const [replied, setReplied] = useState(false);

  const nodeType = (id: string): FlowNodeType | null =>
    graph.nodes.find(n => n.id === id)?.type ?? null;

  const hasReplyCheck = graph.nodes.some(
    n => n.type === 'condition' && (n.config as { kind?: string }).kind === 'replied',
  );

  return (
    <aside
      className="absolute right-0 top-0 bottom-0 z-30 w-[340px] max-w-[90vw] bg-white
        border-l border-[#E8E4DF] shadow-[-4px_0_24px_rgba(17,17,17,0.06)]
        flex flex-col animate-in slide-in-from-right-2 fade-in duration-150"
      aria-label="Test this automation"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#F0EDE8]">
        <h2 className="text-[15px] font-semibold text-[#111111]">Test</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 -mr-1.5 rounded-lg text-[#6B6B6B] hover:bg-[#F7F5F2] hover:text-[#111111]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
          aria-label="Close test"
        >
          <X size={16} />
        </button>
      </header>

      <div className="px-4 py-3 border-b border-[#F0EDE8] space-y-3">
        <div>
          <span className="block text-[12px] font-medium text-[#111111] mb-1.5">Simulate</span>
          <div className="flex gap-2">
            {([
              { key: 'comment' as const, label: 'A comment', Icon: MessageCircle },
              { key: 'dm' as const, label: 'A DM', Icon: Send },
            ]).map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setChannel(key)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border
                  px-2.5 py-1.5 text-[12px] transition-colors
                  ${channel === key
                    ? 'border-[#C5FF3D] bg-[#F9FFE9] text-[#111111] font-medium'
                    : 'border-[#E8E4DF] text-[#6B6B6B] hover:border-[#D8D3CC]'}`}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="test-text" className="block text-[12px] font-medium text-[#111111] mb-1.5">
            They say
          </label>
          <input
            id="test-text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onRun({ channel, text, replied }); }}
            placeholder="guide"
            className="w-full rounded-lg border border-[#E8E4DF] bg-white px-3 py-2 text-[13px]
              text-[#111111] placeholder:text-[#B0AAA2] focus:outline-none focus:ring-2
              focus:ring-[#C5FF3D] focus:border-transparent"
          />
        </div>

        {hasReplyCheck && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={replied}
              onChange={e => setReplied(e.target.checked)}
              className="w-4 h-4 rounded border-[#D8D3CC] text-[#111111] focus:ring-[#C5FF3D]"
            />
            <span className="text-[12px] text-[#6B6B6B]">They reply to the first message</span>
          </label>
        )}

        <button
          type="button"
          onClick={() => onRun({ channel, text, replied })}
          disabled={running}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#111111]
            text-white px-3 py-2 text-[13px] font-medium disabled:opacity-50
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]
            focus-visible:ring-offset-1"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {running ? 'Running…' : 'Start test'}
        </button>

        <p className="text-[11px] text-[#8A857E] leading-snug">
          Nothing is really sent. Waits are skipped so you can see the whole path.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {!result && !running && (
          <p className="text-[12.5px] text-[#8A857E]">Run a test to see the path it takes.</p>
        )}

        {result && !result.matched && (
          <div className="rounded-lg bg-[#FFF7ED] border border-[#F5D9B8] px-3 py-2.5">
            <p className="text-[12.5px] font-medium text-[#9A3412]">This wouldn't trigger</p>
            <p className="mt-1 text-[11.5px] leading-snug text-[#9A3412]">{result.reason}</p>
          </div>
        )}

        {result?.matched && (
          <ol className="space-y-2">
            {result.steps.map((step, i) => {
              const type = nodeType(step.nodeId);
              const failed = step.status === 'failed';
              return (
                <li key={`${step.nodeId}-${i}`} className="flex gap-2.5">
                  <div className="flex flex-col items-center">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0
                        ${failed ? 'bg-[#FEE2E2] text-[#B91C1C]' : 'bg-[#F0F7DC] text-[#4D7C0F]'}`}
                    >
                      {failed ? <AlertCircle size={11} /> : <Check size={11} />}
                    </span>
                    {i < result.steps.length - 1 && <span className="flex-1 w-px bg-[#E8E4DF] my-1" />}
                  </div>
                  <div className="pb-1 min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8A857E]">
                      {type ? NODE_LABEL[type] : step.nodeType}
                      {step.branch && step.branch !== 'next' && (
                        <span className="ml-1.5 normal-case font-medium text-[#6B6B6B]">
                          → {step.branch === 'yes' ? 'Yes' : 'No'}
                        </span>
                      )}
                    </p>
                    <p className={`text-[12.5px] leading-snug ${failed ? 'text-[#B91C1C]' : 'text-[#111111]'}`}>
                      {step.detail}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </aside>
  );
}

import { useRef, useState, useEffect } from 'react';
import { Send, RotateCcw, Loader2, AlertCircle } from 'lucide-react';
import { testAutomation, isBackendConfigured } from '../../lib/api';
import type { AutomationTestResult } from '../../lib/api';
import { AUTOMATION_TYPES, type AutomationWizardApi } from './useAutomationWizard';

interface TestEntry {
  id: string;
  sampleText: string;
  status: 'loading' | 'done' | 'error';
  result?: AutomationTestResult;
  error?: string;
}

export default function AutomationTestChat({ wizard }: { wizard: AutomationWizardApi }) {
  const { state } = wizard;
  const [input, setInput] = useState('');
  const [entries, setEntries] = useState<TestEntry[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const backendConfigured = isBackendConfigured();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const cfg = state.type ? AUTOMATION_TYPES[state.type] : null;
  const channel: 'comment' | 'dm' = cfg?.triggerType === 'dm' ? 'dm' : 'comment';

  const canTest = backendConfigured && !!state.type && !!state.accountId && state.triggerKeywords.length > 0;

  const runTest = async () => {
    const sampleText = input.trim();
    if (!sampleText || !cfg || !state.accountId) return;
    const id = `t-${Date.now()}`;
    setEntries(prev => [...prev, { id, sampleText, status: 'loading' }]);
    setInput('');
    try {
      const result = await testAutomation({
        platform: 'instagram',
        accountId: state.accountId,
        triggerType: cfg.triggerType,
        keywords: state.triggerKeywords,
        replyChannel: cfg.replyChannel,
        channel,
        postId: state.post?.id,
        sampleText,
        aiEnabled: state.aiEnabled,
        aiInstructions: state.aiInstructions,
      });
      setEntries(prev => prev.map(e => e.id === id ? { ...e, status: 'done', result } : e));
    } catch (err) {
      setEntries(prev => prev.map(e => e.id === id ? { ...e, status: 'error', error: err instanceof Error ? err.message : 'Test failed.' } : e));
    }
  };

  const reset = () => setEntries([]);

  return (
    <div className="border-l border-[#E8E4DF] bg-[#FAFAF8] flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[#E8E4DF] bg-white flex-shrink-0 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold text-[#111111] uppercase tracking-wider">Test chat</p>
          <p className="text-[10px] text-[#9B9B8F] mt-0.5">Nothing here is sent or saved.</p>
        </div>
        <button onClick={reset} className="p-1.5 hover:bg-[#FAFAF8] rounded-lg transition-all" title="Reset" aria-label="Reset test chat">
          <RotateCcw size={14} className="text-[#6B6B6B]" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3" aria-live="polite">
        {!canTest && (
          <div className="text-center py-8 px-3">
            <p className="text-[12px] text-[#9B9B8F]">
              {!backendConfigured ? "Populr isn't connected to a backend yet." : !state.type ? 'Choose an automation type to test it.' : !state.accountId ? 'Connect an Instagram account to test.' : 'Add at least one trigger keyword to test.'}
            </p>
          </div>
        )}
        {canTest && entries.length === 0 && (
          <div className="text-center py-8 px-3">
            <p className="text-[12px] text-[#9B9B8F]">Type a sample {channel === 'comment' ? 'comment' : 'DM'} to see how Populr would respond.</p>
          </div>
        )}
        {entries.map(entry => (
          <div key={entry.id} className="space-y-2">
            <div className="flex justify-end">
              <div className="max-w-[85%] bg-[#111111] text-white px-3.5 py-2.5 rounded-2xl rounded-br-sm text-[12px] leading-relaxed">
                {entry.sampleText}
              </div>
            </div>
            <p className="text-[9px] text-[#9B9B8F] text-right pr-1">Incoming {channel === 'comment' ? 'comment' : 'DM'}</p>

            {entry.status === 'loading' && (
              <div className="flex items-center gap-2 text-[12px] text-[#6B6B6B] px-1">
                <Loader2 size={13} className="animate-spin" />Testing...
              </div>
            )}

            {entry.status === 'error' && (
              <div className="flex items-start gap-2 bg-[#FEE2E2] text-[#DC2626] px-3 py-2 rounded-xl text-[12px]">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />{entry.error}
              </div>
            )}

            {entry.status === 'done' && entry.result && (
              <TestResultBubbles result={entry.result} />
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="px-3 py-2.5 border-t border-[#E8E4DF] bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runTest(); }}
            disabled={!canTest}
            placeholder={`Type a sample ${channel} to test...`}
            aria-label="Sample message to test"
            className="flex-1 bg-[#F5F0EB] rounded-full px-3.5 py-2 text-[12px] placeholder:text-[#9B9B8F] border-0 outline-none focus-visible:ring-2 focus-visible:ring-chartreuse/40 disabled:opacity-50"
          />
          <button onClick={runTest} disabled={!canTest || !input.trim()}
            aria-label="Run test"
            className={`p-2 rounded-full transition-all ${canTest && input.trim() ? 'bg-chartreuse' : 'bg-[#E8E4DF]'}`}>
            <Send size={13} className={canTest && input.trim() ? 'text-[#111111]' : 'text-[#9B9B8F]'} />
          </button>
        </div>
      </div>
    </div>
  );
}

function TestResultBubbles({ result }: { result: AutomationTestResult }) {
  if (!result.matched) {
    return (
      <div className="bg-white border border-[#E8E4DF] text-[#6B6B6B] px-3 py-2 rounded-xl text-[12px]">
        No match — {result.reason ?? 'the sample text didn\'t contain a trigger keyword.'}
      </div>
    );
  }
  if (result.needsHuman && !result.publicReply && !result.dm) {
    return (
      <div className="bg-[#FFF3E0] text-[#D97706] px-3 py-2 rounded-xl text-[12px]">
        Matched keyword &ldquo;{result.keyword}&rdquo; — {result.reason ?? 'needs a human reply.'}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {result.publicReply && (
        <div>
          <div className="max-w-[85%] bg-[#F5F0EB] text-[#111111] px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-[12px] leading-relaxed">
            {result.publicReply}
          </div>
          <p className="text-[9px] text-[#9B9B8F] pl-1 mt-0.5">Public reply</p>
        </div>
      )}
      {result.dm && (
        <div>
          <div className="max-w-[85%] bg-[#F5F0EB] text-[#111111] px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-[12px] leading-relaxed">
            {result.dm}
          </div>
          <p className="text-[9px] text-[#9B9B8F] pl-1 mt-0.5">DM</p>
        </div>
      )}
    </div>
  );
}

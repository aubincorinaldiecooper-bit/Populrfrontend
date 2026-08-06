import { useEffect } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import AutomationTypeSelector from './AutomationTypeSelector';
import { useApp } from '../../context/AppContext';
import type { AutomationWizardApi } from './useAutomationWizard';

export default function CreateStep({ wizard }: { wizard: AutomationWizardApi }) {
  const { state, update, instagramAccounts } = wizard;
  const { accountsLoading, accountsError, refreshAccounts } = useApp();

  // Is the currently-selected account actually connected right now? A draft or
  // an edit can reference an account that has since been disconnected.
  const accountConnected = !!state.accountId && instagramAccounts.some(a => a.id === state.accountId);

  useEffect(() => {
    // Auto-select the sole connected account when nothing valid is selected —
    // including when a stale/disconnected id is set (the old `!state.accountId`
    // check left a stale id in place, so Continue was enabled for a dead
    // account and the selector never appeared to fix it).
    if (!accountConnected && instagramAccounts.length === 1) {
      update('accountId', instagramAccounts[0].id);
    }
  }, [instagramAccounts, accountConnected, update]);

  if (instagramAccounts.length === 0) {
    // Distinguish "we couldn't check" / "still checking" from "genuinely none
    // connected" — an empty list after a failed/pending fetch must not be
    // reported as "no account connected" (and must offer a retry), or an
    // existing automation's owner is told to connect an account they have.
    if (accountsLoading) {
      return (
        <div className="pop-card p-5 flex items-center gap-3">
          <Loader2 size={16} className="animate-spin text-[#9B9B8F]" />
          <p className="text-[13px] text-[#6B6B6B]">Checking your connected accounts…</p>
        </div>
      );
    }
    if (accountsError) {
      return (
        <div className="pop-card p-5 flex items-start gap-3">
          <AlertTriangle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[#111111]">Couldn&apos;t check your connected accounts</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">
              This doesn&apos;t change what you&apos;ve connected.{' '}
              <button onClick={() => { void refreshAccounts(); }} className="underline underline-offset-2 text-[#111111]">
                Try again
              </button>
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="pop-card p-5 flex items-start gap-3">
        <AlertTriangle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-[#111111]">No Instagram account connected</p>
          <p className="text-[12px] text-[#6B6B6B] mt-1">Connect an Instagram account from Channels before creating an automation.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="automation-name" className="font-geist font-bold text-base text-[#111111] mb-2 block">Automation name</label>
        <input id="automation-name" type="text" value={state.name} onChange={e => update('name', e.target.value)}
          placeholder="e.g., Freebie: DSLR Guide"
          className="w-full border border-[#E8E4DF] rounded-xl px-3.5 py-2.5 text-[13px] placeholder:text-[#9B9B8F] focus:outline-none focus-visible:border-chartreuse focus-visible:ring-2 focus-visible:ring-chartreuse/20 transition-all" />
      </div>

      {/* Show the selector when there's a real choice, OR when the current
          selection isn't a connected account (a stale draft/edit id) so the
          user can switch to a live one instead of being stuck. */}
      {(instagramAccounts.length > 1 || !accountConnected) && (
        <div>
          <label htmlFor="automation-account" className="font-geist font-bold text-base text-[#111111] mb-2 block">Instagram account</label>
          <select id="automation-account" value={accountConnected ? state.accountId ?? '' : ''} onChange={e => update('accountId', e.target.value)}
            className="w-full border border-[#E8E4DF] rounded-xl px-3.5 py-2.5 text-[13px] bg-white focus:outline-none focus-visible:border-chartreuse focus-visible:ring-2 focus-visible:ring-chartreuse/20 transition-all">
            <option value="" disabled>Choose an account</option>
            {instagramAccounts.map(a => (
              <option key={a.id} value={a.id}>{a.username ? `@${a.username}` : a.display_name ?? a.id}</option>
            ))}
          </select>
          {!accountConnected && state.accountId && (
            <p className="text-[12px] text-[#D97706] mt-1.5">
              The account this automation used isn&apos;t connected anymore. Pick a connected account to continue.
            </p>
          )}
        </div>
      )}

      <div>
        <span className="font-geist font-bold text-base text-[#111111] mb-2 block">Automation type</span>
        <AutomationTypeSelector value={state.type} onChange={type => update('type', type)} />
      </div>
    </div>
  );
}

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import AutomationTypeSelector from './AutomationTypeSelector';
import type { AutomationWizardApi } from './useAutomationWizard';

export default function CreateStep({ wizard }: { wizard: AutomationWizardApi }) {
  const { state, update, instagramAccounts } = wizard;

  useEffect(() => {
    if (!state.accountId && instagramAccounts.length === 1) {
      update('accountId', instagramAccounts[0].id);
    }
  }, [instagramAccounts, state.accountId, update]);

  if (instagramAccounts.length === 0) {
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

      {instagramAccounts.length > 1 && (
        <div>
          <label htmlFor="automation-account" className="font-geist font-bold text-base text-[#111111] mb-2 block">Instagram account</label>
          <select id="automation-account" value={state.accountId ?? ''} onChange={e => update('accountId', e.target.value)}
            className="w-full border border-[#E8E4DF] rounded-xl px-3.5 py-2.5 text-[13px] bg-white focus:outline-none focus-visible:border-chartreuse focus-visible:ring-2 focus-visible:ring-chartreuse/20 transition-all">
            <option value="" disabled>Choose an account</option>
            {instagramAccounts.map(a => (
              <option key={a.id} value={a.id}>{a.username ? `@${a.username}` : a.display_name ?? a.id}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <span className="font-geist font-bold text-base text-[#111111] mb-2 block">Automation type</span>
        <AutomationTypeSelector value={state.type} onChange={type => update('type', type)} />
      </div>
    </div>
  );
}

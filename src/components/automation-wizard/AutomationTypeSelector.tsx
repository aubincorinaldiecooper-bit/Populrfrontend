import { MessageSquare, MessageCircle, Send, Info } from 'lucide-react';
import { AUTOMATION_TYPES, typeRestriction, type AutomationTypeCard } from './useAutomationWizard';
import { platformMeta } from '../../lib/platformMeta';
import type { PlatformCapabilities } from '../../lib/api';

const TYPE_ICONS: Record<AutomationTypeCard, typeof MessageSquare> = {
  comment_dm: MessageSquare,
  comment_reply: MessageCircle,
  dm_only: Send,
};

const TYPE_ORDER: AutomationTypeCard[] = ['comment_dm', 'comment_reply', 'dm_only'];

/**
 * The three automation types, gated by what the selected account's platform
 * actually allows (typeRestriction). A blocked card stays visible with the
 * reason — "this exists, but not on X" reads honestly, where a vanished
 * option reads as a bug. With no caps yet (loading/failed) nothing is gated;
 * the backend re-validates every save against the same matrix.
 */
export default function AutomationTypeSelector({
  value, onChange, caps,
}: {
  value: AutomationTypeCard | null;
  onChange: (type: AutomationTypeCard) => void;
  caps: PlatformCapabilities | null;
}) {
  // A platform where no automation type works at all (TikTok, YouTube):
  // say what IS available instead of rendering three dead cards.
  if (caps && TYPE_ORDER.every(key => typeRestriction(key, caps) !== null)) {
    return (
      <div className="pop-card p-5 flex items-start gap-3">
        <Info size={18} className="text-[#9B9B8F] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-[#111111]">
            {platformMeta(caps.platform).name} automation is limited to publishing and analytics for now
          </p>
          <p className="text-[12px] text-[#6B6B6B] mt-1">
            {caps.caveat || 'Comment and DM automation isn’t available through the API yet.'}{' '}
            Pick an account on another platform to build a reply automation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {TYPE_ORDER.map(key => {
        const cfg = AUTOMATION_TYPES[key];
        const Icon = TYPE_ICONS[key];
        const selected = value === key;
        const restriction = typeRestriction(key, caps);
        const blocked = restriction !== null;
        return (
          <button
            key={key}
            type="button"
            onClick={() => { if (!blocked) onChange(key); }}
            aria-pressed={selected}
            aria-disabled={blocked}
            className={`text-left border rounded-2xl p-4 transition-all ${
              selected
                ? 'border-[#111111] bg-[#FAFAF8] ring-2 ring-chartreuse'
                : blocked
                  ? 'border-[#E8E4DF] bg-[#FAFAF8] opacity-60 cursor-not-allowed'
                  : 'border-[#E8E4DF] hover:border-[#D4CFC8]'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${selected ? 'bg-chartreuse' : 'bg-[#FAFAF8]'}`}>
                <Icon size={16} className="text-[#111111]" />
              </div>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selected ? 'border-[#111111] bg-[#111111]' : 'border-[#E8E4DF]'}`}>
                {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
            </div>
            <p className="font-geist font-semibold text-[13px] text-[#111111]">{cfg.title}</p>
            <p className="text-[11px] text-[#6B6B6B] mt-1 leading-relaxed">{cfg.description}</p>
            {blocked && (
              <p className="text-[11px] text-[#D97706] mt-2 leading-relaxed">{restriction}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}

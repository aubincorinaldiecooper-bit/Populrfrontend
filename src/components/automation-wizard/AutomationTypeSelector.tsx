import { MessageSquare, MessageCircle, Send } from 'lucide-react';
import { AUTOMATION_TYPES, type AutomationTypeCard } from './useAutomationWizard';

const TYPE_ICONS: Record<AutomationTypeCard, typeof MessageSquare> = {
  comment_dm: MessageSquare,
  comment_reply: MessageCircle,
  dm_only: Send,
};

const TYPE_ORDER: AutomationTypeCard[] = ['comment_dm', 'comment_reply', 'dm_only'];

export default function AutomationTypeSelector({
  value, onChange,
}: { value: AutomationTypeCard | null; onChange: (type: AutomationTypeCard) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {TYPE_ORDER.map(key => {
        const cfg = AUTOMATION_TYPES[key];
        const Icon = TYPE_ICONS[key];
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={selected}
            className={`text-left border rounded-2xl p-4 transition-all ${selected ? 'border-[#111111] bg-[#FAFAF8] ring-2 ring-chartreuse' : 'border-[#E8E4DF] hover:border-[#D4CFC8]'}`}
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
          </button>
        );
      })}
    </div>
  );
}

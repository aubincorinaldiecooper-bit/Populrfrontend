import { CheckCircle2 } from 'lucide-react';
import { AUTOMATION_TYPES, type WizardState } from './useAutomationWizard';
import { platformMeta } from '../../lib/platformMeta';

function ChecklistRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <CheckCircle2 size={16} className={done ? 'text-[#059669]' : 'text-[#D4CFC8]'} />
      <span className={`text-[12px] ${done ? 'text-[#111111]' : 'text-[#9B9B8F]'}`}>{label}</span>
    </div>
  );
}

export default function ActivationPanel({ state }: { state: WizardState }) {
  const needsPost = state.type ? AUTOMATION_TYPES[state.type].needsPost : false;
  // Thumbnail fallback follows the post's own platform, not Instagram.
  const PlatformIcon = platformMeta(state.post?.platform ?? state.platform ?? 'instagram').icon;

  return (
    <div className="pop-card p-5 grid grid-cols-1 sm:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={18} className="text-[#059669] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] text-[#9B9B8F]">Automation</p>
            <p className="text-[13px] font-semibold text-[#111111]">{state.name}</p>
            <p className="text-[11px] text-[#6B6B6B] mt-0.5">{state.type ? AUTOMATION_TYPES[state.type].title : ''}</p>
          </div>
        </div>
        {needsPost && state.post && (
          <div className="flex items-start gap-3">
            <CheckCircle2 size={18} className="text-[#059669] flex-shrink-0 mt-0.5" />
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-[#FAFAF8] flex-shrink-0 overflow-hidden">
                {state.post.media_url ? (
                  <img src={state.post.media_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><PlatformIcon size={14} className="text-[#9B9B8F]" /></div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-[#9B9B8F]">Post</p>
                <p className="text-[12px] text-[#111111] line-clamp-2">{state.post.caption || 'Untitled post'}</p>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="space-y-3">
        {needsPost && <ChecklistRow done={!!state.post} label="Post selected" />}
        <ChecklistRow done={state.triggerKeywords.length > 0} label="Keywords added" />
        <ChecklistRow done={!state.aiEnabled || state.aiInstructions.trim().length > 0} label="AI instructions ready" />
      </div>
    </div>
  );
}

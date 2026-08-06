import { AlertCircle } from 'lucide-react';
import ReviewSummaryStrip from './ReviewSummaryStrip';
import ActivationPanel from './ActivationPanel';
import { AUTOMATION_TYPES, type AutomationWizardApi } from './useAutomationWizard';
import { useApp } from '../../context/AppContext';
import { platformMeta } from '../../lib/platformMeta';

/** One labelled line in the reply summary; omitted entirely when empty. */
function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex gap-2 text-[12px]">
      <span className="text-[#9B9B8F] w-28 flex-shrink-0">{label}</span>
      <span className={`${muted ? 'text-[#9B9B8F] italic' : 'text-[#111111]'} break-words min-w-0`}>{value}</span>
    </div>
  );
}

export default function ReviewStep({ wizard }: { wizard: AutomationWizardApi }) {
  const {
    state, platform, saveError, canProceedFromCreate, canProceedFromReplies,
    dmTakesButtons, dmMediaBlockedReason,
  } = wizard;
  const { accounts } = useApp();
  const cfg = state.type ? AUTOMATION_TYPES[state.type] : null;
  const wantsComment = cfg?.replyChannel === 'comment' || cfg?.replyChannel === 'both';
  const wantsDM = cfg?.replyChannel === 'dm' || cfg?.replyChannel === 'both';
  const link = state.linkUrl.trim();

  // "X — @brand" when the account is loadable; the bare platform name when
  // only the captured platform is known; nothing when neither is.
  const account = accounts.find(a => a.id === state.accountId);
  const accountLabel = account
    ? `${platformMeta(account.platform).name}${account.username ? ` — @${account.username}` : ''}`
    : platform
      ? platformMeta(platform).name
      : null;

  return (
    <div className="max-w-[720px] mx-auto p-6 space-y-4">
      <div>
        <h2 className="font-geist font-bold text-base text-[#111111] mb-1">Review</h2>
        <p className="text-[12px] text-[#6B6B6B]">Confirm your setup and activate when you&apos;re ready.</p>
      </div>

      <ReviewSummaryStrip state={state} accountLabel={accountLabel} />

      {/* Reply content was never shown on Review, so a resumed draft with a
          dropped link or a missing reply could be saved with no visible sign.
          Surface exactly what will be sent, plus the exact-vs-AI mode. */}
      <div className="bg-white border border-[#E8E4DF] rounded-xl px-4 py-3 space-y-1.5">
        <Row label="Reply mode" value={state.aiEnabled ? 'AI-generated reply' : 'Exact message'} />
        {state.aiEnabled && (
          <Row label="Instructions" value={state.aiInstructions.trim() || 'None yet'} muted={!state.aiInstructions.trim()} />
        )}
        {wantsComment && (
          <Row
            label="Public comment"
            value={
              state.commentReplyBody.trim() ||
              (state.aiEnabled ? 'AI writes this' : 'Just sent you a DM! 📩 (default)')
            }
            muted={!state.commentReplyBody.trim()}
          />
        )}
        {wantsDM && (
          <Row
            label={state.aiEnabled ? 'Fallback DM' : 'DM message'}
            value={state.dmBody.trim() || 'None'}
            muted={!state.dmBody.trim()}
          />
        )}
        {link && <Row label="Link" value={link} />}
        {/* Same capability predicates as buildInput: what save() would drop
            (kind-blocked media, buttons on a platform whose DMs have none)
            must not be shown here as content that will be sent. Blocked
            media additionally blocks saving via the banner below. */}
        {wantsDM && state.mediaUrl.trim() && !dmMediaBlockedReason && <Row label="Media" value={state.mediaUrl.trim()} />}
        {wantsDM && dmTakesButtons && link && state.buttonLabel.trim() && <Row label="Button" value={state.buttonLabel.trim()} />}
      </div>

      <ActivationPanel state={state} />

      {/* Re-assert validity here: a draft can land on Review past the per-step
          gates. Point back to the step that needs attention instead of letting
          Activate drop the problem. */}
      {(!canProceedFromCreate || !canProceedFromReplies) && (
        <div className="bg-[#FFF3E0] text-[#D97706] px-3.5 py-2.5 rounded-xl text-[12px] flex items-start gap-2">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            {!canProceedFromCreate
              ? 'Pick a connected account before saving — go back to the first step.'
              : dmMediaBlockedReason
                ? `${dmMediaBlockedReason} Go back to the Replies step to change it.`
                : 'This automation is missing required reply info (a trigger keyword, reply content, or a valid link). Go back to the Replies step to finish it.'}
          </span>
        </div>
      )}

      {saveError && (
        <div className="bg-[#FEE2E2] text-[#DC2626] px-3.5 py-2.5 rounded-xl text-[12px] flex items-start gap-2">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />{saveError}
        </div>
      )}
    </div>
  );
}

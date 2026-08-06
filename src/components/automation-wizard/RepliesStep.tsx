import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, MessageCircle } from 'lucide-react';
import KeywordInput from './KeywordInput';
import AIInstructionField from './AIInstructionField';
import AutomationTestChat from './AutomationTestChat';
import { AUTOMATION_TYPES, isUsableHttpUrl } from './useAutomationWizard';
import type { AutomationWizardApi } from './useAutomationWizard';
import { useApp } from '../../context/AppContext';
import { isBackendConfigured, fetchCapabilities } from '../../lib/api';
import type { PlatformCapabilities } from '../../lib/api';

const URL_ERROR = 'Enter a full link starting with http:// or https://.';

const FIELD_CLASS =
  'w-full bg-white border border-[#E8E4DF] rounded-xl px-3.5 py-2.5 text-[13px] placeholder:text-[#9B9B8F] outline-none focus-visible:ring-2 focus-visible:ring-chartreuse/40';

/** Plain-text disclosure — a border-top and a chevron, not another card. */
function Disclosure({
  title, hint, defaultOpen, children,
}: { title: string; hint?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-t border-[#F0EEEA] pt-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[12px] font-semibold text-[#111111] w-full text-left"
      >
        {open ? <ChevronDown size={14} className="text-[#9B9B8F]" /> : <ChevronRight size={14} className="text-[#9B9B8F]" />}
        {title}
        {hint && !open && <span className="font-normal text-[#9B9B8F] truncate"> — {hint}</span>}
      </button>
      {open && <div className="mt-3 space-y-4">{children}</div>}
    </div>
  );
}

/**
 * The step that decides what the automation sends. Progressive disclosure:
 * trigger keywords, then Reply content (with an explicit Exact message /
 * AI-generated reply choice), then Instructions for Populr only when AI is
 * on. Fields the automation type or the platform can't use are not shown at
 * all, and media/link/button live in one collapsed optional section.
 *
 * The Exact/AI relationship mirrors the engine (populrbackend
 * engineService.ts) rather than inventing one: the AI writes both surfaces,
 * but links never appear in public comments — the tracked link is
 * per-contact and rides the DM (text and button) — so a link-carrying AI
 * answer posts the configured comment text publicly and delivers the full
 * reply in the DM, and when the AI can't confidently answer at all, both
 * configured messages go out as written. In AI mode the message fields are
 * therefore fallbacks, collapsed under one disclosure.
 */
export default function RepliesStep({ wizard }: { wizard: AutomationWizardApi }) {
  const { state, update } = wizard;
  const { accounts } = useApp();
  const cfg = state.type ? AUTOMATION_TYPES[state.type] : null;
  const wantsComment = cfg?.replyChannel === 'comment' || cfg?.replyChannel === 'both';
  const wantsDM = cfg?.replyChannel === 'dm' || cfg?.replyChannel === 'both';
  const backendConfigured = isBackendConfigured();

  const platform = accounts.find(a => a.id === state.accountId)?.platform ?? 'instagram';

  // Platform capabilities gate which reply fields exist at all. Unknown
  // capabilities (still loading, or the endpoint failed) fail open — hiding
  // a field the platform does support is worse than showing one it doesn't,
  // since the engine skips unsupported sends safely anyway.
  const [caps, setCaps] = useState<PlatformCapabilities | null>(null);
  useEffect(() => {
    if (!backendConfigured) return;
    let cancelled = false;
    fetchCapabilities()
      .then(list => {
        if (cancelled) return;
        setCaps(list.find(c => c.platform === platform) ?? null);
      })
      .catch(err => console.error('[wizard] capabilities load failed — showing all channel fields:', err));
    return () => { cancelled = true; };
  }, [backendConfigured, platform]);

  const showComment = wantsComment && (caps?.supportsCommentReplies ?? true);
  const showDM = wantsDM && (caps?.supportsDMs ?? true);
  // A media value the user can't see is a media value they can't correct:
  // when capabilities hide the DM fields but a (possibly invalid) media URL
  // is already in state — which still gates Continue — its field stays
  // visible so the error can actually be fixed or the value cleared.
  const showMediaField = showDM || (wantsDM && state.mediaUrl.trim() !== '');

  const linkInvalid = !isUsableHttpUrl(state.linkUrl);
  const mediaInvalid = !isUsableHttpUrl(state.mediaUrl);
  const linkUsable = !linkInvalid && state.linkUrl.trim() !== '';

  const [testOpen, setTestOpen] = useState(false);
  useEffect(() => {
    if (!testOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTestOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [testOpen]);

  // The tester needs enough to actually run: a trigger to match and reply
  // content to preview (instructions in AI mode; at least one message in
  // exact mode). Anything less would open a tester that can only dead-end.
  const hasReplyContent = state.aiEnabled
    ? state.aiInstructions.trim() !== ''
    : (showComment && state.commentReplyBody.trim() !== '') || (showDM && state.dmBody.trim() !== '');
  const canTest =
    backendConfigured && !!state.type && !!state.accountId &&
    state.triggerKeywords.length > 0 && hasReplyContent;
  const testHint = !backendConfigured
    ? "Populr isn't connected to a backend yet."
    : state.triggerKeywords.length === 0
      ? 'Add a trigger keyword first.'
      : !hasReplyContent
        ? (state.aiEnabled ? 'Write instructions for Populr first.' : 'Write a reply message first.')
        : undefined;

  const commentField = (
    <div>
      <label htmlFor="wizard-comment-reply" className="block text-[12px] font-semibold text-[#111111] mb-1">
        Public comment reply
      </label>
      <textarea
        id="wizard-comment-reply"
        value={state.commentReplyBody}
        onChange={e => update('commentReplyBody', e.target.value)}
        placeholder="Just sent you a DM! 📩"
        rows={2}
        className={`${FIELD_CLASS} resize-y`}
      />
      <p className="text-[11px] text-[#9B9B8F] mt-1">
        {state.aiEnabled
          ? 'Posted when the AI’s answer can’t go public: links never appear in comments, so a link-carrying reply posts this and delivers the link in the DM.'
          : 'Posted publicly under the trigger comment. Left empty, Populr posts the placeholder above.'}
      </p>
    </div>
  );

  const dmField = (
    <div>
      <label htmlFor="wizard-dm-body" className="block text-[12px] font-semibold text-[#111111] mb-1">
        DM message
      </label>
      <textarea
        id="wizard-dm-body"
        value={state.dmBody}
        onChange={e => update('dmBody', e.target.value)}
        placeholder={'Hey {{name}}! Here’s what you asked for: {{link}}'}
        rows={4}
        className={`${FIELD_CLASS} resize-y`}
      />
      <p className="text-[11px] text-[#9B9B8F] mt-1">
        {state.aiEnabled
          ? 'Sent as written when the AI can’t confidently answer from your instructions.'
          : <>Sent privately. <code className="font-geist-mono">{'{{name}}'}</code> becomes the person&apos;s name
              and <code className="font-geist-mono">{'{{link}}'}</code> becomes your tracked link.</>}
      </p>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-[520px] mx-auto space-y-6">
        <div>
          <h2 className="font-geist font-bold text-base text-[#111111] mb-1">Trigger keywords</h2>
          <p className="text-[12px] text-[#6B6B6B] mb-2">What should someone say to trigger this automation?</p>
          <KeywordInput keywords={state.triggerKeywords} onChange={keywords => update('triggerKeywords', keywords)} />
        </div>

        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <h2 className="font-geist font-bold text-base text-[#111111]">Reply content</h2>
            <button
              type="button"
              onClick={() => setTestOpen(true)}
              disabled={!canTest}
              title={testHint}
              className="pop-btn-secondary text-[12px] py-1.5 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <MessageCircle size={13} /> Test reply
            </button>
          </div>

          <div
            role="radiogroup"
            aria-label="How Populr writes replies"
            className="inline-flex rounded-full bg-[#FAFAF8] border border-[#E8E4DF] p-0.5 mb-4"
          >
            {([
              { ai: false, label: 'Exact message' },
              { ai: true, label: 'AI-generated reply' },
            ] as const).map(opt => (
              <button
                key={opt.label}
                type="button"
                role="radio"
                aria-checked={state.aiEnabled === opt.ai}
                onClick={() => update('aiEnabled', opt.ai)}
                className={`rounded-full px-3.5 py-1.5 text-[12px] transition-all ${
                  state.aiEnabled === opt.ai
                    ? 'bg-white shadow-sm font-semibold text-[#111111]'
                    : 'text-[#6B6B6B]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {!showComment && !showDM ? (
            <p className="text-[12px] text-[#9B9B8F]">
              {platform.charAt(0).toUpperCase() + platform.slice(1)} doesn&apos;t support the replies this
              automation type sends right now.
            </p>
          ) : (
            <div className="space-y-4">
              {state.aiEnabled ? (
                <Disclosure
                  title="Fallback messages"
                  hint="sent when the AI can't answer itself"
                  defaultOpen={
                    (showComment && state.commentReplyBody.trim() !== '') ||
                    (showDM && state.dmBody.trim() !== '')
                  }
                >
                  {showComment && commentField}
                  {showDM && dmField}
                </Disclosure>
              ) : (
                <>
                  {showComment && commentField}
                  {showDM && dmField}
                </>
              )}
            </div>
          )}
        </div>

        {state.aiEnabled && (
          <AIInstructionField
            value={state.aiInstructions}
            onChange={value => update('aiInstructions', value)}
          />
        )}

        <Disclosure
          title="Add media or link"
          hint="optional"
          defaultOpen={!!(state.mediaUrl.trim() || state.linkUrl.trim() || state.buttonLabel.trim())}
        >
          {showMediaField && (
            <div>
              <label htmlFor="wizard-media-url" className="block text-[12px] font-semibold text-[#111111] mb-1">
                Media in the DM
              </label>
              <input
                id="wizard-media-url"
                type="url"
                value={state.mediaUrl}
                onChange={e => update('mediaUrl', e.target.value)}
                placeholder="https://your-site.com/photo.jpg or …/clip.mp4"
                aria-invalid={mediaInvalid}
                className={`${FIELD_CLASS} ${mediaInvalid ? 'border-[#DC2626]' : ''}`}
              />
              {mediaInvalid ? (
                <p className="text-[11px] text-[#DC2626] mt-1">{URL_ERROR}</p>
              ) : (
                <p className="text-[11px] text-[#9B9B8F] mt-1">
                  An image or video sent inside the DM (hosted URL). Platforms that don&apos;t
                  support it get the text on its own.
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="wizard-link-url" className="block text-[12px] font-semibold text-[#111111] mb-1">
              Link to send
            </label>
            <input
              id="wizard-link-url"
              type="url"
              value={state.linkUrl}
              onChange={e => update('linkUrl', e.target.value)}
              placeholder="https://your-site.com/guide"
              aria-invalid={linkInvalid}
              className={`${FIELD_CLASS} ${linkInvalid ? 'border-[#DC2626]' : ''}`}
            />
            {linkInvalid ? (
              <p className="text-[11px] text-[#DC2626] mt-1">{URL_ERROR}</p>
            ) : (
              <p className="text-[11px] text-[#9B9B8F] mt-1">
                Populr wraps this in a tracked link, so clicks show up in your stats and lead scoring.
              </p>
            )}
          </div>

          {showDM && linkUsable && (
            <div>
              <label htmlFor="wizard-button-label" className="block text-[12px] font-semibold text-[#111111] mb-1">
                Send it as a button
              </label>
              <input
                id="wizard-button-label"
                type="text"
                value={state.buttonLabel}
                onChange={e => update('buttonLabel', e.target.value.slice(0, 40))}
                placeholder="Get the guide"
                className={FIELD_CLASS}
              />
              <p className="text-[11px] text-[#9B9B8F] mt-1">
                Adds a tappable button to the DM that opens your tracked link — usually outperforms a pasted URL.
              </p>
            </div>
          )}
        </Disclosure>
      </div>

      {testOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setTestOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Test reply"
            className="w-full max-w-[380px] h-full shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <AutomationTestChat wizard={wizard} onClose={() => setTestOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

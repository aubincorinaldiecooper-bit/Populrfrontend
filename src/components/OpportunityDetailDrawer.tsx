import { useRef, useEffect, useState } from 'react';
import { X, ExternalLink, Copy, Check, Send, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import gsap from 'gsap';
import PlatformDot from './PlatformDot';
import { sendOpportunityReply } from '../lib/api';
import type { Opportunity, OpportunityStatus } from '../lib/api';

const INTERACTION_LABEL: Record<Opportunity['interaction']['type'], string> = {
  comment: 'Comment',
  message: 'Direct message',
  reply: 'Reply',
  mention: 'Mention',
  other: 'Interaction',
};

const STATUS_LABEL: Record<OpportunityStatus, string> = {
  new: 'New',
  reviewed: 'Reviewed',
  responded: 'Responded',
  dismissed: 'Dismissed',
};

const STATUS_STYLE: Record<OpportunityStatus, string> = {
  new: 'bg-[rgba(200,255,61,0.15)] text-[#5C6B00]',
  reviewed: 'bg-[#EFF6FF] text-[#3B82F6]',
  responded: 'bg-[#E0F5E9] text-[#059669]',
  dismissed: 'bg-[#F3F4F6] text-[#6B7280]',
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function OpportunityDetailDrawer({
  opportunity,
  onClose,
  onStatusChange,
  onReplySent,
}: {
  opportunity: Opportunity;
  onClose: () => void;
  onStatusChange: (status: 'reviewed' | 'responded' | 'dismissed') => Promise<void>;
  onReplySent: (result: { sentText: string; channel: string }) => void;
}) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const [replyDraft, setReplyDraft] = useState(opportunity.suggestedResponse ?? '');
  const [showComposer, setShowComposer] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusPending, setStatusPending] = useState<OpportunityStatus | null>(null);

  // GSAP drives these tweens outside CSS, so the global
  // prefers-reduced-motion override can't reach them — honored explicitly.
  const reduceMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (drawerRef.current && backdropRef.current) {
      gsap.to(backdropRef.current, { opacity: 1, duration: reduceMotion ? 0 : 0.25 });
      gsap.to(drawerRef.current, { x: '0%', duration: reduceMotion ? 0 : 0.35, ease: 'power3.out' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    if (drawerRef.current) gsap.to(drawerRef.current, { x: '100%', duration: reduceMotion ? 0 : 0.25, ease: 'power3.in' });
    if (backdropRef.current) gsap.to(backdropRef.current, { opacity: 0, duration: reduceMotion ? 0 : 0.2, onComplete: onClose });
    else onClose();
  };

  // A modal surface closes on Escape — same standard the mobile nav drawer
  // follows.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canRespondInApp = opportunity.availableActions.includes('reply') || opportunity.availableActions.includes('message');
  const canOpenOnPlatform = opportunity.availableActions.includes('open_on_platform');
  const canCopyResponse = opportunity.availableActions.includes('copy_response');
  const openUrl = opportunity.interaction.externalUrl ?? opportunity.source?.externalUrl ?? null;

  async function handleStatus(status: 'reviewed' | 'responded' | 'dismissed') {
    setStatusPending(status);
    try {
      await onStatusChange(status);
    } finally {
      setStatusPending(null);
    }
  }

  async function handleConfirmSend() {
    setSending(true);
    setSendError(null);
    try {
      const result = await sendOpportunityReply(opportunity.id, replyDraft.trim());
      onReplySent(result);
      setConfirming(false);
      setShowComposer(false);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send this reply.');
    } finally {
      setSending(false);
    }
  }

  async function handleCopy() {
    if (!opportunity.suggestedResponse) return;
    try {
      await navigator.clipboard.writeText(opportunity.suggestedResponse);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser — not worth a hard error.
    }
  }

  return (
    <>
      <div ref={backdropRef} onClick={handleClose} className="fixed inset-0 bg-[rgba(17,17,17,0.3)] z-[60] opacity-0" />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Opportunity details"
        className="fixed right-0 top-0 h-screen w-[520px] max-w-full bg-white z-[70] shadow-drawer flex flex-col overflow-hidden"
        style={{ transform: 'translateX(100%)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E4DF] flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {opportunity.person.avatarUrl ? (
              <img src={opportunity.person.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-[#FAFAF8] flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#111111] truncate">
                {opportunity.person.displayName || opportunity.person.username || 'Unknown person'}
              </p>
              <div className="flex items-center gap-1.5">
                <PlatformDot platform={opportunity.platform} size={7} />
                <p className="text-[11px] text-[#6B6B6B]">
                  {opportunity.person.username ? `@${opportunity.person.username}` : opportunity.platform}
                </p>
              </div>
            </div>
          </div>
          <button onClick={handleClose} aria-label="Close" className="w-9 h-9 rounded-full flex items-center justify-center text-[#6B6B6B] hover:bg-[#FAFAF8] transition-colors flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Status + intent */}
          <div className="px-6 py-5 border-b border-[#E8E4DF] space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium ${STATUS_STYLE[opportunity.status]}`}>
                {STATUS_LABEL[opportunity.status]}
              </span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#FAFAF8] text-[#111111]">
                {opportunity.intent.label}
              </span>
              {opportunity.intent.confidence !== null && (
                <span className="text-[11px] text-[#9B9B8F]">
                  {Math.round(opportunity.intent.confidence * 100)}% confidence
                </span>
              )}
            </div>
            <p className="text-[13px] text-[#111111] leading-relaxed">{opportunity.intent.reason}</p>
          </div>

          {/* What did they say */}
          <div className="px-6 py-5 border-b border-[#E8E4DF]">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#9B9B8F] mb-3">
              {INTERACTION_LABEL[opportunity.interaction.type]}
            </h2>
            <div className="bg-[#FAFAF8] rounded-xl p-4">
              <p className="text-[14px] text-[#111111] leading-relaxed whitespace-pre-wrap">{opportunity.interaction.text}</p>
              <p className="text-[11px] text-[#9B9B8F] mt-3">{formatTimestamp(opportunity.interaction.occurredAt)}</p>
            </div>
          </div>

          {/* Source content */}
          {opportunity.source && (
            <div className="px-6 py-5 border-b border-[#E8E4DF]">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#9B9B8F] mb-3">Where this came from</h2>
              <div className="flex gap-3">
                {opportunity.source.mediaUrl && (
                  <img src={opportunity.source.mediaUrl} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  {opportunity.source.caption && (
                    <p className="text-[13px] text-[#111111] line-clamp-2">{opportunity.source.caption}</p>
                  )}
                  {opportunity.source.externalUrl && (
                    <a
                      href={opportunity.source.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-[#3B82F6] mt-1.5 hover:underline"
                    >
                      View on {opportunity.platform} <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Suggested response */}
          {opportunity.suggestedResponse && (
            <div className="px-6 py-5 border-b border-[#E8E4DF]">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#9B9B8F]">Suggested response</h2>
                {canCopyResponse && (
                  <button onClick={handleCopy} className="pop-btn-ghost text-[12px] py-1 px-2.5">
                    {copied ? <><Check size={13} />Copied</> : <><Copy size={13} />Copy</>}
                  </button>
                )}
              </div>
              <p className="text-[13px] text-[#111111] leading-relaxed bg-[#FAFAF8] rounded-xl p-4">{opportunity.suggestedResponse}</p>
            </div>
          )}

          {/* Reply composer */}
          <div className="px-6 py-5 border-b border-[#E8E4DF]">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#9B9B8F] mb-3">Respond</h2>

            {!canRespondInApp && (
              <div className="bg-[#FFF3E0] rounded-xl p-4 mb-3 flex items-start gap-2.5">
                <AlertCircle size={15} className="text-[#D97706] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-semibold text-[#111111]">Can&apos;t send a reply here yet</p>
                  <p className="text-[12px] text-[#6B6B6B] mt-0.5 leading-relaxed">
                    Populr can&apos;t send a reply on {opportunity.platform} for this interaction yet.
                    {canOpenOnPlatform ? ' Open it on the platform to respond directly, or copy the suggested response above.' : ' Mark this reviewed once you\u2019ve followed up manually.'}
                  </p>
                </div>
              </div>
            )}

            {canRespondInApp && !showComposer && (
              <button onClick={() => setShowComposer(true)} className="pop-btn-primary w-full justify-center">
                <Send size={14} />Write a reply
              </button>
            )}

            {canRespondInApp && showComposer && !confirming && (
              <div className="space-y-3">
                <textarea
                  value={replyDraft}
                  onChange={e => setReplyDraft(e.target.value)}
                  rows={4}
                  placeholder="Write your reply..."
                  aria-label="Reply"
                  className="w-full bg-white border border-[#E8E4DF] rounded-xl px-3.5 py-2.5 text-[13px] placeholder:text-[#9B9B8F] outline-none focus-visible:ring-2 focus-visible:ring-chartreuse/40 resize-y"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirming(true)}
                    disabled={!replyDraft.trim()}
                    className="pop-btn-primary flex-1 justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Review &amp; send
                  </button>
                  <button onClick={() => setShowComposer(false)} className="pop-btn-ghost">Cancel</button>
                </div>
              </div>
            )}

            {confirming && (
              <div className="space-y-3">
                <div className="bg-[#FAFAF8] rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-[12px]">
                    <span className="text-[#9B9B8F]">To</span>
                    <span className="text-[#111111] font-medium">
                      {opportunity.person.username ? `@${opportunity.person.username}` : opportunity.person.displayName ?? 'this person'}
                    </span>
                  </div>
                  <div className="flex justify-between text-[12px]">
                    <span className="text-[#9B9B8F]">Platform</span>
                    <span className="text-[#111111] font-medium capitalize">{opportunity.platform}</span>
                  </div>
                  <div className="pt-2 border-t border-[#E8E4DF]">
                    <p className="text-[12px] text-[#9B9B8F] mb-1">Message</p>
                    <p className="text-[13px] text-[#111111] whitespace-pre-wrap">{replyDraft}</p>
                  </div>
                </div>
                {sendError && <p className="text-[12px] text-[#DC2626]">{sendError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={handleConfirmSend}
                    disabled={sending}
                    className="pop-btn-primary flex-1 justify-center disabled:opacity-50"
                  >
                    {sending ? <><Loader2 size={14} className="animate-spin" />Sending…</> : <><Send size={14} />Confirm &amp; send</>}
                  </button>
                  <button onClick={() => setConfirming(false)} disabled={sending} className="pop-btn-ghost disabled:opacity-50">
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Fallback / secondary actions */}
          <div className="px-6 py-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#9B9B8F] mb-3">Other actions</h2>
            <div className="flex flex-wrap gap-2">
              {canOpenOnPlatform && openUrl && (
                <a href={openUrl} target="_blank" rel="noreferrer" className="pop-btn-tertiary text-[12px] py-1.5 px-3 inline-flex items-center gap-1.5">
                  <ExternalLink size={13} />Open on platform
                </a>
              )}
              <button
                onClick={() => handleStatus('reviewed')}
                disabled={statusPending !== null || opportunity.status === 'reviewed'}
                className="pop-btn-tertiary text-[12px] py-1.5 px-3 disabled:opacity-40"
              >
                {statusPending === 'reviewed' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Mark reviewed
              </button>
              <button
                onClick={() => handleStatus('responded')}
                disabled={statusPending !== null || opportunity.status === 'responded'}
                className="pop-btn-tertiary text-[12px] py-1.5 px-3 disabled:opacity-40"
              >
                {statusPending === 'responded' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Mark responded
              </button>
              <button
                onClick={() => handleStatus('dismissed')}
                disabled={statusPending !== null || opportunity.status === 'dismissed'}
                className="pop-btn-ghost text-[12px] py-1.5 px-3 disabled:opacity-40"
              >
                {statusPending === 'dismissed' ? <Loader2 size={13} className="animate-spin" /> : <EyeOff size={13} />}Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, ExternalLink, Copy, Check, Send, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
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

const STATUS_META: Record<OpportunityStatus, { label: string; chip: string }> = {
  new: { label: 'New', chip: 'bg-secondary-container text-on-secondary-container' },
  reviewed: { label: 'Reviewed', chip: 'bg-[#e8f0fe] text-[#1a56db]' },
  responded: { label: 'Responded', chip: 'bg-[#e3f6ec] text-[#046c4e]' },
  dismissed: { label: 'Dismissed', chip: 'bg-surface-container-high text-on-surface-variant' },
};

const card = 'bg-surface-container-lowest border border-outline-variant rounded-xl';
const inputBase =
  'w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-3 ' +
  'text-body-md text-on-surface placeholder:text-on-surface-variant/60 outline-none transition-colors';
const primaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-full bg-primary text-on-primary px-4 py-2.5 text-body-md font-semibold hover:opacity-90 transition-opacity disabled:opacity-50';
const secondaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-full border border-outline-variant text-primary px-4 py-2 text-body-md font-medium hover:bg-surface-container-high transition-colors disabled:opacity-50';
const ghostBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-body-md font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-50';

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="font-label text-label-sm uppercase text-on-surface-variant mb-3">{children}</h2>;
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
  const [replyDraft, setReplyDraft] = useState(opportunity.suggestedResponse ?? '');
  const [showComposer, setShowComposer] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusPending, setStatusPending] = useState<OpportunityStatus | null>(null);

  const canRespondInApp = opportunity.availableActions.includes('reply') || opportunity.availableActions.includes('message');
  const canOpenOnPlatform = opportunity.availableActions.includes('open_on_platform');
  const canCopyResponse = opportunity.availableActions.includes('copy_response');
  const openUrl = opportunity.interaction.externalUrl ?? opportunity.source?.externalUrl ?? null;
  const status = STATUS_META[opportunity.status];

  async function handleStatus(next: 'reviewed' | 'responded' | 'dismissed') {
    setStatusPending(next);
    try {
      await onStatusChange(next);
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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/30 z-[60]"
      />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.32, ease: [0.24, 1, 0.4, 1] }}
        className="fixed right-0 top-0 h-screen w-[520px] max-w-full bg-surface-container-lowest border-l border-outline-variant z-[70] shadow-drawer flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-variant flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {opportunity.person.avatarUrl ? (
              <img src={opportunity.person.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-surface-container-high flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-body-md font-semibold text-on-surface truncate">
                {opportunity.person.displayName || opportunity.person.username || 'Unknown person'}
              </p>
              <div className="flex items-center gap-1.5">
                <PlatformDot platform={opportunity.platform} size={7} />
                <p className="font-label text-label-sm text-on-surface-variant">
                  {opportunity.person.username ? `@${opportunity.person.username}` : opportunity.platform}
                </p>
              </div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Status + intent */}
          <div className="px-6 py-5 border-b border-surface-variant space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full font-label text-label-sm uppercase ${status.chip}`}>
                {status.label}
              </span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full font-label text-label-sm uppercase bg-surface-container-high text-on-surface">
                {opportunity.intent.label}
              </span>
              {opportunity.intent.confidence !== null && (
                <span className="font-label text-label-sm text-on-surface-variant">
                  {Math.round(opportunity.intent.confidence * 100)}% confidence
                </span>
              )}
            </div>
            {opportunity.intent.confidence !== null && (
              <div className="h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(opportunity.intent.confidence * 100)}%` }} />
              </div>
            )}
            <p className="text-body-md text-on-surface leading-relaxed">{opportunity.intent.reason}</p>
          </div>

          {/* What did they say */}
          <div className="px-6 py-5 border-b border-surface-variant">
            <SectionLabel>{INTERACTION_LABEL[opportunity.interaction.type]}</SectionLabel>
            <div className="bg-surface-container-low rounded-xl p-4">
              <p className="text-body-md text-on-surface leading-relaxed whitespace-pre-wrap">{opportunity.interaction.text}</p>
              <p className="font-label text-label-sm text-on-surface-variant mt-3">{formatTimestamp(opportunity.interaction.occurredAt)}</p>
            </div>
          </div>

          {/* Source content */}
          {opportunity.source && (
            <div className="px-6 py-5 border-b border-surface-variant">
              <SectionLabel>Where this came from</SectionLabel>
              <div className="flex gap-3">
                {opportunity.source.mediaUrl && (
                  <img src={opportunity.source.mediaUrl} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  {opportunity.source.caption && (
                    <p className="text-body-md text-on-surface line-clamp-2">{opportunity.source.caption}</p>
                  )}
                  {opportunity.source.externalUrl && (
                    <a
                      href={opportunity.source.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[13px] font-medium text-primary mt-1.5 hover:underline"
                    >
                      View on <span className="capitalize">{opportunity.platform}</span> <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Suggested response */}
          {opportunity.suggestedResponse && (
            <div className="px-6 py-5 border-b border-surface-variant">
              <div className="flex items-center justify-between mb-3">
                <SectionLabel>Suggested response</SectionLabel>
                {canCopyResponse && (
                  <button onClick={handleCopy} className={`${ghostBtn} -mt-2`}>
                    {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
              <p className="text-body-md text-on-surface leading-relaxed bg-surface-container-low rounded-xl p-4">{opportunity.suggestedResponse}</p>
            </div>
          )}

          {/* Reply composer */}
          <div className="px-6 py-5 border-b border-surface-variant">
            <SectionLabel>Respond</SectionLabel>

            {!canRespondInApp && (
              <div className={`${card} p-4 mb-3 flex items-start gap-2.5`}>
                <AlertCircle size={16} className="text-on-surface-variant flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-body-md font-semibold text-on-surface">Can’t send a reply here yet</p>
                  <p className="text-[13px] text-on-surface-variant mt-0.5">
                    Populr can’t send a reply on <span className="capitalize">{opportunity.platform}</span> for this interaction yet.
                    {canOpenOnPlatform ? ' Open it on the platform to respond directly, or copy the suggested response above.' : ' Mark this reviewed once you’ve followed up manually.'}
                  </p>
                </div>
              </div>
            )}

            {canRespondInApp && !showComposer && (
              <button onClick={() => setShowComposer(true)} className={`${primaryBtn} w-full`}>
                <Send size={14} /> Write a reply
              </button>
            )}

            {canRespondInApp && showComposer && !confirming && (
              <div className="space-y-3">
                <textarea
                  className={`${inputBase} min-h-[104px] resize-y`}
                  value={replyDraft}
                  onChange={e => setReplyDraft(e.target.value)}
                  rows={4}
                  placeholder="Write your reply…"
                />
                <div className="flex gap-2">
                  <button disabled={!replyDraft.trim()} onClick={() => setConfirming(true)} className={`${primaryBtn} flex-1`}>
                    Review &amp; send
                  </button>
                  <button onClick={() => setShowComposer(false)} className={ghostBtn}>Cancel</button>
                </div>
              </div>
            )}

            {confirming && (
              <div className="space-y-3">
                <div className="bg-surface-container-low rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-on-surface-variant">To</span>
                    <span className="text-on-surface font-medium">
                      {opportunity.person.username ? `@${opportunity.person.username}` : opportunity.person.displayName ?? 'this person'}
                    </span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-on-surface-variant">Platform</span>
                    <span className="text-on-surface font-medium capitalize">{opportunity.platform}</span>
                  </div>
                  <div className="pt-2 border-t border-surface-variant">
                    <p className="text-[13px] text-on-surface-variant mb-1">Message</p>
                    <p className="text-body-md text-on-surface whitespace-pre-wrap">{replyDraft}</p>
                  </div>
                </div>
                {sendError && <p className="text-[13px] text-error">{sendError}</p>}
                <div className="flex gap-2">
                  <button disabled={sending} onClick={handleConfirmSend} className={`${primaryBtn} flex-1`}>
                    {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {sending ? 'Sending…' : 'Confirm & send'}
                  </button>
                  <button disabled={sending} onClick={() => setConfirming(false)} className={ghostBtn}>Back</button>
                </div>
              </div>
            )}
          </div>

          {/* Fallback / secondary actions */}
          <div className="px-6 py-5">
            <SectionLabel>Other actions</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {canOpenOnPlatform && openUrl && (
                <a href={openUrl} target="_blank" rel="noreferrer" className={secondaryBtn}>
                  <ExternalLink size={13} /> Open on platform
                </a>
              )}
              <button
                disabled={statusPending !== null || opportunity.status === 'reviewed'}
                onClick={() => handleStatus('reviewed')}
                className={secondaryBtn}
              >
                {statusPending === 'reviewed' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Mark reviewed
              </button>
              <button
                disabled={statusPending !== null || opportunity.status === 'responded'}
                onClick={() => handleStatus('responded')}
                className={secondaryBtn}
              >
                {statusPending === 'responded' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Mark responded
              </button>
              <button
                disabled={statusPending !== null || opportunity.status === 'dismissed'}
                onClick={() => handleStatus('dismissed')}
                className={ghostBtn}
              >
                {statusPending === 'dismissed' ? <Loader2 size={13} className="animate-spin" /> : <EyeOff size={13} />} Dismiss
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

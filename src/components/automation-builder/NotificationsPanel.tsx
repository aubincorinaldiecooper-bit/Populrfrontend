import { useEffect, useRef } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import { shortAgo, type BuilderNotification } from '../../lib/builderNotifications';

/**
 * The notification feed.
 *
 * An index into the automation, not a report about it. Every row is a way in:
 * tapping one takes the creator to the step it belongs to and opens the
 * question there, which is the only place it can actually be answered.
 *
 * Deliberately not a checklist. The same information as a list of validation
 * failures reads as homework; as a short feed of things Populr is asking, it
 * reads as the product talking to them. Nothing here changes whether the
 * automation may go live — that stays with the server.
 */

export interface NotificationsPanelProps {
  notifications: BuilderNotification[];
  /** Re-checking with the server after an edit. */
  checking: boolean;
  /** The item a refused activation wants the creator to look at. */
  highlightId: string | null;
  onSelect: (notification: BuilderNotification) => void;
  onClose: () => void;
}

export default function NotificationsPanel({
  notifications, checking, highlightId, onSelect, onClose,
}: NotificationsPanelProps) {
  const highlightRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (highlightId) highlightRef.current?.scrollIntoView({ block: 'nearest' });
  }, [highlightId]);

  // The entrance belongs to the contextual region, not to each panel inside
  // it: animating both plays the slide twice, and this panel's own copy was
  // never motion-safe guarded.
  return (
    <aside
      className="flex h-full w-full flex-col bg-white"
      aria-label="Automation checks"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#F0EDE8]">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-[#111111]">Checks</h2>
          {checking && <Loader2 size={13} className="animate-spin text-[#B0AAA2]" />}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 -mr-1.5 rounded-lg text-[#6B6B6B] hover:bg-[#F7F5F2] hover:text-[#111111]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C5FF3D]"
          aria-label="Close checks"
        >
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto py-1.5">
        {notifications.length === 0 && !checking && (
          <p className="px-4 py-6 text-[13px] text-[#8A857E]">You're all caught up.</p>
        )}

        {notifications.map(notification => {
          const highlighted = notification.id === highlightId;
          const resolved = notification.kind === 'resolved';
          return (
            <button
              key={notification.id}
              ref={highlighted ? highlightRef : undefined}
              type="button"
              onClick={() => onSelect(notification)}
              className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors
                hover:bg-[#FAF9F7] focus-visible:outline-none focus-visible:bg-[#FAF9F7]
                ${highlighted ? 'bg-[#F9FFE9]' : ''}`}
            >
              <span className="mt-[5px] shrink-0" aria-hidden="true">
                {resolved ? (
                  <Check size={13} className="text-[#4D7C0F]" />
                ) : (
                  <span
                    className={`block w-[7px] h-[7px] rounded-full
                      ${notification.kind === 'warning' ? 'bg-[#E0A33E]' : 'bg-[#C5FF3D] ring-1 ring-[#A9DF2A]'}`}
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-[13px] leading-snug
                    ${resolved ? 'text-[#8A857E]' : 'text-[#111111]'}`}
                >
                  {notification.title}
                </span>
                <span className="mt-0.5 block text-[11px] text-[#B0AAA2]">
                  {[notification.stepLabel, shortAgo(notification.createdAt)].filter(Boolean).join(' · ')}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="px-4 py-2.5 border-t border-[#F0EDE8] text-[11px] leading-snug text-[#8A857E]">
        Populr asks here when it needs something. Tap one to answer it on the step.
      </p>
    </aside>
  );
}

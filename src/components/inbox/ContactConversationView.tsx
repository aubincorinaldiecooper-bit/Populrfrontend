import { useState } from 'react';
import ConversationThread from './ConversationThread';
import ContactPanel from './ContactPanel';
import type { ContactDetail } from '../../lib/api';

/**
 * THE canonical way to look at a person: their conversation, with who they
 * are one click away.
 *
 * Contacts and Inbox both end here. Before this existed each surface kept its
 * own arrangement of the same parts — Inbox composed the thread and panel
 * inline, Contacts opened a CRM-first profile with a Message button that led
 * back to Inbox, and the same human had two representations that could
 * drift. Now there is one: header, messages, composer, and a context panel
 * that is closed until asked for.
 *
 * Deliberately presentational. The two callers load the detail differently
 * (Inbox owns a list beside it; Contacts fetches one person), but what they
 * show must not differ, so everything visual and interactive lives here and
 * the data comes in as props. Sending stays wherever the caller's send path
 * already is — this component never grows a second one.
 *
 * The context panel: a real column at lg (the conversation reflows), an
 * overlay below it (a 280px column beside a conversation on a tablet is two
 * unusable things instead of one usable one). Open state lives HERE and dies
 * with the component — key this view by contact id, and looking at a new
 * person always starts at the conversation, context closed, the same way
 * everywhere.
 */

export interface ContactConversationViewProps {
  detail: ContactDetail;
  loading: boolean;
  sending: boolean;
  /** The inbox item a reply goes through; null = nothing to reply to yet. */
  replyTarget: string | null;
  onSend: (text: string) => Promise<boolean>;
  /** Panel edits merge into the owner's current detail — an updater, never a
   *  snapshot, so overlapping edits cannot revert each other. */
  onDetailChanged?: (update: (current: ContactDetail) => ContactDetail) => void;
}

export default function ContactConversationView({
  detail, loading, sending, replyTarget, onSend, onDetailChanged,
}: ContactConversationViewProps) {
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <div className="flex-1 min-h-0 flex">
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <ConversationThread
          detail={detail}
          loading={loading}
          sending={sending}
          contactOpen={contactOpen}
          onOpenContact={() => setContactOpen(v => !v)}
          onSend={onSend}
          replyTarget={replyTarget}
        />
      </div>

      {contactOpen && (
        <>
          {/* Wide: a third pane. Narrow: an overlay. One panel either way —
              two copies would put the same person in the accessibility tree
              twice, with two of every control inside. */}
          <div
            aria-hidden="true"
            onClick={() => setContactOpen(false)}
            className="lg:hidden fixed inset-0 z-[60] bg-[#111111]/10"
          />
          <div className="fixed inset-y-0 right-0 z-[70] w-full max-w-[340px] bg-white
            shadow-[0_0_40px_rgba(17,17,17,0.12)]
            motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-200
            lg:static lg:z-auto lg:w-[280px] lg:max-w-none lg:shrink-0 lg:min-h-0
            lg:border-l lg:border-[#EFECE6] lg:shadow-none lg:animate-none">
            <ContactPanel
              detail={detail}
              onClose={() => setContactOpen(false)}
              onDetailChanged={onDetailChanged}
            />
          </div>
        </>
      )}
    </div>
  );
}

import { Link } from 'react-router';
import { X, ArrowUpRight, Zap } from 'lucide-react';
import Avatar from './Avatar';
import { platformMeta } from '../../lib/platformMeta';
import { timeAgo } from '../../lib/timeAgo';
import { externalProfile } from '../../lib/profileUrl';
import type { ContactDetail } from '../../lib/api';

/**
 * Who this person is — on demand, never permanently.
 *
 * The conversation is the primary experience, so this is a third pane that
 * appears when the creator asks for it and closes as easily. A contact
 * sidebar that is always there turns a messaging product into a CRM with
 * messaging bolted on, which is the thing this pass exists to undo.
 *
 * What it shows is what a creator immediately understands: how they were
 * acquired, which audiences they are in, how long the conversation is, when
 * they were last around, what has happened. Lead score, stage and tags are
 * deliberately absent — they are real fields with a real home on the Contact
 * page, and leading with them here would answer a question nobody asked while
 * looking at a chat.
 *
 * No new contact record and no second profile route: everything here comes
 * from GET /api/contacts/:id, and "View full profile" opens that same contact.
 */

export interface ContactPanelProps {
  detail: ContactDetail;
  onClose: () => void;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-t border-[#F4F1EC]">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#9B9B8F]">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export default function ContactPanel({ detail, onClose }: ContactPanelProps) {
  const contact = detail.contact;
  const display = contact.name?.trim() || `@${contact.handle ?? 'someone'}`;
  const external = externalProfile(contact.platform, contact.handle);

  // Oldest first from the API, so the first membership is the acquisition.
  const from = detail.automations[0] ?? null;
  const activity = detail.events.slice(0, 6);

  return (
    <aside
      aria-label={`About ${display}`}
      className="flex flex-col h-full min-h-0 bg-white overflow-y-auto"
    >
      <div className="shrink-0 flex items-start justify-between gap-2 px-4 pt-4 pb-3">
        <div className="min-w-0 flex flex-col items-start gap-2">
          <Avatar
            handle={contact.handle} name={contact.name} avatarUrl={contact.avatar_url}
            platform={contact.platform} size="lg" showPlatform
          />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-[#111111]">{display}</p>
            <p className="text-[12px] text-[#8A857E]">{platformMeta(contact.platform).name}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close contact"
          className="shrink-0 p-1.5 -mr-1 rounded-lg text-[#9B9B8F] hover:bg-[#FAF9F7]
            hover:text-[#111111] transition-colors focus-visible:outline-none
            focus-visible:ring-2 focus-visible:ring-chartreuse"
        >
          <X size={15} />
        </button>
      </div>

      {external && (
        <div className="px-4 pb-3">
          {/* Explicitly labelled and explicitly secondary. Clicking someone's
              avatar should open who they are in Populr, not leave the product. */}
          <a
            href={external.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#111111]
              rounded-lg border border-[#E8E4DF] px-2.5 py-1.5 hover:bg-[#FAF9F7]
              transition-colors focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-chartreuse"
          >
            {external.label}
            <ArrowUpRight size={13} className="text-[#8A857E]" />
          </a>
        </div>
      )}

      {from ? (
        <Section label="From">
          <Link
            to={`/automations/${from.id}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#111111]
              hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-chartreuse rounded"
          >
            <Zap size={13} className="text-[#8A857E]" />
            {from.name}
          </Link>
          <p className="mt-0.5 text-[11.5px] text-[#9B9B8F]">
            {new Date(from.firstEnteredAt).toLocaleDateString(undefined, {
              day: 'numeric', month: 'short',
            })}
          </p>
        </Section>
      ) : detail.sourceAutomation ? (
        // Captured before automations became flows. The name is still true.
        <Section label="From">
          <p className="text-[13px] font-medium text-[#111111]">{detail.sourceAutomation.name}</p>
        </Section>
      ) : null}

      {detail.automations.length > 0 && (
        <Section label={detail.automations.length === 1 ? 'Automation' : 'Automations'}>
          <ul className="space-y-1">
            {detail.automations.map(a => (
              <li key={a.id}>
                <Link
                  to={`/automations/${a.id}`}
                  className="text-[13px] text-[#111111] hover:underline underline-offset-2
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chartreuse rounded"
                >
                  {a.name}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section label="Conversation">
        <p className="text-[13px] text-[#111111]">
          {detail.messages.length} message{detail.messages.length === 1 ? '' : 's'}
        </p>
      </Section>

      {contact.last_seen && (
        <Section label="Last active">
          <p className="text-[13px] text-[#111111]">{timeAgo(contact.last_seen)}</p>
        </Section>
      )}

      {activity.length > 0 && (
        <Section label="Recent activity">
          <ul className="space-y-1.5">
            {activity.map(event => (
              <li key={event.id} className="text-[12px] leading-snug text-[#6B6B6B]">
                {event.detail || event.event_type}
                <span className="block text-[10.5px] text-[#B0AAA2]">
                  {timeAgo(event.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="mt-auto px-4 py-3 border-t border-[#F4F1EC]">
        <Link
          to={`/contacts?contact=${contact.id}`}
          className="text-[12.5px] font-medium text-[#111111] hover:underline underline-offset-2
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chartreuse rounded"
        >
          View full profile
        </Link>
      </div>
    </aside>
  );
}

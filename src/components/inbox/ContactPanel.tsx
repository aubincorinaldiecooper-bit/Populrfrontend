import { useState } from 'react';
import { Link } from 'react-router';
import { X, ArrowUpRight, Zap, Plus, Loader2 } from 'lucide-react';
import Avatar from './Avatar';
import { useApp } from '../../context/AppContext';
import { platformMeta } from '../../lib/platformMeta';
import { timeAgo } from '../../lib/timeAgo';
import { externalProfile } from '../../lib/profileUrl';
import { updateContact, updateContactTag } from '../../lib/api';
import type { ContactDetail, LeadStage } from '../../lib/api';

/**
 * Who this person is in relation to Populr — on demand, never permanently.
 *
 * The conversation is the primary experience; this panel is the SECOND half
 * of the same person, opened from the conversation's header and closed as
 * easily. It is also the only profile there is now: the standalone CRM-first
 * contact page is retired, and what was worth keeping from it — notes, the
 * relationship fields, how they arrived — lives here, beside the conversation
 * it describes, instead of a screen away from it.
 *
 * The hierarchy is deliberate. Identity, then how they arrived, then when
 * they were last around, then the creator's own notes. Stage and tags come
 * LAST — they are real fields and they stay editable, but leading with CRM
 * metadata would answer a question nobody asked while looking at a chat.
 *
 * What it deliberately does not say:
 * - how many messages the conversation has (it is open right beside this)
 * - an Automations block that only repeats From (one origin, said once)
 * - raw engine events ("no automation matched — queued...") — activity here
 *   is the relationship's story, told from data we actually hold, not the
 *   runtime's diary.
 */

export interface ContactPanelProps {
  detail: ContactDetail;
  onClose: () => void;
  /**
   * Panel edits (notes, stage, tags) flow back so the open detail stays true.
   *
   * An UPDATER over the owner's current state, not a snapshot. Two edits can
   * overlap — a slow note save and a quick stage change — and whichever
   * response lands last must merge its one field into whatever is current,
   * not reinstate the whole contact as it looked before the other edit.
   */
  onDetailChanged?: (update: (current: ContactDetail) => ContactDetail) => void;
}

/** The stages the backend actually accepts, in pipeline order — the same six
 *  the retired contact page offered. (`LeadStage` also carries a legacy
 *  'engaged' the API never issues; offering it would 400.) */
const STAGES: { value: LeadStage; label: string }[] = [
  { value: 'cold', label: 'New' },
  { value: 'interested', label: 'Engaged' },
  { value: 'warm', label: 'Warm' },
  { value: 'hot', label: 'Hot' },
  { value: 'needs_reply', label: 'Needs reply' },
  { value: 'converted', label: 'Converted' },
];

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-t border-[#F4F1EC]">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#9B9B8F]">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/** A date, the way the brief writes them: "Aug 13". */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function ContactPanel({ detail, onClose, onDetailChanged }: ContactPanelProps) {
  const { showToast } = useApp();
  const contact = detail.contact;
  const display = contact.name?.trim() || `@${contact.handle ?? 'someone'}`;
  const external = externalProfile(contact.platform, contact.handle);

  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [addingTag, setAddingTag] = useState(false);

  /**
   * Merge ONE field into whatever the owner currently holds.
   *
   * The identity guard matters as much as the merge: these land after an
   * await, and by then the open detail can belong to a different person. A
   * slow save for one contact must never write into another's panel.
   */
  const apply = (merge: (current: ContactDetail) => ContactDetail) =>
    onDetailChanged?.(current => (current.contact.id === contact.id ? merge(current) : current));

  const saveNotes = async () => {
    if (notesDraft === null) return;
    setSavingNotes(true);
    try {
      const updated = await updateContact(contact.id, { notes: notesDraft });
      apply(cur => ({ ...cur, contact: { ...cur.contact, notes: updated.notes } }));
      setNotesDraft(null);
      showToast('Note saved', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save the note.', 'error');
    } finally {
      setSavingNotes(false);
    }
  };

  const changeStage = async (stage: LeadStage) => {
    try {
      const updated = await updateContact(contact.id, { stage });
      apply(cur => ({ ...cur, contact: { ...cur.contact, stage: updated.stage } }));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update the stage.', 'error');
    }
  };

  const addTag = async () => {
    const tag = tagDraft.trim();
    if (!tag || addingTag) return;
    setAddingTag(true);
    try {
      const tags = await updateContactTag(contact.id, tag, false);
      apply(cur => ({ ...cur, contact: { ...cur.contact, tags } }));
      setTagDraft('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not add the tag.', 'error');
    } finally {
      setAddingTag(false);
    }
  };

  const removeTag = async (tag: string) => {
    try {
      const tags = await updateContactTag(contact.id, tag, true);
      apply(cur => ({ ...cur, contact: { ...cur.contact, tags } }));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not remove the tag.', 'error');
    }
  };

  // Oldest first from the API, so the first membership is the acquisition.
  const from = detail.automations[0] ?? null;
  // Everything past the acquisition. From already names the first automation,
  // and a block that repeats it would be the duplicated context this panel
  // exists to remove — so the section appears only when there is MORE to say.
  const laterAutomations = detail.automations.slice(1);

  /**
   * The relationship's story, from data we hold, oldest first.
   *
   * Not the events table: that is the engine's diary ("no automation matched —
   * queued for a personal reply"), written for debugging, and it reads that
   * way. What a creator wants here is what happened between them and this
   * person, and the fields we trust already say it: when they entered each
   * automation, and when the conversation began. Nothing is invented to pad
   * the list — a thin story is an honest one.
   */
  const firstMessageAt = detail.messages.length > 0
    ? detail.messages.reduce((min, m) => (m.created_at < min ? m.created_at : min), detail.messages[0].created_at)
    : null;
  const activity: { key: string; label: string; at: string }[] = [
    ...detail.automations.map(a => ({
      key: `auto-${a.id}`,
      label: `Entered through ${a.name}`,
      at: a.firstEnteredAt,
    })),
    ...(firstMessageAt
      ? [{ key: 'first-message', label: 'Started a conversation', at: firstMessageAt }]
      : []),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <aside
      aria-label={`About ${display}`}
      className="flex flex-col h-full min-h-0 bg-white overflow-y-auto"
    >
      {/* ---------------------------------------------------------- identity */}
      <div className="shrink-0 flex items-start justify-between gap-2 px-4 pt-4 pb-3">
        <div className="min-w-0 flex flex-col items-start gap-2">
          <Avatar
            handle={contact.handle} name={contact.name} avatarUrl={contact.avatar_url}
            platform={contact.platform} size="lg" showPlatform
          />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-[#111111]">{display}</p>
            {contact.name?.trim() && contact.handle && (
              <p className="truncate text-[12px] text-[#6B6B6B]">@{contact.handle}</p>
            )}
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

      {/* -------------------------------------------------- how they arrived */}
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
          <p className="mt-0.5 text-[11.5px] text-[#9B9B8F]">{shortDate(from.firstEnteredAt)}</p>
          {detail.sourcePost?.caption && <SourcePostLine caption={detail.sourcePost.caption} />}
        </Section>
      ) : detail.sourceAutomation ? (
        // Captured before automations became flows. The name is still true.
        <Section label="From">
          <p className="text-[13px] font-medium text-[#111111]">{detail.sourceAutomation.name}</p>
          {detail.sourcePost?.caption && <SourcePostLine caption={detail.sourcePost.caption} />}
        </Section>
      ) : detail.sourcePost?.caption ? (
        // No automation on record, but we do know WHICH post brought them in.
        // The retired profile said this; losing it here would erase the only
        // acquisition attribution these contacts have.
        <Section label="From">
          <p className="text-[13px] text-[#111111]">A post</p>
          <SourcePostLine caption={detail.sourcePost.caption} />
        </Section>
      ) : null}

      {laterAutomations.length > 0 && (
        <Section label="Also in">
          <ul className="space-y-1">
            {laterAutomations.map(a => (
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

      {contact.last_seen && (
        <Section label="Last active">
          <p className="text-[13px] text-[#111111]">{timeAgo(contact.last_seen)}</p>
        </Section>
      )}

      {/* -------------------------------------------------------------- notes */}
      <Section label="Notes">
        {notesDraft === null ? (
          contact.notes?.trim() ? (
            <button
              type="button"
              onClick={() => setNotesDraft(contact.notes ?? '')}
              className="w-full text-left text-[13px] leading-snug text-[#111111] whitespace-pre-wrap
                rounded-lg -mx-1 px-1 py-0.5 hover:bg-[#FAF9F7] transition-colors
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chartreuse"
              aria-label="Edit note"
            >
              {contact.notes}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setNotesDraft('')}
              className="inline-flex items-center gap-1 text-[12.5px] text-[#8A857E]
                hover:text-[#111111] transition-colors rounded px-1 -mx-1
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chartreuse"
            >
              <Plus size={12} /> Add note
            </button>
          )
        ) : (
          <div>
            <textarea
              value={notesDraft}
              onChange={e => setNotesDraft(e.target.value)}
              autoFocus
              rows={3}
              aria-label="Note"
              placeholder="Prefers weekend bookings…"
              className="w-full resize-none border border-[#E8E4DF] rounded-xl p-2.5 text-[13px]
                leading-snug placeholder:text-[#B0AAA2] focus:outline-none
                focus-visible:border-chartreuse focus:ring-2 focus:ring-chartreuse/20"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void saveNotes()}
                disabled={savingNotes}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#111111] px-2.5 py-1.5
                  text-[12px] font-medium text-white disabled:opacity-40
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chartreuse"
              >
                {savingNotes && <Loader2 size={11} className="animate-spin" />}
                Save note
              </button>
              <button
                type="button"
                onClick={() => setNotesDraft(null)}
                className="text-[12px] text-[#8A857E] hover:text-[#111111] rounded px-1
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chartreuse"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Section>

      {activity.length > 0 && (
        <Section label="Activity">
          <ul className="space-y-1.5">
            {activity.map(entry => (
              <li key={entry.key} className="text-[12.5px] leading-snug text-[#111111]">
                {entry.label}
                <span className="block text-[10.5px] text-[#9B9B8F]">{shortDate(entry.at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* -------------------------------------- relationship, deliberately last
          Real fields with real backends, kept editable — but they follow the
          human context rather than leading it. */}
      <Section label="Relationship">
        <select
          value={contact.stage}
          onChange={e => void changeStage(e.target.value as LeadStage)}
          aria-label="Stage"
          className="w-full border border-[#E8E4DF] rounded-lg px-2.5 py-1.5 text-[12px] bg-white
            text-[#111111] focus:outline-none focus-visible:border-chartreuse"
        >
          {STAGES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {contact.tags.map(tag => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 bg-[#FAFAF8] text-[#111111] text-[11px]
                font-medium px-2 py-1 rounded-full"
            >
              {tag}
              <button
                type="button"
                onClick={() => void removeTag(tag)}
                aria-label={`Remove tag ${tag}`}
                className="text-[#9B9B8F] hover:text-[#111111]"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <input
            type="text"
            value={tagDraft}
            onChange={e => setTagDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void addTag(); }}
            placeholder="Add tag…"
            aria-label="Add tag"
            className="flex-1 min-w-0 border border-[#E8E4DF] rounded-lg px-2.5 py-1.5 text-[12px]
              placeholder:text-[#B0AAA2] focus:outline-none focus-visible:border-chartreuse"
          />
          <button
            type="button"
            onClick={() => void addTag()}
            disabled={addingTag}
            aria-label="Add this tag"
            className="shrink-0 rounded-lg border border-[#E8E4DF] px-2 text-[#6B6B6B]
              hover:text-[#111111] hover:bg-[#FAF9F7] disabled:opacity-40
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chartreuse"
          >
            <Plus size={13} />
          </button>
        </div>
      </Section>
    </aside>
  );
}

/** The post that brought them in, quoted small under the From line. */
function SourcePostLine({ caption }: { caption: string }) {
  return (
    <p className="mt-1 text-[11.5px] leading-snug text-[#6B6B6B] line-clamp-2">
      “{caption}”
    </p>
  );
}

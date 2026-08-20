import { Card } from '@/components/ui/card';
import { Page } from '@/components/ui/page';
import { SearchInput } from '@/components/ui/search-input';
import { cn } from '@/lib/utils';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { useSearchParams } from 'react-router';
import {ArrowLeft, AlertCircle, X, Reply, Clock, Tag, Zap } from 'lucide-react';
import PlatformDot from '../components/PlatformDot';
import ProfileImage from '../components/ProfileImage';
import PageHeader from '../components/PageHeader';
import ContactConversationView from '../components/inbox/ContactConversationView';
import { useContactConversation } from '../components/inbox/useContactConversation';
import EmptyState from '../components/EmptyState';
import { TableSkeleton, Skeleton } from '../components/Skeleton';
import { isBackendConfigured, fetchContacts } from '../lib/api';
import type { Contact } from '../lib/api';

/**
 * Contacts is the directory: "who do I know?"
 *
 * That is its whole job. Clicking a person does not open a CRM profile with a
 * Message button that leads somewhere else — it opens the conversation with
 * them, immediately, because the conversation IS the primary representation
 * of a contact everywhere in Populr. Who they are beyond the messages lives
 * in the context panel, one Details click away, the same panel the Inbox
 * opens for the same person.
 *
 * The directory row says what a directory should: who (face, name, handle,
 * platform), how they arrived (From), whether they are waiting on you, and
 * when they were last around. Stage and score are real fields with a real
 * backend and they remain editable in the context panel — but a directory
 * that leads with CRM columns reads as a pipeline, and these are people.
 */

const PAGE_SIZE = 20;

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ContactsPage() {
  const backendConfigured = isBackendConfigured();
  const [searchParams, setSearchParams] = useSearchParams();

  /**
   * The audience filter, arrived at by clicking "143 people" on an automation.
   *
   * Held in the URL rather than in state so the filtered view is a place: it
   * survives a reload, it can be linked, and Back returns to the automation
   * that sent you here. The automation's NAME comes from the response, not the
   * link — a name in a URL would go stale the moment it was renamed.
   */
  const automationId = searchParams.get('automation');
  const [automation, setAutomation] = useState<{ id: string; name: string } | null>(null);

  /**
   * The open contact — a person is a place. It survives a reload, it can be
   * linked, and it resolves to their CONVERSATION, the same canonical surface
   * the Inbox opens. There is deliberately no other destination: the old
   * CRM-first profile this route used to render is retired.
   */
  const openId = searchParams.get('contact');

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  // Behavior filters + tag filter: urgency (the needs_reply flag the queue
  // sets), recency (who was active last), and the creator's own labels.
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [sortRecent, setSortRecent] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(backendConfigured);
  const [error, setError] = useState<string | null>(null);

  const setOpenId = useCallback((id: string | null) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (id) next.set('contact', id);
      else next.delete('contact');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Monotonic request id: search is un-debounced (one fetch per keystroke), so
  // without this a slower earlier response could resolve last and show results
  // for the wrong query. Only the most-recently-issued load may write.
  const loadSeq = useRef(0);

  const load = useCallback(() => {
    if (!backendConfigured) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    fetchContacts({
      search: search || undefined,
      needsReply: urgentOnly ? true : undefined,
      sort: sortRecent ? 'recent' : undefined,
      tag: activeTag || undefined,
      flowId: automationId || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then(res => {
        if (seq !== loadSeq.current) return; // a newer load superseded this one
        setContacts(res.contacts);
        setTotal(res.total);
        // Workspace-wide, not page-scoped — safe to keep across filters.
        setAllTags(res.allTags ?? []);
        setAutomation(res.automation ?? null);
      })
      .catch(err => {
        if (seq !== loadSeq.current) return;
        setError(err instanceof Error ? err.message : 'Could not load contacts.');
      })
      .finally(() => {
        if (seq === loadSeq.current) setLoading(false);
      });
  }, [backendConfigured, search, urgentOnly, sortRecent, activeTag, automationId, page]);

  useEffect(() => {
    // Data fetch from the backend, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    // Resetting pagination when search/filter (external inputs) change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(0);
  }, [search, urgentOnly, sortRecent, activeTag, automationId]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!backendConfigured) {
    return (
      <Page>
        <PageHeader title="Contacts" subtitle="Your people, your community, your next big collab." />
        <Card className="p-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">Populr isn&apos;t connected to its server yet</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">
              Populr can&apos;t reach its server, so your contacts can&apos;t be loaded right now.
            </p>
          </div>
        </Card>
      </Page>
    );
  }

  if (openId) {
    // Directory state (search, filters, page) lives on in this component
    // while the conversation is open, so Back lands exactly where you left.
    // load() on the way back because the panel can change what a row shows.
    return <ContactConversationRoute contactId={openId} onBack={() => { setOpenId(null); load(); }} />;
  }

  return (
    <Page>
      <PageHeader
        title="Contacts"
        subtitle="Your people, your community, your next big collab."
        action={
          // No "Add contact" button: contacts are created automatically when
          // someone engages with an automation, and a primary button whose
          // only behavior was a toast explaining it does nothing was a dead
          // affordance — the empty state below carries that explanation.
          <>
            <div className="hidden sm:block">
              <SearchInput
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search contacts by name, username…"
                className="w-56"
              />
            </div>
          </>
        }
      />

      {/* On mobile the header search is hidden — without this, phones had no
          way to search contacts at all. */}
      <div className="mb-4 sm:hidden">
        <SearchInput
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search contacts…"
        />
      </div>

      {/* The audience one automation built. It sits above the ordinary
          filters because it isn't one of them — it's why this page looks the
          way it does right now, and it has to be as easy to leave as it was
          to arrive at. */}
      {automationId && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-[#EDFBCD]
          border border-[#DDF5A8]">
          <Zap size={14} className="text-[#111111] flex-shrink-0" />
          <p className="text-[12px] text-[#111111] flex-1 min-w-0 truncate">
            {automation
              ? <>People <span className="font-semibold">{automation.name}</span> has reached</>
              : 'People this automation has reached'}
          </p>
          <button
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('automation');
              setSearchParams(next, { replace: true });
            }}
            aria-label="Show all contacts"
            className="flex items-center gap-1 text-[11px] font-medium text-[#4A4A4A]
              hover:text-[#111111] rounded px-1.5 py-0.5 transition-colors"
          >
            <X size={12} />Show all
          </button>
        </div>
      )}

      {/* Behavior + tag chips: how fans act (waiting on you, active lately)
          and how you've labeled them. The stage tabs that used to sit above
          these are deliberately gone — a row of pipeline buckets made the
          directory read as a CRM, and the stages themselves remain editable
          on each person's context panel. */}
      <div className="flex items-center gap-1.5 mb-5 overflow-x-auto pb-1">
        <button
          onClick={() => setUrgentOnly(v => !v)}
          aria-pressed={urgentOnly}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap border transition-all ${urgentOnly ? 'bg-[#111111] text-white border-[#111111]' : 'border-[#E8E4DF] text-[#6B6B6B] hover:bg-white'}`}>
          <Reply size={12} />Waiting on you
        </button>
        <button
          onClick={() => setSortRecent(v => !v)}
          aria-pressed={sortRecent}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap border transition-all ${sortRecent ? 'bg-[#111111] text-white border-[#111111]' : 'border-[#E8E4DF] text-[#6B6B6B] hover:bg-white'}`}>
          <Clock size={12} />Recently active
        </button>
        {allTags.length > 0 && <span aria-hidden className="w-px h-4 bg-[#E8E4DF] mx-1 flex-shrink-0" />}
        {allTags.map(tag => (
          <button key={tag}
            onClick={() => setActiveTag(t => t === tag ? null : tag)}
            aria-pressed={activeTag === tag}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap border transition-all ${activeTag === tag ? 'bg-chartreuse text-[#111111] border-chartreuse' : 'border-[#E8E4DF] text-[#6B6B6B] hover:bg-white'}`}>
            <Tag size={12} />{tag}
          </button>
        ))}
      </div>

      {error && (
        <Card className="p-4 mb-5 flex items-center gap-3">
          <AlertCircle size={16} className="text-[#DC2626] flex-shrink-0" />
          <p className="text-[13px] text-[#111111] flex-1">{error}</p>
          <Button variant="outline" onClick={load} className="text-[12px] py-1.5 px-3">Retry</Button>
        </Card>
      )}

      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton count={6} label="Loading contacts" />
        ) : !error && contacts.length === 0 ? (
          search || urgentOnly || activeTag || automationId ? (
            <EmptyState
              icon="search"
              title="No contacts match your filters"
              description="Try a different search term, or clear the filters above."
            />
          ) : (
            <EmptyState
              icon="contacts"
              title="No contacts yet"
              description="People who comment on or message your connected accounts show up here automatically once your automations start running."
            />
          )
        ) : !error && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E8E4DF]">
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-[#9B9B8F] tracking-wide">Contact</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-[#9B9B8F] tracking-wide">From</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-[#9B9B8F] tracking-wide">Last active</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map(contact => (
                  <tr
                    key={contact.id}
                    tabIndex={0}
                    aria-label={`Open the conversation with ${contact.handle ? `@${contact.handle}` : contact.name || 'contact'}`}
                    onClick={() => setOpenId(contact.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(contact.id); }
                    }}
                    className="border-b border-[#F0EEEA] last:border-0 hover:bg-[#FAFAF8] transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-chartreuse">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <ProfileImage
                          src={contact.avatar_url}
                          className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                          fallback={
                            <div className="w-9 h-9 rounded-full bg-[#FAFAF8] flex items-center justify-center flex-shrink-0 text-[12px] font-semibold text-[#9B9B8F]">
                              {(contact.name || contact.handle || '?').charAt(0).toUpperCase()}
                            </div>
                          }
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {/* "Someone", not "Unknown": the Inbox has always
                                used the first for a person we cannot name, and
                                the second reads like a failed lookup rather
                                than a person who never told us their name. */}
                            <p className="text-[13px] font-semibold text-[#111111] truncate">{contact.handle ? `@${contact.handle}` : contact.name || 'Someone'}</p>
                            <PlatformDot platform={contact.platform} size={6} />
                            {contact.needs_reply && (
                              // The same lime dot the Inbox list uses for
                              // "waiting on you" — one meaning, one mark.
                              <span
                                className="h-1.5 w-1.5 rounded-full bg-chartreuse ring-2 ring-chartreuse/25 flex-shrink-0"
                                role="img"
                                aria-label="Needs reply"
                              />
                            )}
                          </div>
                          {contact.name && <p className="text-[11px] text-[#9B9B8F] truncate">{contact.name}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-[12px] text-[#6B6B6B]">
                      {contact.from_automation ? (
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <Zap size={11} className="text-[#9B9B8F] flex-shrink-0" />
                          <span className="truncate">{contact.from_automation}</span>
                        </span>
                      ) : (
                        <span className="text-[#C4BFB8]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-[12px] text-[#9B9B8F]">{timeAgo(contact.last_message_at ?? contact.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!loading && !error && total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-[12px] text-[#6B6B6B]">Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className={cn(buttonVariants({ variant: 'outline' }), "text-[12px] py-1.5 px-3 disabled:opacity-40")}>Previous</button>
            <span className="text-[12px] text-[#6B6B6B]">{page + 1} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className={cn(buttonVariants({ variant: 'outline' }), "text-[12px] py-1.5 px-3 disabled:opacity-40")}>Next</button>
          </div>
        </div>
      )}
    </Page>
  );
}

/**
 * A contact, opened: their conversation, full width, context one click away.
 *
 * The same canonical view the Inbox renders — not a Contacts-flavored copy of
 * it — so the same person is the same experience from either door. The only
 * thing this route adds is the way back to the directory.
 */
function ContactConversationRoute({
  contactId, onBack,
}: { contactId: string; onBack: () => void }) {
  const { detail, loading, error, sending, send, updateDetail, reload } =
    useContactConversation(contactId);

  return (
    <div className="p-4 lg:p-6 max-w-[1100px] mx-auto flex flex-col
      h-[calc(100dvh-4rem-env(safe-area-inset-top))] md:h-[calc(100vh-3.5rem)]">
      <button
        onClick={onBack}
        className={cn(buttonVariants({ variant: 'ghost' }), "mb-4 self-start")}
      >
        <ArrowLeft size={16} />Contacts
      </button>

      {loading && !detail && (
        <Card className="flex-1 min-h-0 p-5" role="status" aria-busy="true" aria-label="Opening the conversation">
          <div className="flex items-center gap-3 mb-6">
            <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
            <div className="space-y-2">
              <Skeleton className="h-3.5 rounded w-36" />
              <Skeleton className="h-3 rounded w-20" />
            </div>
          </div>
          <div className="space-y-3">
            <Skeleton className="h-9 rounded-2xl w-[55%]" />
            <Skeleton className="h-9 rounded-2xl w-[40%] ml-auto" />
            <Skeleton className="h-9 rounded-2xl w-[48%]" />
          </div>
          <span className="sr-only">Opening the conversation</span>
        </Card>
      )}

      {!loading && error && (
        <Card className="p-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#DC2626] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">Couldn&apos;t open this conversation</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">{error}</p>
            <button onClick={reload} className={cn(buttonVariants({ variant: 'outline' }), "text-[12px] py-1.5 px-3 mt-3")}>Try again</button>
          </div>
        </Card>
      )}

      {detail && (
        <Card className="flex-1 min-h-0 overflow-hidden flex">
          <ContactConversationView
            key={detail.contact.id}
            detail={detail}
            loading={loading}
            sending={sending}
            replyTarget={detail.latestInboxItemId}
            onSend={send}
            onDetailChanged={updateDetail}
          />
        </Card>
      )}
    </div>
  );
}

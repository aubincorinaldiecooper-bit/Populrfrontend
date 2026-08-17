import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertCircle, ArrowLeft, MessagesSquare } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import ConversationList from '../components/inbox/ConversationList';
import ContactConversationView from '../components/inbox/ContactConversationView';
import { useConversations } from '../components/inbox/useConversations';
import { isBackendConfigured } from '../lib/api';

/**
 * Inbox — the full workspace.
 *
 * The top-bar drawer is for the one-line reply you send without leaving what
 * you were doing. This is the other half: a place to sit with conversations,
 * search them, and understand who you are talking to.
 *
 * Two panes by default — conversations, and the conversation — because the
 * conversation is the primary experience. The contact is a third pane that
 * appears when asked for and closes as easily; a permanently visible contact
 * sidebar would make this a CRM with messaging attached, which is precisely
 * the thing it isn't.
 *
 * The open conversation lives in the URL (?c=<contactId>), which is what
 * makes a conversation a place: reloadable, linkable, and reachable from a
 * contact's own profile.
 */

export default function InboxPage() {
  const backendConfigured = isBackendConfigured();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');

  const selected = searchParams.get('c');
  const {
    conversations, loading, error, thread, threadLoading, selectedId, sending,
    replyTarget, select, refresh, send, updateThread,
  } = useConversations(search);

  // The URL is the source of truth for which conversation is open, so a
  // reload, a link, or arriving from a contact all land in the same place.
  useEffect(() => {
    if (selected !== selectedId) select(selected);
  }, [selected, selectedId, select]);

  const open = useCallback((contactId: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (contactId) next.set('c', contactId);
    else next.delete('c');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  if (!backendConfigured) {
    return (
      <div className="pop-page">
        <PageHeader title="Inbox" subtitle="The people talking to you." />
        <div className="pop-card p-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">
              Populr isn&apos;t connected to its server yet
            </p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">
              Populr can&apos;t reach its server, so your conversations can&apos;t be loaded.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const waiting = conversations.reduce((n, c) => n + (c.waiting > 0 ? 1 : 0), 0);

  // Home's attention banner lands here with ?f=needs-you: only the
  // conversations actually waiting on a human. The chip clears it.
  const needsYouOnly = searchParams.get('f') === 'needs-you';
  const visibleConversations = needsYouOnly
    ? conversations.filter(c => c.waiting > 0)
    : conversations;
  const clearFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('f');
    setSearchParams(next, { replace: true });
  };

  return (
    // Below md the layout already pushes content past a fixed 4rem header, so
    // a full-viewport child hangs that far below the fold — composer included.
    // Take the remaining height, not the whole viewport.
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto flex flex-col
      h-[calc(100dvh-4rem-env(safe-area-inset-top))] md:h-[calc(100vh-3.5rem)]">
      <PageHeader
        title="Inbox"
        subtitle={loading
          ? 'Loading…'
          : waiting > 0
            ? `${waiting} waiting on you · ${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`
            : `${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`}
      />

      {needsYouOnly && (
        <div className="mb-3 -mt-2">
          <button
            type="button"
            onClick={clearFilter}
            className="inline-flex items-center gap-1.5 rounded-full bg-chartreuse/25 px-3 py-1.5 text-[12px] font-medium text-[#3F5212] hover:bg-chartreuse/40 transition-colors"
          >
            Needs you only
            <span aria-hidden="true">✕</span>
            <span className="sr-only">Show all conversations</span>
          </button>
        </div>
      )}

      {error && (
        <div className="pop-card p-4 mb-4 flex items-center gap-3">
          <AlertCircle size={16} className="text-[#DC2626] flex-shrink-0" />
          <p className="text-[13px] text-[#111111] flex-1">{error}</p>
          <button onClick={refresh} className="pop-btn-tertiary text-[12px] py-1.5 px-3">Retry</button>
        </div>
      )}

      {!error && (
        <div className="flex-1 min-h-0 pop-card overflow-hidden flex">
          {/* --------------------------------------------------- conversations */}
          <div
            className={`w-full md:w-[300px] md:shrink-0 md:border-r border-[#EFECE6] min-h-0
              ${selected ? 'hidden md:flex md:flex-col' : 'flex flex-col'}`}
          >
            <ConversationList
              conversations={visibleConversations}
              selectedId={selected}
              search={search}
              loading={loading}
              onSearch={setSearch}
              onSelect={open}
            />
          </div>

          {/* ---------------------------------------------------- conversation */}
          <div className={`flex-1 min-w-0 min-h-0 ${selected ? 'flex flex-col' : 'hidden md:flex md:flex-col'}`}>
            {/* Narrow screens are one pane at a time: the list, then the
                conversation, with a way back. Three panes in 380px would be
                three unusable columns. */}
            {selected && (
              <button
                type="button"
                onClick={() => open(null)}
                className="md:hidden shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-[13px]
                  text-[#6B6B6B] border-b border-[#EFECE6] hover:text-[#111111] transition-colors"
              >
                <ArrowLeft size={15} /> Conversations
              </button>
            )}

            {thread ? (
              // Keyed by person: opening someone else resets the view to its
              // default — conversation first, context closed — the same way
              // everywhere.
              <ContactConversationView
                key={thread.contact.id}
                detail={thread}
                loading={threadLoading}
                sending={sending}
                replyTarget={replyTarget}
                onSend={send}
                onDetailChanged={updateThread}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
                <MessagesSquare size={22} className="text-[#D8D3CC]" />
                <p className="text-[13px] text-[#8A857E]">
                  {threadLoading ? 'Opening…' : 'Pick a conversation'}
                </p>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

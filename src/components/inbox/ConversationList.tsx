import { Search } from 'lucide-react';
import Avatar from './Avatar';
import EmptyState from '../EmptyState';
import { ListSkeleton } from '../Skeleton';
import { shortAgo } from '../../lib/timeAgo';
import type { Conversation } from '../../lib/api';

/**
 * Who is talking to you, most recent first.
 *
 * A messaging list, not a queue of tickets: one row per person, the last
 * thing said, and when. What it deliberately doesn't carry is the reason an
 * item entered the inbox, the lead score, or the stage — those framed the
 * Inbox as a CRM worklist, and none of them help a creator recognise who
 * they're about to talk to.
 *
 * Unread is weight, not decoration: the name goes semibold, the preview goes
 * dark, and a small lime dot marks the row. Selection is a soft lime tint —
 * the same accent the sidebar already uses for "you are here".
 *
 * Loading and empty live in here rather than above, so the search field is
 * always on screen. A search that matches nobody used to take the search box
 * away with the results, which left the creator holding a query they could
 * no longer edit or clear.
 */

export interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  search: string;
  loading: boolean;
  onSearch: (value: string) => void;
  onSelect: (contactId: string) => void;
}

export default function ConversationList({
  conversations, selectedId, search, loading, onSearch, onSelect,
}: ConversationListProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 px-3 py-3 border-b border-[#EFECE6]">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9B9B8F]" />
          <input
            type="search"
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className="w-full bg-[#FAF9F7] border border-[#EFECE6] rounded-xl pl-9 pr-3 py-2
              text-[13px] placeholder:text-[#9B9B8F] focus:outline-none focus:border-chartreuse
              focus:ring-2 focus:ring-chartreuse/20 transition-colors"
          />
        </div>
      </div>

      {loading ? (
        <div className="p-3"><ListSkeleton count={5} label="Loading conversations" /></div>
      ) : conversations.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon="inbox"
            title={search ? 'No conversations found' : 'No conversations yet'}
            description={search
              ? 'Try a different name or handle.'
              : 'When someone comments on or messages your connected accounts, their conversation appears here.'}
          />
        </div>
      ) : (
      <ul className="flex-1 min-h-0 overflow-y-auto py-1.5" aria-label="Conversations">
        {conversations.map(c => {
          const unread = c.waiting > 0;
          const selected = c.contactId === selectedId;
          const preview = c.lastMessage.text?.trim() || 'No message text';
          return (
            <li key={c.contactId}>
              <button
                type="button"
                onClick={() => onSelect(c.contactId)}
                aria-current={selected ? 'true' : undefined}
                className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left rounded-xl
                  transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-chartreuse
                  ${selected ? 'bg-[#F2FBDF]' : 'hover:bg-[#FAF9F7]'}`}
              >
                <Avatar
                  handle={c.handle} name={c.name} avatarUrl={c.avatarUrl}
                  platform={c.platform} size="md" showPlatform
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={`truncate text-[13px] text-[#111111]
                      ${unread ? 'font-semibold' : 'font-medium'}`}>
                      {c.name?.trim() || `@${c.handle ?? 'someone'}`}
                    </span>
                    <span className="ml-auto shrink-0 text-[10.5px] text-[#9B9B8F]">
                      {shortAgo(c.lastMessage.at)}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 mt-0.5">
                    <span className={`truncate text-[12px] leading-snug
                      ${unread ? 'text-[#4A4A4A]' : 'text-[#8A857E]'}`}>
                      {/* Their own words read as theirs; yours are marked, the
                          way every messaging product does it. */}
                      {c.lastMessage.direction === 'outbound' && (
                        <span className="text-[#9B9B8F]">You: </span>
                      )}
                      {preview}
                    </span>
                    {unread && (
                      <span
                        className="ml-auto shrink-0 h-1.5 w-1.5 rounded-full bg-chartreuse
                          ring-1 ring-[#A8D93B]"
                        aria-label={`${c.waiting} waiting`}
                      />
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}

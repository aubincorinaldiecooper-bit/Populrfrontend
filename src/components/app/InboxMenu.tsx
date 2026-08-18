import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { MessageCircle } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchConversations, type Conversation } from '../../lib/api';
import { useInboxWaiting } from '../inbox/conversations';
import { headerIconButton } from './headerIconButton';

/**
 * The header's Inbox control: a glance at who is waiting, from any page.
 *
 * This is a window onto the one Inbox, not a second one — it asks the same
 * endpoint the Inbox page asks, counts with the same store the nav badge
 * uses, and every row deep-links to the real conversation at
 * /inbox?c=<contactId>. Nothing here can disagree with the page.
 *
 * The list is fetched when the menu opens, not polled: the badge already
 * carries the ambient signal, so the request happens at the moment the
 * creator asks to see names.
 */

export default function InboxMenu() {
  const { count } = useInboxWaiting();
  // Controlled so the rows can stay REAL links (role=link, middle-click,
  // copy address all intact) and still close the menu when followed —
  // PopoverClose would have re-cast them as buttons.
  const [open, setOpen] = useState(false);
  const [waiting, setWaiting] = useState<Conversation[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Close-and-reopen before a fetch settles leaves two requests in flight,
  // and whichever lands LAST would write the menu — a late failure from the
  // first could overwrite the second's fresh rows. Each opening takes a
  // generation; only the newest may write.
  const generation = useRef(0);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    const mine = ++generation.current;
    setFailed(false);
    setWaiting(null);
    fetchConversations({})
      .then(res => {
        if (generation.current !== mine) return;
        setWaiting(res.conversations.filter(c => c.waiting > 0).slice(0, 5));
      })
      .catch(() => {
        if (generation.current !== mine) return;
        setFailed(true);
      });
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <button type="button" aria-label={count > 0 ? `Inbox, ${count} waiting` : 'Inbox'} className={headerIconButton}>
            <MessageCircle size={19} strokeWidth={2} />
            {count > 0 && (
              <span
                aria-hidden="true"
                className="absolute right-0.5 top-0.5 h-[15px] min-w-[15px] rounded-full
                  bg-sidebar-primary px-1 text-center text-[9.5px] font-semibold
                  leading-[15px] text-sidebar-primary-foreground"
              >
                {count > 9 ? '9+' : count}
              </span>
            )}
          </button>
        }
      />
      <PopoverContent className="w-[340px] max-w-[calc(100vw-2rem)] p-0">
        <p className="type-label px-4 pb-1 pt-3.5">Waiting on you</p>

        {failed ? (
          <p className="px-4 py-3 text-[13px] text-muted-foreground">
            Populr can&rsquo;t reach its server right now, so this can&rsquo;t be loaded.
          </p>
        ) : waiting === null ? (
          <div className="space-y-2 px-4 py-3" aria-label="Loading conversations">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : waiting.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-muted-foreground">
            No one is waiting on you right now.
          </p>
        ) : (
          <ul className="py-1">
            {waiting.map(c => {
              const who = c.name || (c.handle ? `@${c.handle}` : 'Someone');
              return (
                <li key={c.contactId}>
                  <Link
                    to={`/inbox?c=${encodeURIComponent(c.contactId)}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted"
                  >
                        {c.avatarUrl ? (
                          <img src={c.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full
                              bg-muted text-[12px] font-semibold text-muted-foreground"
                          >
                            {who.replace('@', '').slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium text-foreground">{who}</span>
                          {c.lastMessage.text && (
                            <span className="block truncate text-[12px] text-muted-foreground">
                              {c.lastMessage.text}
                            </span>
                          )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t border-border-subtle p-1.5">
          <Link
            to="/inbox"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-2.5 py-2 text-center text-[13px] font-medium
              text-foreground transition-colors hover:bg-muted"
          >
            View inbox
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

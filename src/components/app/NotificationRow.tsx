import { Link } from 'react-router';
import { Zap, UsersRound, AlertTriangle, Bell, DoorOpen, Pencil } from 'lucide-react';
import Avatar from '../inbox/Avatar';
import { timeAgo } from '../../lib/timeAgo';
import type { WorkspaceNotification } from '../../lib/api';

const kindIcon: Record<string, React.ElementType> = {
  automation_live: Zap,
  member_joined: UsersRound,
  account_reconnect: AlertTriangle,
  /** Your own arrival, addressed to you — the one line in the feed that is
   *  about you rather than about the work. */
  you_joined: DoorOpen,
  /** Somebody else worked on an automation you can open. */
  automation_edited: Pencil,
};

/**
 * One line of the feed — the same rendering in the bell's popover and on
 * /notifications, so the two surfaces can never drift apart. Actionable
 * rows are real links to their in-app destination; a row with nowhere to
 * go is just told.
 */
export default function NotificationRow({
  notification,
  onOpen,
}: {
  notification: WorkspaceNotification;
  /** Called when the row is followed — mark it read, close menus, etc. */
  onOpen: (n: WorkspaceNotification) => void;
}) {
  const Icon = kindIcon[notification.kind] ?? Bell;
  const unread = notification.readAt === null;
  const actor = notification.actor;

  const inner = (
    <>
      {/* Who, when a person did it. A row about a team is mostly about the
          person in it, and a generic glyph gives that away for nothing —
          the icon says the KIND, which the sentence beside it already says.
          Nobody did an account falling out of authorisation, so those keep
          the glyph rather than borrowing a face that would be a lie. */}
      {actor ? (
        <span className="relative mt-0.5 shrink-0">
          <Avatar handle={actor.email} name={actor.name} avatarUrl={actor.avatarUrl} size="sm" />
          {/* The kind, kept as a small mark on the corner rather than
              dropped: it is what makes the feed scannable without reading. */}
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center
              rounded-full bg-card text-muted-foreground ring-1 ring-border"
          >
            <Icon size={9} strokeWidth={2.5} />
          </span>
        </span>
      ) : (
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted
            text-muted-foreground"
        >
          <Icon size={15} strokeWidth={2} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={`block text-[13.5px] leading-snug ${unread ? 'font-semibold text-foreground' : 'font-medium text-foreground'}`}>
          {notification.title}
        </span>
        {notification.body && (
          <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">
            {notification.body}
          </span>
        )}
        <span className="mt-0.5 block text-[11px] text-foreground-subtle">
          {timeAgo(notification.createdAt)}
        </span>
      </span>
      {unread && (
        <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
      )}
      {unread && <span className="sr-only">, unread</span>}
    </>
  );

  const className = 'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted';
  if (notification.linkPath) {
    return (
      <Link to={notification.linkPath} onClick={() => onOpen(notification)} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => onOpen(notification)} className={`${className} w-full text-left`}>
      {inner}
    </button>
  );
}

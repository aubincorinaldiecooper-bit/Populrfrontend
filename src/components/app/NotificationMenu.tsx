import { Bell } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { headerIconButton } from './headerIconButton';

/**
 * The header's bell. Today it can only tell the truth it has: nothing is
 * feeding it yet, so it says so plainly instead of inventing activity.
 *
 * The real feed — automations going live, teammates joining, accounts
 * needing reconnection — arrives with the notifications backend (the
 * /api/notifications arc), which also brings the /notifications page this
 * menu will link to. The control exists now so the header's geography is
 * stable from the start: the bell will not move when it starts ringing.
 */
export default function NotificationMenu() {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button type="button" aria-label="Notifications" className={headerIconButton}>
            <Bell size={19} strokeWidth={2} />
          </button>
        }
      />
      <PopoverContent className="w-[300px] max-w-[calc(100vw-2rem)] p-0">
        <p className="type-label px-4 pb-1 pt-3.5">Notifications</p>
        <p className="px-4 pb-4 pt-1 text-[13px] leading-relaxed text-muted-foreground">
          You&rsquo;re all caught up. When something needs you — an automation going live, a
          teammate joining, an account needing attention — it will land here.
        </p>
      </PopoverContent>
    </Popover>
  );
}

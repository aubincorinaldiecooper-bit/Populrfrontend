import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Check, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { getSubscriptionCheckoutUrl } from '../lib/api';

const INCLUDED_POINTS = [
  'Connect additional social accounts',
  'Keep engagement syncing',
  'Turn engagement into contacts automatically',
];

/**
 * Shown whenever a social-connect attempt comes back subscription_required
 * (402) — never the provider's own error, never a raw error card alongside
 * this. Persistent (no backdrop dismiss — `disablePointerDismissal`) since
 * "Not now" is the only intended way out besides subscribing; Escape maps
 * to the same onClose as "Not now".
 */
export default function SubscriptionModal({
  platform, onClose,
}: { platform: string | null; onClose: () => void }) {
  const checkoutUrl = getSubscriptionCheckoutUrl();

  const handleSubscribe = () => {
    if (!checkoutUrl) return;
    // Preserves which platform the user was trying to connect so it can be
    // retried after checkout, without ever marking them subscribed locally
    // — that state only becomes real once they've actually paid and come
    // back through this return URL. Returns to wherever the modal was
    // opened from (mirrors how beginPlatformConnect builds its own OAuth
    // return URL from the current page) rather than a URL hard-coded to
    // /connections: a not-yet-onboarded user opens this modal from
    // /connect, and the route gate only renders /connect pre-onboarding —
    // everything else redirects there without preserving the query string,
    // so a hard-coded /connections silently dropped subscription=success
    // and retry= for exactly that user.
    const returnUrl = new URL(window.location.pathname, window.location.origin);
    returnUrl.searchParams.set('subscription', 'success');
    if (platform) returnUrl.searchParams.set('retry', platform);
    let target: URL;
    try {
      target = new URL(checkoutUrl);
      target.searchParams.set('return_url', returnUrl.toString());
    } catch {
      return;
    }
    window.location.href = target.toString();
  };

  return (
    <Dialog open onOpenChange={next => { if (!next) onClose(); }} disablePointerDismissal>
      <DialogContent className="relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-[#9B9B8F] hover:text-[#111111] hover:bg-[#FAFAF8] rounded-lg transition-all"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <p className="text-[11px] font-bold tracking-[0.1em] text-[#5C6B00] uppercase mb-2">Populr Pro</p>
        <DialogTitle className="mb-1">Connect more accounts</DialogTitle>
        <p className="text-[26px] font-bold text-[#111111] mb-3">
          $12<span className="text-[14px] font-medium text-[#6B6B6B]"> / month</span>
        </p>
        <p className="text-[13px] text-[#6B6B6B] mb-4 leading-relaxed">
          Upgrade to connect additional social accounts and keep your audience activity synced in Populr.
        </p>

        <ul className="space-y-2 mb-6">
          {INCLUDED_POINTS.map(point => (
            <li key={point} className="flex items-center gap-2 text-[13px] text-[#111111]">
              <Check size={14} className="text-[#059669] flex-shrink-0" /> {point}
            </li>
          ))}
        </ul>

        {!checkoutUrl && (
          <p className="text-[12px] text-[#DC2626] bg-[#FEE2E2] rounded-lg px-3 py-2.5 mb-3">
            Subscriptions aren&apos;t configured yet. Please contact Populr support to upgrade.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={handleSubscribe}
            disabled={!checkoutUrl}
            className={cn(buttonVariants(), "text-[13px] py-2.5 justify-center disabled:opacity-40 disabled:cursor-not-allowed")}
          >
            Subscribe for $12/month
          </button>
          <button onClick={onClose} className={cn(buttonVariants({ variant: 'ghost' }), "text-[13px] py-2.5 justify-center")}>
            Not now
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

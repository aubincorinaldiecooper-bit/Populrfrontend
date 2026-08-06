import { useSearchParams } from 'react-router';
import { Check, AlertCircle } from 'lucide-react';

/**
 * Public landing target for connection links opened in a private window.
 *
 * The copied "connect another account" link finishes its OAuth in a window
 * with no Populr session, so sending its callback to /channels would dump
 * the user on a login screen mid-flow. This page needs no session and shows
 * only the outcome — never account data, workspace identifiers, or anything
 * from the provider — and points the user back to their signed-in window,
 * which is polling for the new account.
 *
 * Reads the same one-shot markers the backend callback appends everywhere:
 * ?connected=<platform> on success, ?connect_error=... on failure.
 */
export default function ConnectCompletePage() {
  const [searchParams] = useSearchParams();
  const connectError = searchParams.get('connect_error');
  const connected = searchParams.get('connected');

  const success = !connectError && !!connected;
  const subscriptionRequired = connectError === 'subscription_required';

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-[420px] shadow-sm border border-[#F0EEEA] p-8 text-center">
        <div
          className={`w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center ${
            success ? 'bg-[#E0F5E9]' : 'bg-[#FFF3E0]'
          }`}
        >
          {success
            ? <Check size={24} className="text-[#059669]" />
            : <AlertCircle size={24} className="text-[#D97706]" />}
        </div>

        {success && (
          <>
            <h1 className="font-geist font-bold text-xl text-[#111111] mb-2">Account connected</h1>
            <p className="text-[13px] text-[#6B6B6B] leading-relaxed">
              You can close this window. Back in your Populr window, the new account will show up
              on Channels within a few seconds.
            </p>
          </>
        )}

        {!success && subscriptionRequired && (
          <>
            <h1 className="font-geist font-bold text-xl text-[#111111] mb-2">Subscription needed</h1>
            <p className="text-[13px] text-[#6B6B6B] leading-relaxed">
              A Populr subscription is required to connect another account. Close this window and
              subscribe from your Populr window, then try again with a fresh link.
            </p>
          </>
        )}

        {!success && !subscriptionRequired && (
          <>
            <h1 className="font-geist font-bold text-xl text-[#111111] mb-2">
              This connection didn&apos;t finish
            </h1>
            <p className="text-[13px] text-[#6B6B6B] leading-relaxed">
              Connection links work once and expire after a few minutes. Close this window, copy a
              fresh link from your Populr window, and try again.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

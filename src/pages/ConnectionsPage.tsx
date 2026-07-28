import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Instagram, Music, Linkedin, Loader2, Check, AlertCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import PageHeader from '../components/PageHeader';
import { isBackendConfigured, fetchCapabilities } from '../lib/api';
import type { PlatformCapabilities } from '../lib/api';

// Populr's supported connection surface: exactly Instagram, TikTok, LinkedIn.
const PLATFORMS = [
  { id: 'instagram', name: 'Instagram', icon: Instagram, color: '#E4405F' },
  { id: 'tiktok', name: 'TikTok', icon: Music, color: '#000000' },
  { id: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: '#0A66C2' },
];

export default function ConnectionsPage() {
  const { connectedPlatforms, beginPlatformConnect, refreshConnectedAccounts } = useApp();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const backendConfigured = isBackendConfigured();

  const [capabilities, setCapabilities] = useState<Record<string, PlatformCapabilities>>({});

  useEffect(() => {
    if (!backendConfigured) return;
    fetchCapabilities()
      .then(list => {
        setCapabilities(Object.fromEntries(list.map(c => [c.platform, c])));
      })
      .catch(err => {
        console.error('[connections] failed to load platform capabilities:', err);
      });
  }, [backendConfigured]);

  // Connection state lives in memory, so after any full page load (including
  // the return trip from the OAuth redirect) it has to be re-read from the
  // backend — otherwise a genuinely connected account renders as "Not
  // connected". Also clears the ?connected= marker the callback leaves behind.
  const syncFromBackend = useCallback(() => {
    if (!backendConfigured) return;
    refreshConnectedAccounts();
    if (searchParams.get('connected')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('connected');
      window.history.replaceState(null, '', url.toString());
    }
  }, [backendConfigured, searchParams, refreshConnectedAccounts]);

  useEffect(() => {
    syncFromBackend();
  }, [syncFromBackend]);

  const connectedCount = connectedPlatforms.filter(p => p.status === 'connected').length;

  return (
    <div className="pop-page max-w-[720px]">
      <PageHeader
        title="Connections"
        subtitle="Connect the accounts you want Populr to review for meaningful engagement. One is enough to get started."
      />

      {!backendConfigured && (
        <div className="pop-card p-6 mb-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#111111]">Populr isn&apos;t connected to a backend yet</p>
            <p className="text-[12px] text-[#6B6B6B] mt-1">
              Set <code className="bg-[#FAFAF8] px-1 py-0.5 rounded">VITE_API_URL</code> to your Populr backend to connect real accounts here.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3 mb-6">
        {PLATFORMS.map(p => {
          const cp = connectedPlatforms.find(c => c.id === p.id);
          const status = cp?.status ?? 'idle';
          const caps = capabilities[p.id];
          const limited = caps && (!caps.supportsCommentReplies || !caps.supportsDMs);
          const Icon = p.icon;

          return (
            <div key={p.id} className="pop-card p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FAFAF8] flex items-center justify-center flex-shrink-0">
                  <Icon size={20} style={{ color: p.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-semibold text-[#111111]">{p.name}</span>
                    {status === 'connected' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#E0F5E9] text-[#059669]">
                        <Check size={10} /> Connected
                      </span>
                    )}
                    {status === 'connecting' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FFF3E0] text-[#D97706]">
                        <Loader2 size={10} className="animate-spin" /> Connecting
                      </span>
                    )}
                    {status === 'error' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FEE2E2] text-[#DC2626]">
                        Connection failed
                      </span>
                    )}
                    {status === 'idle' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#FAFAF8] text-[#9B9B8F]">
                        Not connected
                      </span>
                    )}
                    {limited && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#EFF6FF] text-[#3B82F6]">
                        Limited access
                      </span>
                    )}
                  </div>
                  {status === 'connected' && cp?.handle && (
                    <p className="text-[12px] text-[#6B6B6B] mt-0.5">{cp.handle}</p>
                  )}
                  {status === 'error' && cp?.errorMessage && (
                    <p className="text-[12px] text-[#DC2626] mt-0.5">{cp.errorMessage}</p>
                  )}
                  {limited && caps?.caveat && (
                    <p className="text-[11px] text-[#9B9B8F] mt-1 leading-relaxed">{caps.caveat}</p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {status === 'idle' && (
                    <button onClick={() => beginPlatformConnect(p.id)} className="pop-btn-primary text-[12px] py-2 px-3">
                      Connect
                    </button>
                  )}
                  {status === 'connecting' && (
                    <button disabled className="pop-btn-secondary text-[12px] py-2 px-3 opacity-60 cursor-not-allowed">
                      <Loader2 size={13} className="animate-spin" /> Connecting
                    </button>
                  )}
                  {status === 'error' && (
                    <button onClick={() => beginPlatformConnect(p.id)} className="pop-btn-secondary text-[12px] py-2 px-3">
                      <RefreshCw size={13} /> Try again
                    </button>
                  )}
                  {status === 'connected' && (
                    <button onClick={() => beginPlatformConnect(p.id)} className="pop-btn-ghost text-[12px] py-2 px-3">
                      Reconnect
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[#6B6B6B]">
          {connectedCount > 0
            ? `${connectedCount} of ${PLATFORMS.length} connected`
            : 'Connect at least one account to see opportunities.'}
        </p>
        <button
          onClick={() => navigate('/')}
          disabled={connectedCount === 0}
          className="pop-btn-primary text-[13px] py-2.5 px-4 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Go to Opportunities <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

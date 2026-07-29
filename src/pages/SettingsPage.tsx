import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Instagram, Video, Linkedin, Link2,
  Check, Shield, Trash2, Download, AlertTriangle,
  Loader2, Clock, ChevronDown, RefreshCw,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { isBackendConfigured } from '../lib/api';
import type { ConnectedAccount, AccountStatus } from '../lib/api';

const iconMap: Record<string, React.ElementType> = {
  instagram: Instagram, tiktok: Video, linkedin: Linkedin,
};

const statusConfig: Record<AccountStatus, { label: string; color: string; bg: string }> = {
  connected: { label: 'Connected', color: 'text-[#059669]', bg: 'bg-[#E0F5E9]' },
  disconnected: { label: 'Disconnected', color: 'text-[#6B6B6B]', bg: 'bg-[#FAFAF8]' },
  reconnect_required: { label: 'Reconnect required', color: 'text-[#DC2626]', bg: 'bg-[#FEE2E2]' },
};

type Tab = 'profile' | 'accounts' | 'privacy' | 'data';

export default function SettingsPage() {
  const {
    accounts, accountsLoading, refreshAccounts, disconnectAccount, beginPlatformConnect,
    privacySettings, updatePrivacySetting, deleteAudienceData, showToast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [saved, setSaved] = useState(false);
  const [mobileTabsOpen, setMobileTabsOpen] = useState(false);

  const [disconnectModal, setDisconnectModal] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [confirmDeleteData, setConfirmDeleteData] = useState(false);

  const [exporting, setExporting] = useState<string | null>(null);
  const [exportReady, setExportReady] = useState<string | null>(null);

  // Fetch the authoritative list whenever this tab is opened, not just once
  // on app load — an account connected or disconnected elsewhere (e.g. the
  // Connections page) must show up here without a full page reload.
  useEffect(() => {
    if (activeTab === 'accounts') {
      refreshAccounts();
    }
  }, [activeTab, refreshAccounts]);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    showToast('Settings saved', 'success');
  };

  const handleDisconnect = async (id: string) => {
    setDisconnecting(id);
    try {
      await disconnectAccount(id);
      showToast('Account disconnected', 'success');
      setDisconnectModal(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not disconnect this account.', 'error');
    } finally {
      setDisconnecting(null);
    }
  };

  const handleExport = (type: string) => {
    setExporting(type);
    setTimeout(() => {
      setExporting(null);
      setExportReady(type);
      showToast('Export ready for download', 'success');
    }, 2000);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'profile', label: 'Account' },
    { key: 'accounts', label: 'Connected Accounts' },
    { key: 'privacy', label: 'Privacy & Consent' },
    { key: 'data', label: 'Data Export' },
  ];

  const activeLabel = tabs.find(t => t.key === activeTab)?.label || 'Account';
  const connectedAccounts = accounts.filter((a: ConnectedAccount) => a.status === 'connected');
  const backendConfigured = isBackendConfigured();

  return (
    <div className="p-6 lg:p-8 max-w-[900px] mx-auto">
      <PageHeader title="Settings" />

      {/* Tabs - Desktop */}
      <div className="hidden md:flex gap-1 mb-6 border-b border-[#E8E4DF]">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-[13px] font-medium transition-all border-b-2 -mb-px ${activeTab === tab.key ? 'border-chartreuse text-[#111111]' : 'border-transparent text-[#6B6B6B] hover:text-[#111111]'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tabs - Mobile dropdown */}
      <div className="md:hidden mb-6 relative">
        <button onClick={() => setMobileTabsOpen(!mobileTabsOpen)}
          className="w-full flex items-center justify-between border border-[#E8E4DF] rounded-xl px-4 py-3 bg-white text-[13px] font-medium text-[#111111]">
          {activeLabel}<ChevronDown size={16} className={`transition-transform ${mobileTabsOpen ? 'rotate-180' : ''}`} />
        </button>
        {mobileTabsOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E8E4DF] rounded-xl shadow-lg z-20 overflow-hidden">
            {tabs.map(tab => (
              <button key={tab.key} onClick={() => { setActiveTab(tab.key); setMobileTabsOpen(false); }}
                className={`w-full text-left px-4 py-3 text-[13px] transition-all ${activeTab === tab.key ? 'bg-[#FAFAF8] font-semibold text-[#111111]' : 'text-[#6B6B6B] hover:bg-[#FAFAF8]'}`}>
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── PROFILE TAB ─── */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-[#E8E4DF]">
            <h2 className="font-geist font-semibold text-sm text-[#111111] mb-5">Creator identity</h2>
            <div className="flex items-center gap-4 mb-6">
              <img src="/images/avatar-maya.jpg" alt="Maya Chen" className="w-16 h-16 rounded-full object-cover" />
              <div>
                <p className="font-geist font-bold text-base text-[#111111]">Maya Chen</p>
                <p className="text-[13px] text-[#6B6B6B]">@mayastyle</p>
                <p className="text-[11px] text-[#9B9B8F] mt-1">{connectedAccounts.length} platforms connected</p>
              </div>
            </div>
          </div>

          {/* Connected identities */}
          {connectedAccounts.length > 0 && (
            <div className="bg-white rounded-2xl p-6 border border-[#E8E4DF]">
              <h2 className="font-geist font-semibold text-sm text-[#111111] mb-4">Connected social identities</h2>
              <div className="flex flex-wrap gap-2">
                {connectedAccounts.map((acc: ConnectedAccount) => {
                  const Icon = iconMap[acc.platform] || Link2;
                  return (
                    <div key={acc.id} className="flex items-center gap-2 bg-[#FAFAF8] rounded-lg px-3 py-2">
                      <Icon size={14} className="text-[#6B6B6B]" />
                      <span className="text-[12px] text-[#111111]">{acc.username ? `@${acc.username}` : acc.display_name || acc.platform}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button onClick={handleSave} className="bg-chartreuse text-[#111111] rounded-[10px] px-6 py-2.5 text-[13px] font-semibold hover:bg-chartreuse-hover transition-all flex items-center gap-2">
            {saved && <Check size={14} />}{saved ? 'Saved!' : 'Save changes'}
          </button>
        </div>
      )}

      {/* ─── CONNECTED ACCOUNTS TAB ─── */}
      {activeTab === 'accounts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="font-geist font-semibold text-sm text-[#111111]">Connected accounts</h2>
              <p className="text-[12px] text-[#6B6B6B] mt-0.5">View and manage the accounts Populr can review for engagement.</p>
            </div>
            {accounts.length > 0 && (
              <span className="text-[11px] text-[#9B9B8F]">{connectedAccounts.length} of {accounts.length} connected</span>
            )}
          </div>

          {!backendConfigured && (
            <div className="bg-white rounded-2xl p-6 border border-[#E8E4DF] flex items-start gap-3">
              <AlertTriangle size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-[#111111]">Populr isn&apos;t connected to a backend yet</p>
                <p className="text-[12px] text-[#6B6B6B] mt-1">Set <code className="bg-[#FAFAF8] px-1 py-0.5 rounded">VITE_API_URL</code> to see real connected accounts here.</p>
              </div>
            </div>
          )}

          {backendConfigured && accountsLoading && (
            <div className="flex items-center justify-center py-12 text-[#6B6B6B]">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading connected accounts...
            </div>
          )}

          {backendConfigured && !accountsLoading && accounts.length === 0 && (
            <div className="bg-white rounded-2xl p-8 border border-[#E8E4DF] text-center">
              <Link2 size={22} className="text-[#9B9B8F] mx-auto mb-3" />
              <p className="text-[14px] font-semibold text-[#111111]">No accounts connected yet</p>
              <p className="text-[12px] text-[#6B6B6B] mt-1.5">Connect Instagram, TikTok, or LinkedIn from the Connections page.</p>
            </div>
          )}

          {backendConfigured && !accountsLoading && accounts.map((acc: ConnectedAccount) => {
            const Icon = iconMap[acc.platform] || Link2;
            const status = statusConfig[acc.status];
            const isConnected = acc.status === 'connected';
            const needsReconnect = acc.status === 'reconnect_required';
            const isDisconnected = acc.status === 'disconnected';

            return (
              <div key={acc.id} className={`bg-white rounded-2xl border transition-all ${needsReconnect ? 'border-[#FECACA]' : 'border-[#E8E4DF]'}`}>
                <div className="p-5">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#FAFAF8] overflow-hidden">
                      {acc.avatar_url ? (
                        <img src={acc.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Icon size={22} className={isConnected ? 'text-[#111111]' : 'text-[#9B9B8F]'} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[14px] font-semibold text-[#111111] capitalize">{acc.platform}</p>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}>{status.label}</span>
                      </div>
                      <p className="text-[11px] text-[#6B6B6B] mt-0.5">
                        {acc.username ? `@${acc.username}` : acc.display_name || 'Unknown account'}
                      </p>
                      {needsReconnect && <p className="text-[11px] text-[#DC2626] mt-0.5">Authorization expired — reconnect to keep this account active.</p>}
                      {isDisconnected && <p className="text-[11px] text-[#6B6B6B] mt-0.5">Historical data preserved. New activity will not sync.</p>}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
                      {isConnected && (
                        <button onClick={() => setDisconnectModal(acc.id)}
                          className="p-2 text-[#9B9B8F] hover:text-[#DC2626] hover:bg-[#FEE2E2] rounded-lg transition-all" title="Disconnect">
                          <Trash2 size={16} />
                        </button>
                      )}
                      {(needsReconnect || isDisconnected) && (
                        <button onClick={() => beginPlatformConnect(acc.platform)}
                          className="flex items-center gap-1.5 border border-[#E8E4DF] text-[#111111] rounded-lg px-3 py-2 text-[12px] font-medium hover:bg-[#FAFAF8] transition-all">
                          <RefreshCw size={14} />Reconnect
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── PRIVACY & CONSENT TAB ─── */}
      {activeTab === 'privacy' && (
        <div className="space-y-6">
          {/* Data controls */}
          <div className="bg-white rounded-2xl p-6 border border-[#E8E4DF]">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-[#FAFAF8] flex items-center justify-center">
                <Shield size={16} className="text-[#6B6B6B]" />
              </div>
              <div>
                <h2 className="font-geist font-semibold text-sm text-[#111111]">Data & privacy controls</h2>
                <p className="text-[11px] text-[#6B6B6B]">Manage how Populr uses your audience data</p>
              </div>
            </div>
            <div className="space-y-1">
              {[
                { key: 'storeConversations' as const, label: 'Store conversation history', desc: 'Keep DM history for relationship tracking and Smart Reply suggestions' },
                { key: 'useAiAnalysis' as const, label: 'Use AI intent analysis', desc: 'Allow AI to classify contact intent from messages and engagement patterns' },
                { key: 'shareAnonymized' as const, label: 'Share anonymized insights', desc: 'Contribute to platform improvement — no personal data is ever shared' },
                { key: 'autoDeleteInactive' as const, label: 'Auto-delete inactive contacts', desc: `Remove contacts with no activity after ${privacySettings.dataRetentionDays} days` },
              ].map(setting => (
                <div key={setting.key} className="flex items-center justify-between py-4 border-b border-[#E8E4DF] last:border-0">
                  <div className="pr-4">
                    <p className="text-[13px] text-[#111111]">{setting.label}</p>
                    <p className="text-[11px] text-[#6B6B6B] mt-0.5">{setting.desc}</p>
                  </div>
                  <button
                    onClick={() => updatePrivacySetting(setting.key, !privacySettings[setting.key])}
                    className={`w-10 h-6 rounded-full relative transition-all shrink-0 ${privacySettings[setting.key] ? 'bg-chartreuse' : 'bg-[#E8E4DF]'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${privacySettings[setting.key] ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Data retention */}
          <div className="bg-white rounded-2xl p-6 border border-[#E8E4DF]">
            <h2 className="font-geist font-semibold text-sm text-[#111111] mb-4">Data retention</h2>
            <div className="flex items-center gap-3">
              <Clock size={16} className="text-[#6B6B6B]" />
              <div className="flex-1">
                <p className="text-[13px] text-[#111111]">Inactive contact retention period</p>
                <p className="text-[11px] text-[#6B6B6B]">Contacts with no activity will be flagged after this period</p>
              </div>
              <select
                value={privacySettings.dataRetentionDays}
                onChange={e => updatePrivacySetting('dataRetentionDays', parseInt(e.target.value))}
                className="border border-[#E8E4DF] rounded-lg px-3 py-2 text-[12px] text-[#111111] bg-white focus:border-chartreuse focus:ring-2 focus:ring-chartreuse/20 transition-all"
              >
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>1 year</option>
              </select>
            </div>
          </div>

          {/* Consent info */}
          <div className="bg-white rounded-2xl p-6 border border-[#E8E4DF]">
            <h2 className="font-geist font-semibold text-sm text-[#111111] mb-4">Consent information</h2>
            <div className="space-y-3 text-[12px] text-[#6B6B6B] leading-relaxed">
              <p>Populr processes audience data to provide relationship insights, intent scoring, and campaign automation. All processing occurs securely and in compliance with GDPR and CCPA regulations.</p>
              <p>Your contacts' data is never sold or shared with third parties. When you disconnect a platform, historical data is preserved for your records but new data collection stops immediately.</p>
            </div>
          </div>

          {/* Delete imported data */}
          <div className="bg-[#FEE2E2] rounded-2xl p-6 border border-[#FECACA]">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center">
                <Trash2 size={16} className="text-[#DC2626]" />
              </div>
              <div>
                <h2 className="font-geist font-semibold text-sm text-[#DC2626]">Delete imported audience data</h2>
                <p className="text-[11px] text-[#DC2626]/70">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-[12px] text-[#6B6B6B] mb-4">This will remove all imported contacts, conversations, and analytics while preserving your campaigns and account settings.</p>
            <button onClick={() => setConfirmDeleteData(true)}
              className="bg-white text-[#DC2626] border border-[#FECACA] rounded-lg px-4 py-2.5 text-[12px] font-semibold hover:bg-[#FEE2E2] transition-all flex items-center gap-2">
              <Trash2 size={14} />Delete audience data
            </button>
          </div>

          <button onClick={handleSave} className="bg-chartreuse text-[#111111] rounded-[10px] px-6 py-2.5 text-[13px] font-semibold hover:bg-chartreuse-hover transition-all flex items-center gap-2">
            {saved && <Check size={14} />}{saved ? 'Saved!' : 'Save preferences'}
          </button>
        </div>
      )}

      {/* ─── DATA EXPORT TAB ─── */}
      {activeTab === 'data' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-[#E8E4DF]">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-[#FAFAF8] flex items-center justify-center">
                <Download size={16} className="text-[#6B6B6B]" />
              </div>
              <div>
                <h2 className="font-geist font-semibold text-sm text-[#111111]">Export your data</h2>
                <p className="text-[11px] text-[#6B6B6B]">Download your data in CSV or JSON format</p>
              </div>
            </div>
            <div className="space-y-2.5">
              {[
                { key: 'contacts', label: 'All contacts', desc: 'Contacts with intent scores, tags, and relationship data', size: '12 KB' },
                { key: 'campaigns', label: 'Campaign data', desc: 'Campaign performance, conversion metrics, and results', size: '8 KB' },
                { key: 'conversations', label: 'Conversation history', desc: 'All DMs, automated messages, and reply threads', size: '45 KB' },
                { key: 'analytics', label: 'Analytics report', desc: 'Audience analytics and intent distribution', size: '156 KB' },
              ].map(item => (
                <div key={item.key} className="flex items-center gap-4 p-3.5 rounded-xl border border-[#E8E4DF]">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#111111]">{item.label}</p>
                    <p className="text-[11px] text-[#6B6B6B]">{item.desc}</p>
                  </div>
                  <span className="text-[11px] text-[#9B9B8F] flex-shrink-0">{item.size}</span>
                  {exporting === item.key ? (
                    <div className="flex items-center gap-2 text-[11px] text-[#D97706] flex-shrink-0 w-24 justify-end">
                      <Loader2 size={12} className="animate-spin" />Preparing...
                    </div>
                  ) : exportReady === item.key ? (
                    <button onClick={() => { setExportReady(null); showToast('Download started', 'success'); }}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-[#059669] bg-[#E0F5E9] px-3 py-1.5 rounded-lg hover:bg-[#D1FAE5] transition-all flex-shrink-0">
                      <Check size={12} />Download
                    </button>
                  ) : (
                    <button onClick={() => handleExport(item.key)}
                      className="flex items-center gap-1.5 border border-[#E8E4DF] text-[#111111] px-3 py-1.5 rounded-lg text-[11px] font-medium hover:bg-[#FAFAF8] transition-all flex-shrink-0">
                      <Download size={12} />Export
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODALS ─── */}

      {/* Disconnect Confirmation Modal */}
      {disconnectModal && (() => {
        const acc = accounts.find((a: ConnectedAccount) => a.id === disconnectModal);
        if (!acc) return null;
        const isDisconnecting = disconnecting === disconnectModal;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl w-full max-w-[440px] shadow-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#FEE2E2] flex items-center justify-center">
                  <AlertTriangle size={20} className="text-[#DC2626]" />
                </div>
                <h3 className="font-geist font-bold text-base text-[#111111] capitalize">Disconnect {acc.platform}?</h3>
              </div>
              <div className="bg-[#FAFAF8] rounded-xl p-4 mb-5 space-y-2">
                <p className="text-[12px] text-[#6B6B6B]">Historical opportunities and conversations will <span className="font-semibold text-[#111111]">remain visible</span>.</p>
                <p className="text-[12px] text-[#6B6B6B]">Populr will <span className="font-semibold text-[#DC2626]">stop syncing</span> new engagement from this account.</p>
              </div>
              <div className="flex gap-2.5">
                <button onClick={() => setDisconnectModal(null)} disabled={isDisconnecting}
                  className="flex-1 border border-[#E8E4DF] text-[#111111] rounded-[10px] py-2.5 text-[13px] font-medium hover:bg-[#FAFAF8] transition-all disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={() => handleDisconnect(disconnectModal)} disabled={isDisconnecting}
                  className="flex-1 bg-[#DC2626] text-white rounded-[10px] py-2.5 text-[13px] font-semibold hover:bg-[#B91C1C] transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                  {isDisconnecting && <Loader2 size={14} className="animate-spin" />}
                  {isDisconnecting ? 'Disconnecting...' : 'Disconnect account'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Confirm Delete Audience Data Modal */}
      {confirmDeleteData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-[440px] shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#FEE2E2] flex items-center justify-center">
                <AlertTriangle size={20} className="text-[#DC2626]" />
              </div>
              <h3 className="font-geist font-bold text-base text-[#DC2626]">Delete all audience data?</h3>
            </div>
            <div className="bg-[#FAFAF8] rounded-xl p-4 mb-5 space-y-2">
              <p className="text-[12px] text-[#6B6B6B]">All imported contacts, conversations, and analytics will be <span className="font-semibold text-[#DC2626]">permanently deleted</span>.</p>
              <p className="text-[12px] text-[#6B6B6B]">Your campaigns and account settings will be preserved.</p>
              <p className="text-[12px] text-[#6B6B6B]">Connected platforms will remain linked but data collection will pause.</p>
            </div>
            <div className="flex gap-2.5">
              <button onClick={() => setConfirmDeleteData(false)}
                className="flex-1 border border-[#E8E4DF] text-[#111111] rounded-[10px] py-2.5 text-[13px] font-medium hover:bg-[#FAFAF8] transition-all">
                Cancel
              </button>
              <button onClick={() => { deleteAudienceData(); setConfirmDeleteData(false); showToast('Audience data deleted', 'success'); }}
                className="flex-1 bg-[#DC2626] text-white rounded-[10px] py-2.5 text-[13px] font-semibold hover:bg-[#B91C1C] transition-all">
                Delete all data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Shield, Lock, Monitor, ChevronDown, CreditCard, ShieldCheck, AlertCircle,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';

type Tab = 'profile' | 'notifications' | 'billing' | 'security';

// Notification preferences are UI-only right now — the backend has no
// endpoint that persists them, and the previous rebuild stored them only in
// AppContext state that vanished on refresh. Kept local until there's a real
// persistence surface, rather than pretending the toggles save.
type NotificationKey = 'push' | 'email' | 'weeklySummary';

export default function SettingsPage() {
  const { showToast, accounts } = useApp();
  const [notificationSettings, setNotificationSettings] = useState<Record<NotificationKey, boolean>>({
    push: true, email: true, weeklySummary: false,
  });
  const updateNotificationSetting = (key: NotificationKey, value: boolean) =>
    setNotificationSettings(prev => ({ ...prev, [key]: value }));

  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [mobileTabsOpen, setMobileTabsOpen] = useState(false);

  // Creator identity comes from the connected account the backend returned —
  // this app has no separate user/profile endpoint.
  const primaryAccount = accounts.find(a => a.is_connected) ?? accounts[0] ?? null;

  const comingSoon = (label: string) => showToast(`${label} isn't available yet`, 'info');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'profile', label: 'Profile' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'billing', label: 'Billing' },
    { key: 'security', label: 'Security' },
  ];

  const activeLabel = tabs.find(t => t.key === activeTab)?.label || 'Profile';

  return (
    <div className="p-6 lg:p-8 max-w-[900px] mx-auto">
      <PageHeader title="Settings" subtitle="Manage your profile, preferences, and account settings." />

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
            {primaryAccount ? (
              <div className="flex items-center gap-4">
                {primaryAccount.avatar_url ? (
                  <img src={primaryAccount.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-[#FAFAF8] flex items-center justify-center text-[20px] font-semibold text-[#9B9B8F]">
                    {(primaryAccount.display_name || primaryAccount.username || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-geist font-bold text-base text-[#111111]">{primaryAccount.display_name || primaryAccount.username}</p>
                  {primaryAccount.username && <p className="text-[13px] text-[#6B6B6B]">@{primaryAccount.username}</p>}
                  <p className="text-[11px] text-[#9B9B8F] mt-1 capitalize">{primaryAccount.platform}</p>
                </div>
              </div>
            ) : (
              <div className="bg-[#FAFAF8] rounded-xl p-4 flex items-start gap-3">
                <AlertCircle size={16} className="text-[#D97706] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-semibold text-[#111111]">No account connected yet</p>
                  <p className="text-[12px] text-[#6B6B6B] mt-1">Connect an account from Channels to see your creator identity here.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── NOTIFICATIONS TAB ─── */}
      {activeTab === 'notifications' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-[#E8E4DF]">
            <h2 className="font-geist font-semibold text-sm text-[#111111] mb-1">Preferences</h2>
            <p className="text-[12px] text-[#6B6B6B] mb-4">Control how and when Populr shows up for you.</p>
            <div className="space-y-1">
              {[
                { key: 'email' as const, label: 'Email notifications', desc: 'Get updates on replies, leads, and more.' },
                { key: 'push' as const, label: 'Push notifications', desc: 'Receive important alerts in your browser.' },
                { key: 'weeklySummary' as const, label: 'Weekly summary', desc: 'A recap of your automations and performance.' },
              ].map(setting => (
                <div key={setting.key} className="flex items-center justify-between py-4 border-b border-[#E8E4DF] last:border-0">
                  <div className="pr-4">
                    <p className="text-[13px] text-[#111111]">{setting.label}</p>
                    <p className="text-[11px] text-[#6B6B6B] mt-0.5">{setting.desc}</p>
                  </div>
                  <button
                    onClick={() => updateNotificationSetting(setting.key, !notificationSettings[setting.key])}
                    className={`w-10 h-6 rounded-full relative transition-all shrink-0 ${notificationSettings[setting.key] ? 'bg-chartreuse' : 'bg-[#E8E4DF]'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${notificationSettings[setting.key] ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── BILLING TAB ─── */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-[#E8E4DF]">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-[#FAFAF8] flex items-center justify-center">
                <CreditCard size={16} className="text-[#6B6B6B]" />
              </div>
              <div>
                <h2 className="font-geist font-semibold text-sm text-[#111111]">Manage your plan, payments, and invoices</h2>
              </div>
            </div>

            <div className="bg-[#FAFAF8] rounded-xl p-4 flex items-start gap-3">
              <AlertCircle size={16} className="text-[#D97706] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-[#111111]">Billing isn&apos;t set up yet</p>
                <p className="text-[12px] text-[#6B6B6B] mt-1">There's no plan, payment method, or invoices to show — this account isn't on a paid plan.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── SECURITY TAB ─── */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-[#E8E4DF]">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-[#FAFAF8] flex items-center justify-center">
                <Shield size={16} className="text-[#6B6B6B]" />
              </div>
              <div>
                <h2 className="font-geist font-semibold text-sm text-[#111111]">Keep your account secure</h2>
                <p className="text-[11px] text-[#6B6B6B]">Manage your password, active sessions, and two-factor authentication.</p>
              </div>
            </div>

            <div className="flex items-center justify-between py-3 border-t border-[#E8E4DF]">
              <div className="flex items-center gap-3">
                <Lock size={15} className="text-[#9B9B8F]" />
                <p className="text-[13px] text-[#111111]">Password</p>
              </div>
              <button onClick={() => comingSoon('Changing your password')} className="text-[12px] font-medium text-[#6B6B6B] hover:text-[#111111]">Change password</button>
            </div>
            <div className="flex items-center justify-between py-3 border-t border-[#E8E4DF]">
              <div className="flex items-center gap-3">
                <Monitor size={15} className="text-[#9B9B8F]" />
                <p className="text-[13px] text-[#111111]">Active sessions</p>
              </div>
              <button onClick={() => comingSoon('Managing sessions')} className="text-[12px] font-medium text-[#6B6B6B] hover:text-[#111111]">Manage sessions</button>
            </div>
            <div className="flex items-center justify-between py-3 border-t border-[#E8E4DF]">
              <div className="flex items-center gap-3">
                <ShieldCheck size={15} className="text-[#9B9B8F]" />
                <p className="text-[13px] text-[#111111]">Two-factor authentication</p>
              </div>
              <button onClick={() => comingSoon('Two-factor authentication')} className="text-[12px] font-medium text-[#6B6B6B] hover:text-[#111111]">Enable 2FA</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

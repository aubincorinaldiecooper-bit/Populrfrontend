import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { automations, campaigns } from '../data';
import type { Automation } from '../data';
import {
  Search, Play, Pause, Zap, ArrowLeft, Lightbulb, Plus,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import EmptyState from '../components/EmptyState';

type StatusTab = 'all' | 'active' | 'drafts' | 'paused' | 'needs-attention';

function getInsight(a: Automation): string {
  if (a.name.toLowerCase().includes('alert') || a.humanReview) {
    return a.humanHandoffs > 0 ? `${a.humanHandoffs} high-intent contacts need a response` : 'Monitoring for high-intent signals';
  }
  if (a.conversions > 0 && a.contactsReached > 0) {
    return `${Math.round((a.conversions / a.contactsReached) * 100)}% of reached contacts converted`;
  }
  if (a.replies > 0 && a.messagesSent > 0) {
    return `${Math.round((a.replies / a.messagesSent) * 100)}% reply rate`;
  }
  return 'Not enough data yet';
}

function getCompactMetrics(a: Automation): string {
  if (a.name.toLowerCase().includes('alert') || a.humanReview) {
    return `${a.contactsReached} alerts · ${a.humanHandoffs} human handoffs · ${a.replies} responses`;
  }
  if (a.name.toLowerCase().includes('follow-up')) {
    return `${a.contactsReached} reached · ${a.messagesSent} sent · ${a.conversions} conversions`;
  }
  return `${a.contactsReached} reached · ${a.messagesSent} sent · ${a.replies} replies · ${a.messagesSent > 0 ? Math.round((a.replies / a.messagesSent) * 100) : 0}% rate`;
}

export default function AutomationsPage() {
  const navigate = useNavigate();
  const { showToast } = useApp();
  const [autoList, setAutoList] = useState(automations);
  const [detailAuto, setDetailAuto] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');

  const active = autoList.filter(a => a.status === 'active');
  const paused = autoList.filter(a => a.status === 'paused');
  const drafts = autoList.filter(a => a.status === 'draft');

  const filtered = useMemo(() => {
    let result = [...autoList];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a => a.name.toLowerCase().includes(q) || a.trigger.toLowerCase().includes(q));
    }
    if (statusTab !== 'all') {
      if (statusTab === 'active') result = result.filter(a => a.status === 'active');
      if (statusTab === 'paused') result = result.filter(a => a.status === 'paused');
      if (statusTab === 'drafts') result = result.filter(a => a.status === 'draft');
      if (statusTab === 'needs-attention') result = result.filter(a => a.humanHandoffs > 0 || a.status === 'paused');
    }
    return result;
  }, [autoList, search, statusTab]);

  const toggleStatus = (id: string) => {
    setAutoList(prev => prev.map(a => a.id === id ? { ...a, status: a.status === 'active' ? 'paused' : 'active' as const } : a));
    showToast('Status updated', 'success');
  };

  const handleEdit = (auto: Automation) => navigate('/automations/new', { state: { automation: auto } });

  // Detail view
  const detail = detailAuto ? autoList.find(a => a.id === detailAuto) : null;
  if (detail) {
    const insight = getInsight(detail);
    const campaign = campaigns.find(c => c.name === detail.connectedCampaign);

    return (
      <div className="pop-page max-w-[900px]">
        <button onClick={() => setDetailAuto(null)} className="pop-btn-ghost mb-5">
          <ArrowLeft size={16} />Back to automations
        </button>

        <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <StatusPill status={detail.status} />
              {detail.humanReview && <StatusPill status="human-review" />}
            </div>
            <h1 className="pop-section-heading">{detail.name}</h1>
            <p className="pop-body mt-1">{detail.trigger} → {detail.action}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => handleEdit(detail)} className="pop-btn-primary">
              <Zap size={14} />Edit
            </button>
            <button onClick={() => toggleStatus(detail.id)}
              className={detail.status === 'active' ? 'pop-btn-tertiary' : 'pop-btn-primary'}>
              {detail.status === 'active' ? <><Pause size={14} />Pause</> : <><Play size={14} />Resume</>}
            </button>
          </div>
        </div>

        {campaign && (
          <div className="pop-card p-4 mb-5 flex items-center gap-3 cursor-pointer pop-card-hover">
            <Zap size={18} className="text-[#D97706]" />
            <div className="flex-1">
              <p className="pop-meta">Connected campaign</p>
              <p className="text-[13px] font-semibold text-[#111111]">{campaign.name}</p>
            </div>
            <StatusPill status={campaign.status} />
          </div>
        )}

        <div className="pop-card p-5 mb-5">
          <h2 className="pop-card-title mb-4">Performance</h2>
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Reached', value: detail.contactsReached },
              { label: 'Sent', value: detail.messagesSent },
              { label: 'Replies', value: detail.replies },
              { label: 'Clicks', value: detail.clicks },
            ].map(m => (
              <div key={m.label} className="text-center">
                <p className="font-geist-mono font-bold text-lg text-[#111111]">{m.value}</p>
                <p className="text-[10px] text-[#9B9B8F] tracking-wide">{m.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#FFFDF5] rounded-xl p-4 mb-5 flex items-start gap-3">
          <Lightbulb size={18} className="text-[#D97706] flex-shrink-0 mt-0.5" />
          <p className="text-[14px] text-[#111111]">{insight}</p>
        </div>
      </div>
    );
  }

  // List view — compact horizontal rows
  return (
    <div className="pop-page">
      <PageHeader
        title="Automations"
        subtitle={`${active.length} active · ${autoList.length} total`}
        action={
          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
            <div className="relative w-full sm:w-auto">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9B9B8F]" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search automations..."
                className="pop-search w-full sm:w-56" />
            </div>
            <button onClick={() => navigate('/automations/new')} className="pop-btn-primary w-full sm:w-auto justify-center">
              <Plus size={14} strokeWidth={2.5} />Create automation
            </button>
          </div>
        }
      />

      {/* Status tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto pb-1">
        {[
          { key: 'all' as StatusTab, label: 'All', count: autoList.length },
          { key: 'active' as StatusTab, label: 'Active', count: active.length },
          { key: 'drafts' as StatusTab, label: 'Drafts', count: drafts.length },
          { key: 'paused' as StatusTab, label: 'Paused', count: paused.length },
          { key: 'needs-attention' as StatusTab, label: 'Needs attention', count: autoList.filter(a => a.humanHandoffs > 0 || a.status === 'paused').length },
        ].map(t => (
          <button key={t.key} onClick={() => setStatusTab(t.key)}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-medium whitespace-nowrap transition-all ${statusTab === t.key ? 'bg-[#111111] text-white' : 'text-[#6B6B6B] hover:bg-white'}`}>
            {t.label} <span className="text-[10px] opacity-60">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Compact automation list */}
      {filtered.length === 0 ? (
        <EmptyState icon="automations" title="No automations found" description="Create automations to respond to engagement automatically." action={<button onClick={() => navigate('/automations/new')} className="pop-btn-primary">Create automation</button>} />
      ) : (
        <div className="space-y-3">
          {filtered.map(a => {
            const campaign = campaigns.find(c => c.name === a.connectedCampaign);
            const metricsText = getCompactMetrics(a);
            return (
              <div key={a.id} className="pop-card p-4 pop-card-hover cursor-pointer" onClick={() => setDetailAuto(a.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${a.status === 'active' ? 'bg-chartreuse' : 'bg-[#FAFAF8]'}`}>
                      {a.status === 'active' ? <Zap size={18} className="text-[#111111]" /> : <Pause size={18} className="text-[#6B6B6B]" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-geist font-semibold text-[13px] text-[#111111] truncate">{a.name}</h3>
                        <StatusPill status={a.status} className="text-[10px]" />
                        {a.humanReview && <StatusPill status="human-review" className="text-[10px]" />}
                      </div>
                      <p className="text-[11px] text-[#6B6B6B] mt-0.5">{a.trigger} → {a.action}</p>
                      {campaign && <p className="text-[10px] text-[#9B9B8F] mt-0.5">{campaign.name}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={e => { e.stopPropagation(); handleEdit(a); }} className="p-2 hover:bg-[#FAFAF8] rounded-lg transition-all" title="Edit">
                      <Zap size={14} className="text-[#6B6B6B]" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); toggleStatus(a.id); }} className="p-2 hover:bg-[#FAFAF8] rounded-lg transition-all">
                      {a.status === 'active' ? <Pause size={14} className="text-[#6B6B6B]" /> : <Play size={14} className="text-[#10B981]" />}
                    </button>
                  </div>
                </div>
                {/* Compact metrics in one line */}
                <div className="mt-2 pt-2 border-t border-[#F0EEEA] flex items-center justify-between">
                  <p className="text-[11px] text-[#9B9B8F]">{metricsText}</p>
                  <span className="text-[10px] text-[#9B9B8F]">{a.lastEdited}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

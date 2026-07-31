import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import {
  Plus, Play, Pause, Search, Megaphone, ArrowRight,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import EmptyState from '../components/EmptyState';

type StatusTab = 'active' | 'drafts' | 'completed';

/* ─── Shared Campaign Row ──────────────────────────────── */
function CampaignRow({
  campaign, onToggle, onEdit,
}: {
  campaign: typeof campaigns[0]; onToggle: () => void; onEdit: () => void;
}) {
  return (
    <div className="pop-card p-4 pop-card-hover cursor-pointer" onClick={onEdit}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${campaign.status === 'active' ? 'bg-chartreuse' : 'bg-[#FAFAF8]'}`}>
            <Megaphone size={18} className={campaign.status === 'active' ? 'text-[#111111]' : 'text-[#6B6B6B]'} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-geist font-semibold text-[13px] text-[#111111] truncate">{campaign.name}</h3>
              <StatusPill status={campaign.status} className="text-[10px]" />
            </div>
            <p className="text-[11px] text-[#6B6B6B] mt-0.5">{campaign.goal} · {campaign.platform}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-3 mr-2 text-[11px] text-[#6B6B6B]">
            <span>{campaign.discovered} reached</span>
            <span>{campaign.conversions} conv.</span>
            <span>{campaign.clicks} clicks</span>
          </div>
          <button onClick={e => { e.stopPropagation(); onEdit(); }} className="p-2 hover:bg-[#FAFAF8] rounded-lg transition-all" title="Edit">
            <ArrowRight size={14} className="text-[#6B6B6B]" />
          </button>
          <button onClick={e => { e.stopPropagation(); onToggle(); }} className="p-2 hover:bg-[#FAFAF8] rounded-lg transition-all">
            {campaign.status === 'active' ? <Pause size={14} className="text-[#6B6B6B]" /> : <Play size={14} className="text-[#10B981]" />}
          </button>
        </div>
      </div>
    </div>
  );
}

import { campaigns } from '../data';

export default function CampaignsPage() {
  const navigate = useNavigate();
  const { showToast } = useApp();
  const [campaignList, setCampaignList] = useState(campaigns);
  const [tab, setTab] = useState<StatusTab>('active');
  const [search, setSearch] = useState('');

  const toggleStatus = (id: string) => {
    setCampaignList(prev => prev.map(c => c.id === id ? { ...c, status: c.status === 'active' ? 'paused' : 'active' as const } : c));
    showToast('Status updated', 'success');
  };

  const handleEdit = (campaignId: string) => {
    const campaign = campaignList.find(c => c.id === campaignId);
    if (campaign) navigate('/campaigns/new', { state: { editCampaign: campaign } });
  };

  const filtered = campaignList.filter(c => {
    if (search) {
      const q = search.toLowerCase();
      if (!c.name.toLowerCase().includes(q) && !c.goal.toLowerCase().includes(q)) return false;
    }
    if (tab === 'active') return c.status === 'active' || c.status === 'paused';
    if (tab === 'drafts') return c.status === 'draft';
    if (tab === 'completed') return c.status === 'completed';
    return true;
  });

  const counts = {
    active: campaignList.filter(c => c.status === 'active' || c.status === 'paused').length,
    drafts: campaignList.filter(c => c.status === 'draft').length,
    completed: campaignList.filter(c => c.status === 'completed').length,
  };

  return (
    <div className="pop-page">
      <PageHeader
        title="Campaigns"
        subtitle="Reach the audiences Populr has identified for you."
        action={
          <Link to="/campaigns/new" className="pop-btn-primary">
            <Plus size={14} strokeWidth={2.5} />Create campaign
          </Link>
        }
      />

      {/* Search + Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-5">
        <div className="relative w-full sm:max-w-[280px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9B9B8F]" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search campaigns..."
            className="pop-search w-full" />
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1 w-full sm:w-auto">
          {([
            { key: 'active' as StatusTab, label: 'Active', count: counts.active },
            { key: 'drafts' as StatusTab, label: 'Drafts', count: counts.drafts },
            { key: 'completed' as StatusTab, label: 'Completed', count: counts.completed },
          ]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-medium whitespace-nowrap transition-all ${tab === t.key ? 'bg-[#111111] text-white' : 'text-[#6B6B6B] hover:bg-white'}`}>
              {t.label} <span className="text-[10px] opacity-60">({t.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Empty states */}
      {filtered.length === 0 && tab === 'active' && !search && (
        <EmptyState
          icon="campaigns"
          title="No active campaigns"
          description="Reach your first audience. Start from an opportunity Populr has identified."
          action={<Link to="/opportunities" className="pop-btn-primary">View opportunities</Link>}
        />
      )}
      {filtered.length === 0 && tab === 'drafts' && !search && (
        <EmptyState
          icon="campaigns"
          title="No drafts"
          description="Save a campaign as a draft while building it."
          action={<Link to="/campaigns/new" className="pop-btn-primary">Create campaign</Link>}
        />
      )}
      {filtered.length === 0 && tab === 'completed' && !search && (
        <EmptyState
          icon="campaigns"
          title="No completed campaigns"
          description="Completed campaigns will appear here."
        />
      )}
      {filtered.length === 0 && search && (
        <EmptyState icon="campaigns" title="No campaigns found" description="Try a different search." />
      )}

      {/* Campaign list */}
      {filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map(c => (
            <CampaignRow
              key={c.id}
              campaign={c}
              onToggle={() => toggleStatus(c.id)}
              onEdit={() => handleEdit(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

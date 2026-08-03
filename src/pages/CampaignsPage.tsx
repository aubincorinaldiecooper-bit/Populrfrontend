import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Plus, Play, Pause, Search, Megaphone, ArrowRight,
} from 'lucide-react';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { useApp } from '../context/AppContext';
import { campaigns } from '../data';
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
    <ClickableCard label={`${campaign.name} campaign`} padding={4} className="pop-card-hover" onClick={onEdit}>
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
          <Button variant="ghost" size="sm" isIconOnly icon={<ArrowRight size={14} />} label="Edit" onClick={onEdit} />
          <Button
            variant="ghost" size="sm" isIconOnly
            icon={campaign.status === 'active' ? <Pause size={14} /> : <Play size={14} className="text-[#10B981]" />}
            label={campaign.status === 'active' ? 'Pause' : 'Resume'}
            onClick={onToggle}
          />
        </div>
      </div>
    </ClickableCard>
  );
}

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
          <Button label="Create campaign" variant="primary" icon={<Plus size={14} strokeWidth={2.5} />} onClick={() => navigate('/campaigns/new')} />
        }
      />

      {/* Search + Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-5">
        <TextInput
          label="Search campaigns" isLabelHidden value={search} onChange={setSearch}
          placeholder="Search campaigns..." startIcon={<Search size={16} />}
          className="w-full sm:max-w-[280px]"
        />
        <div className="overflow-x-auto w-full sm:w-auto">
          <TabList value={tab} onChange={v => setTab(v as StatusTab)}>
            <Tab value="active" label="Active" endContent={<span className="text-[10px] opacity-60">{counts.active}</span>} />
            <Tab value="drafts" label="Drafts" endContent={<span className="text-[10px] opacity-60">{counts.drafts}</span>} />
            <Tab value="completed" label="Completed" endContent={<span className="text-[10px] opacity-60">{counts.completed}</span>} />
          </TabList>
        </div>
      </div>

      {/* Empty states */}
      {filtered.length === 0 && tab === 'active' && !search && (
        <EmptyState
          icon="campaigns"
          title="No active campaigns"
          description="Reach your first audience. Start from an opportunity Populr has identified."
          action={<Button label="View opportunities" variant="primary" onClick={() => navigate('/opportunities')} />}
        />
      )}
      {filtered.length === 0 && tab === 'drafts' && !search && (
        <EmptyState
          icon="campaigns"
          title="No drafts"
          description="Save a campaign as a draft while building it."
          action={<Button label="Create campaign" variant="primary" onClick={() => navigate('/campaigns/new')} />}
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

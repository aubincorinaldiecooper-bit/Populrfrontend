import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { segments, aiSegments } from '../data';
import type { Segment, AISegment } from '../data';
import {
  Search, Plus, Sparkles, ChevronLeft,
} from 'lucide-react';
import PlatformDot from '../components/PlatformDot';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';

// Semantic color maps matching ContactsPage
const relationshipColors: Record<string, { bg: string; text: string }> = {
  'warm': { bg: 'bg-[#E0F5E9]', text: 'text-[#059669]' },
  'warm fan': { bg: 'bg-[#E0F5E9]', text: 'text-[#059669]' },
  'ready': { bg: 'bg-[#FFF3E0]', text: 'text-[#D97706]' },
  'ready to convert': { bg: 'bg-[#FFF3E0]', text: 'text-[#D97706]' },
  'engaged': { bg: 'bg-[#EFF6FF]', text: 'text-[#3B82F6]' },
  'new': { bg: 'bg-[#F3F4F6]', text: 'text-[#6B7280]' },
  'subscriber': { bg: 'bg-[#E0F5E9]', text: 'text-[#059669]' },
  'high-value': { bg: 'bg-[#FFF3E0]', text: 'text-[#D97706]' },
  'at-risk': { bg: 'bg-[#FEE2E2]', text: 'text-[#DC2626]' },
};

const intentColors: Record<string, { bg: string; text: string }> = {
  'conversion': { bg: 'bg-[#FEE2E2]', text: 'text-[#DC2626]' },
  'strong offer intent': { bg: 'bg-[#FEE2E2]', text: 'text-[#DC2626]' },
  'pricing': { bg: 'bg-[#FFF3E0]', text: 'text-[#D97706]' },
  'collaboration': { bg: 'bg-[#EFF6FF]', text: 'text-[#3B82F6]' },
  'support': { bg: 'bg-[#F3F4F6]', text: 'text-[#6B7280]' },
  'engagement': { bg: 'bg-[#E0F5E9]', text: 'text-[#059669]' },
  'casual': { bg: 'bg-[#F3F4F6]', text: 'text-[#6B7280]' },
  'product-interest': { bg: 'bg-[#FFF3E0]', text: 'text-[#D97706]' },
  'booking': { bg: 'bg-[#E0F5E9]', text: 'text-[#059669]' },
  'subscription': { bg: 'bg-[#EFF6FF]', text: 'text-[#3B82F6]' },
  'human-review': { bg: 'bg-[#FEE2E2]', text: 'text-[#DC2626]' },
};

const stageColors: Record<string, { bg: string; text: string }> = {
  'discovered': { bg: 'bg-[#F3F4F6]', text: 'text-[#6B7280]' },
  'engaged': { bg: 'bg-[#EFF6FF]', text: 'text-[#3B82F6]' },
  'interested': { bg: 'bg-[#FFF3E0]', text: 'text-[#D97706]' },
  'converted': { bg: 'bg-[#E0F5E9]', text: 'text-[#059669]' },
};

function StatusBadge({ type, value }: { type: 'relationship' | 'intent' | 'stage'; value: string }) {
  const colors = type === 'relationship' ? relationshipColors[value] || relationshipColors['new']
    : type === 'intent' ? intentColors[value] || intentColors['casual']
    : stageColors[value] || stageColors['discovered'];

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium ${colors.bg} ${colors.text}`}>
      {value.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
    </span>
  );
}

export default function SegmentsPage() {
  const { contacts, openContactDrawer } = useApp();
  const [search, setSearch] = useState('');
  const [selectedSegment, setSelectedSegment] = useState<{ type: 'saved' | 'ai'; id: string; name: string } | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);

  // Filter segments by search
  const filteredSaved = useMemo(() => {
    if (!search) return segments;
    return segments.filter((s: Segment) => s.name.toLowerCase().includes(search.toLowerCase()));
  }, [search]);

  const filteredAI = useMemo(() => {
    if (!search) return aiSegments;
    return aiSegments.filter((s: AISegment) => s.name.toLowerCase().includes(search.toLowerCase()));
  }, [search]);

  // Get contacts for selected segment
  const segmentContacts = useMemo(() => {
    if (!selectedSegment) return [];
    if (selectedSegment.type === 'ai') {
      const seg = aiSegments.find(s => s.id === selectedSegment.id);
      if (!seg) return [];
      return contacts.filter(c => seg.contactIds.includes(c.id));
    }
    const seg = segments.find(s => s.id === selectedSegment.id);
    if (!seg) return [];
    return contacts.filter(seg.filter);
  }, [selectedSegment, contacts]);

  // Segment detail view
  if (showBuilder) {
    return (
      <div className="p-6 lg:p-8 max-w-[700px] mx-auto">
        <button onClick={() => setShowBuilder(false)}
          className="text-[13px] text-[#6B6B6B] hover:text-[#111111] mb-5 flex items-center gap-1.5 transition-colors">
          <ChevronLeft size={16} />Back to segments
        </button>
        <h2 className="font-geist font-bold text-xl text-[#111111] mb-1">Create segment</h2>
        <p className="text-[13px] text-[#6B6B6B] mb-6">Define rules to automatically group contacts</p>

        <div className="space-y-4">
          <div>
            <label className="text-[12px] font-medium text-[#111111] mb-1 block">Segment name</label>
            <input type="text" placeholder="e.g., High-intent Instagram followers"
              className="w-full border border-[#E8E4DF] rounded-xl px-4 py-3 text-[13px] placeholder:text-[#9B9B8F] focus:border-chartreuse focus:ring-2 focus:ring-chartreuse/20 transition-all" />
          </div>

          <div>
            <label className="text-[12px] font-medium text-[#111111] mb-2 block">Match conditions</label>
            <div className="space-y-2">
              {[
                { field: 'Platform', options: ['Instagram', 'TikTok', 'YouTube', 'Twitter'] },
                { field: 'Intent', options: ['Conversion', 'Pricing', 'Collaboration', 'Support', 'Engagement'] },
                { field: 'Relationship', options: ['Warm', 'Ready', 'Engaged', 'New', 'At-risk'] },
                { field: 'Stage', options: ['Discovered', 'Engaged', 'Interested', 'Converted'] },
              ].map(condition => (
                <div key={condition.field} className="flex items-center gap-2">
                  <select className="border border-[#E8E4DF] rounded-lg px-3 py-2 text-[12px] text-[#111111] bg-white">
                    <option>{condition.field}</option>
                  </select>
                  <select className="border border-[#E8E4DF] rounded-lg px-3 py-2 text-[12px] text-[#111111] bg-white">
                    <option>is</option>
                    <option>is not</option>
                  </select>
                  <select className="border border-[#E8E4DF] rounded-lg px-3 py-2 text-[12px] text-[#111111] bg-white flex-1">
                    <option>Any</option>
                    {condition.options.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button onClick={() => { setShowBuilder(false); }}
              className="flex-1 bg-chartreuse text-[#111111] rounded-[10px] py-2.5 text-[13px] font-semibold hover:bg-chartreuse-hover transition-all">
              Create segment
            </button>
            <button onClick={() => setShowBuilder(false)}
              className="flex-1 border border-[#E8E4DF] text-[#111111] rounded-[10px] py-2.5 text-[13px] font-medium hover:bg-[#FAFAF8] transition-all">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (selectedSegment) {
    return (
      <div className="pop-page">
        <button onClick={() => setSelectedSegment(null)}
          className="text-[13px] text-[#6B6B6B] hover:text-[#111111] mb-5 flex items-center gap-1.5 transition-colors">
          <ChevronLeft size={16} />Back to segments
        </button>

        <PageHeader
          title={selectedSegment.name}
          subtitle={`${segmentContacts.length} contacts in this segment`}
          action={
            <div className="flex items-center gap-2">
              <div className="relative hidden sm:block">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9B9B8F]" />
                <input type="text" placeholder="Search contacts..."
                  className="w-48 bg-white border border-[#E8E4DF] rounded-[10px] pl-9 pr-3 py-2 text-[13px] placeholder:text-[#9B9B8F] focus:border-chartreuse focus:ring-2 focus:ring-chartreuse/20 transition-all" />
              </div>
            </div>
          }
        />

        {segmentContacts.length === 0 ? (
          <EmptyState icon="contacts" title="No contacts in this segment" description="This segment doesn't have any matching contacts yet." />
        ) : (
          <div className="bg-white rounded-2xl border border-[#E8E4DF] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr className="border-b border-[#E8E4DF]">
                    {[
                      { key: 'name', label: 'NAME', width: 260 },
                      { key: 'platform', label: 'PLATFORM', width: 140 },
                      { key: 'relationship', label: 'RELATIONSHIP', width: 140 },
                      { key: 'intent', label: 'INTENT', width: 140 },
                      { key: 'stage', label: 'STAGE', width: 120 },
                      { key: 'lastActive', label: 'LAST ACTIVE', width: 110 },
                    ].map(col => (
                      <th key={col.key} style={{ width: col.width }} className="px-4 py-3 text-left">
                        <span className="text-[11px] font-medium text-[#9B9B8F] uppercase tracking-wider whitespace-nowrap">{col.label}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {segmentContacts.map(contact => (
                    <tr key={contact.id} onClick={() => openContactDrawer(contact.id, 'contacts')}
                      className="border-b border-[#F0EEEA] last:border-0 hover:bg-[#FAFAF8] transition-colors cursor-pointer group">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <img src={contact.avatar} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-[#111111] truncate">{contact.handle}</p>
                            <p className="text-[11px] text-[#9B9B8F] truncate">{contact.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <PlatformDot platform={contact.platform} />
                          <span className="text-[12px] text-[#6B6B6B] capitalize">{contact.platform}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge type="relationship" value={contact.relationship === 'warm' ? 'warm fan' : contact.relationship === 'ready' ? 'ready to convert' : contact.relationship} />
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge type="intent" value={contact.intent === 'conversion' ? 'strong offer intent' : contact.intent} />
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge type="stage" value={contact.stage} />
                      </td>
                      <td className="px-4 py-3.5 text-[12px] text-[#9B9B8F]">
                        {contact.recentActions[0]?.time || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Grid view
  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto">
      <PageHeader
        title="Segments"
        subtitle={`${segments.length} saved · ${aiSegments.length} AI-generated`}
        action={
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9B9B8F]" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search segments..."
                className="w-48 bg-white border border-[#E8E4DF] rounded-[10px] pl-9 pr-3 py-2 text-[13px] placeholder:text-[#9B9B8F] focus:border-chartreuse focus:ring-2 focus:ring-chartreuse/20 transition-all" />
            </div>
            <button onClick={() => setShowBuilder(true)}
              className="flex items-center gap-2 bg-chartreuse rounded-[10px] px-4 py-2.5 text-[13px] font-semibold text-[#111111] hover:bg-chartreuse-hover transition-all">
              <Plus size={14} strokeWidth={2.5} />New segment
            </button>
          </div>
        }
      />

      {/* AI-Generated Segments */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={16} className="text-chartreuse" />
          <h3 className="font-geist font-semibold text-sm text-[#111111]">AI-Generated Segments</h3>
          <span className="text-[10px] text-[#9B9B8F]">Review before using</span>
        </div>
        {filteredAI.length === 0 ? (
          <p className="text-[13px] text-[#6B6B6B]">No AI segments match your search.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAI.map((seg: AISegment) => (
              <button key={seg.id} onClick={() => setSelectedSegment({ type: 'ai', id: seg.id, name: seg.name })}
                className="bg-white rounded-2xl p-4 border border-[#E8E4DF] hover:border-chartreuse hover:shadow-card transition-all text-left">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-geist font-semibold text-sm text-[#111111]">{seg.name}</h4>
                  <span className="font-geist-mono font-bold text-lg text-[#111111]">{seg.count}</span>
                </div>
                <p className="text-[11px] text-[#6B6B6B] mb-3">{seg.description}</p>
                <div className="flex flex-wrap gap-1">
                  {seg.contactIds.slice(0, 4).map((cid: string) => {
                    const c = contacts.find(x => x.id === cid);
                    return c ? <img key={cid} src={c.avatar} alt="" className="w-6 h-6 rounded-full" /> : null;
                  })}
                  {seg.contactIds.length > 4 && <span className="text-[10px] text-[#9B9B8F] self-center">+{seg.contactIds.length - 4}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Saved Segments */}
      <div>
        <h3 className="font-geist font-semibold text-sm text-[#111111] mb-3">Saved Segments</h3>
        {filteredSaved.length === 0 ? (
          <p className="text-[13px] text-[#6B6B6B]">No saved segments match your search.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSaved.map(seg => (
              <button key={seg.id} onClick={() => setSelectedSegment({ type: 'saved', id: seg.id, name: seg.name })}
                className="bg-white rounded-2xl p-4 border border-[#E8E4DF] hover:border-[#D4CFC8] hover:shadow-card transition-all text-left">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-geist font-semibold text-sm text-[#111111]">{seg.name}</h4>
                  <span className="font-geist-mono font-bold text-lg text-[#111111]">{seg.count}</span>
                </div>
                <p className="text-[11px] text-[#6B6B6B]">{seg.description}</p>
              </button>
            ))}
            <button onClick={() => setShowBuilder(true)}
              className="border border-dashed border-[#E8E4DF] rounded-2xl p-4 flex flex-col items-center justify-center gap-2 hover:border-[#D4CFC8] hover:bg-[#FAFAF8] transition-all text-[#6B6B6B]">
              <Plus size={20} /><span className="text-[13px] font-medium">Create segment</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

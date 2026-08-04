import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import {
  Search, ArrowLeft, Eye, MessageSquare,
  Megaphone, Zap, Share2, Heart, Send, Sparkles,
  Target, Flame, ArrowRight,
} from 'lucide-react';
import { contentItems, campaigns, contacts } from '../data';
import PlatformDot from '../components/PlatformDot';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import StatusPill from '../components/StatusPill';

export default function ContentPage() {
  const navigate = useNavigate();
  const { openContactDrawer } = useApp();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [detailItem, setDetailItem] = useState<string | null>(null);

  const filtered = contentItems.filter(item => {
    if (search && !item.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter !== 'all' && item.platform !== filter) return false;
    return true;
  });

  const item = detailItem ? contentItems.find(c => c.id === detailItem) : null;

  // ─── CONTENT DETAIL VIEW ─────────────────────────────────
  if (item) {
    const campaign = campaigns.find(c => c.name === item.attachedCampaign);
    const a = item.attribution;
    const engagedContacts = contacts.filter(c => item.engagedContactIds?.includes(c.id));

    const handleStartCampaign = () => {
      navigate('/campaigns/new', {
        state: { fromContent: true, contentId: item.id, contentTitle: item.title, contentThumbnail: item.thumbnail, contentPlatform: item.platform, contentCaption: item.caption },
      });
    };

    return (
      <div className="pop-page max-w-[1100px]">
        <button onClick={() => setDetailItem(null)}
          className="pop-btn-ghost mb-6">
          <ArrowLeft size={16} />Back to content library
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* LEFT: Post Preview */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl overflow-hidden border border-[#E8E4DF] bg-white group">
              <img src={item.thumbnail} alt={item.title} className="w-full aspect-[3/4] object-cover group-hover:scale-[1.02] transition-transform duration-500" />
            </div>
            <div className="pop-card p-4">
              <p className="pop-body text-[12px]">{item.caption}</p>
            </div>
          </div>

          {/* RIGHT: Metrics + Attribution */}
          <div className="lg:col-span-3 space-y-5">
            {/* Header */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <PlatformDot platform={item.platform} />
                <span className="text-[12px] text-[#6B6B6B] capitalize">{item.platform}</span>
                <span className="text-[12px] text-[#9B9B8F]">{item.format}</span>
                <span className="text-[12px] text-[#9B9B8F]">· {item.date}</span>
                {campaign && <StatusPill status={campaign.status} className="text-[9px]" />}
              </div>
              <h1 className="pop-section-heading">{item.title}</h1>
            </div>

            {/* Social Performance */}
            <div className="pop-card p-5">
              <h2 className="pop-card-title mb-4">Social performance</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: Eye, label: 'Views', value: item.views },
                  { icon: Heart, label: 'Likes', value: item.likes },
                  { icon: MessageSquare, label: 'Comments', value: item.comments },
                  { icon: Share2, label: 'Shares', value: item.shares },
                ].map(m => {
                  const Icon = m.icon;
                  return (
                    <div key={m.label} className="text-center bg-[#FAFAF8] rounded-xl p-3">
                      <Icon size={14} className="text-[#9B9B8F] mx-auto mb-1.5" />
                      <p className="font-geist-mono font-bold text-base text-[#111111]">{m.value}</p>
                      <p className="text-[10px] text-[#9B9B8F] tracking-wide">{m.label}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Conversation Performance */}
            <div className="pop-card p-5">
              <h2 className="pop-card-title mb-4">Conversation performance</h2>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Conversations started', value: a.conversationsStarted },
                  { label: 'Replies', value: a.contactsGenerated },
                  { label: 'Destination clicks', value: a.destinationClicks },
                ].map(row => (
                  <div key={row.label} className="text-center bg-[#FAFAF8] rounded-xl p-3">
                    <p className="font-geist-mono font-bold text-base text-[#111111]">{row.value}</p>
                    <p className="text-[10px] text-[#9B9B8F] tracking-wide">{row.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Audience Value Created */}
            <div className="pop-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Target size={16} className="text-[#059669]" />
                <h2 className="pop-card-title">Audience value created</h2>
              </div>

              {/* Post conversion rate — prominent */}
              <div className="flex items-center justify-between bg-[#FFFDF5] rounded-xl px-5 py-4 mb-4">
                <div className="flex items-center gap-2">
                  <Flame size={16} className="text-[#D97706]" />
                  <div>
                    <p className="text-[13px] text-[#111111]">Post conversion rate</p>
                    <p className="text-[11px] text-[#9B9B8F]">{a.campaignConversions} of {a.contactsGenerated} attributed contacts completed the destination action</p>
                  </div>
                </div>
                <span className="font-geist-mono font-bold text-2xl text-[#111111]">{a.conversionRate}</span>
              </div>
            </div>

            {/* Connected Campaign & Automation */}
            {campaign && (
              <div className="pop-card p-5 pop-card-hover cursor-pointer">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Megaphone size={16} className="text-[#D97706]" />
                    <h2 className="pop-card-title">Connected campaign</h2>
                  </div>
                  <StatusPill status={campaign.status} />
                </div>
                <p className="text-[14px] font-semibold text-[#111111]">{campaign.name}</p>
                <p className="text-[12px] text-[#6B6B6B]">{campaign.goal} · {campaign.trigger}</p>
              </div>
            )}

            {item.attachedAutomation && (
              <div className="pop-card p-5 pop-card-hover cursor-pointer" onClick={() => navigate('/automations')}>
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={16} className="text-chartreuse" />
                  <h2 className="pop-card-title">Connected automation</h2>
                </div>
                <p className="text-[14px] font-semibold text-[#111111]">{item.attachedAutomation}</p>
              </div>
            )}

            {/* Attributed Contacts */}
            {engagedContacts.length > 0 && (
              <div className="pop-card p-5">
                <h2 className="pop-card-title mb-3">Users who viewed this post</h2>
                <div className="space-y-2">
                  {engagedContacts.slice(0, 6).map(c => (
                    <button key={c.id} onClick={() => openContactDrawer(c.id, 'dashboard')}
                      className="w-full flex items-center gap-3 bg-[#FAFAF8] rounded-xl p-3 text-left hover:border-[#D4CFC8] transition-all group border border-transparent">
                      <img src={c.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-[#111111]">{c.handle}</p>
                        <p className="text-[10px] text-[#6B6B6B]">{c.name}</p>
                      </div>
                      <StatusPill status={c.intent === 'conversion' ? 'strong offer intent' : c.intent} className="text-[9px]" />
                      <ArrowRight size={12} className="text-[#9B9B8F] group-hover:text-[#111111] transition-colors" />
                    </button>
                  ))}
                  {engagedContacts.length > 6 && (
                    <p className="text-[11px] text-[#9B9B8F] text-center">+{engagedContacts.length - 6} more</p>
                  )}
                </div>
              </div>
            )}

            {/* CTA */}
            {!campaign ? (
              <button onClick={handleStartCampaign} className="pop-btn-primary w-full py-4">
                <Megaphone size={16} />Start campaign from this post
              </button>
            ) : (
              <div className="flex gap-3">
                <button onClick={handleStartCampaign} className="pop-btn-tertiary flex-1 py-3">
                  <Sparkles size={14} />Create another campaign
                </button>
                <button className="pop-btn-secondary flex-1 py-3">
                  <Send size={14} />View campaign
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── CONTENT LIBRARY LIST ────────────────────────────────
  return (
    <div className="pop-page">
      <PageHeader
        title="Content Library"
        subtitle={`${contentItems.length} posts tracked across platforms`}
        action={
          <div className="flex items-center gap-3">
            <div className="relative hidden sm:block">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9B9B8F]" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search content..."
                className="pop-search w-48" />
            </div>
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="bg-white border border-[#E8E4DF] rounded-xl px-3 py-2 text-sm text-[#111111] focus:border-chartreuse transition-all">
              <option value="all">All platforms</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="youtube">YouTube</option>
            </select>
          </div>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState icon="content" title="No content found" description="Try adjusting your search or filters." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(item => {
            const a = item.attribution;
            const hasCampaign = !!item.attachedCampaign;
            return (
              <button key={item.id} onClick={() => setDetailItem(item.id)}
                className="pop-card overflow-hidden pop-card-hover text-left group">
                {/* Thumbnail */}
                <div className="aspect-[3/4] relative overflow-hidden">
                  <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  {/* Platform badge */}
                  <span className="absolute top-3 right-3 text-[10px] font-medium px-2.5 py-1 rounded-full bg-black/40 text-white capitalize flex items-center gap-1.5 backdrop-blur-sm">
                    <PlatformDot platform={item.platform} size={6} />{item.platform}
                  </span>
                  {/* Campaign badge — quiet */}
                  {hasCampaign && (
                    <span className="absolute top-3 left-3 text-[9px] font-medium px-2 py-0.5 rounded-full bg-white/90 text-[#111111] flex items-center gap-1">
                      <Megaphone size={8} />Campaign
                    </span>
                  )}
                  {/* Title overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-white font-semibold text-sm leading-snug">{item.title}</h3>
                    <p className="text-white/60 text-[11px] mt-1">{item.views} views · {item.engagementRate} engagement · {item.date}</p>
                  </div>
                </div>
                {/* Three outcome metrics: Views, Conversations, Post conversion rate */}
                <div className="p-4 grid grid-cols-3 gap-3 border-t border-[#E8E4DF]">
                  <div className="text-center">
                    <p className="font-geist-mono font-bold text-sm text-[#111111]">{item.views}</p>
                    <p className="text-[10px] text-[#9B9B8F] tracking-wide">Views</p>
                  </div>
                  <div className="text-center">
                    <p className="font-geist-mono font-bold text-sm text-[#111111]">{a.conversationsStarted}</p>
                    <p className="text-[10px] text-[#9B9B8F] tracking-wide">Conversations</p>
                  </div>
                  <div className="text-center">
                    <p className="font-geist-mono font-bold text-sm text-[#111111]">{a.conversionRate}</p>
                    <p className="text-[10px] text-[#9B9B8F] tracking-wide">Conv. rate</p>
                  </div>
                </div>
                {/* Bottom bar */}
                <div className="px-4 pb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 text-[10px] text-[#9B9B8F]">
                    <span className="flex items-center gap-1"><Heart size={10} />{item.likes}</span>
                    <span className="flex items-center gap-1"><MessageSquare size={10} />{item.comments}</span>
                  </div>
                  <span className="text-[10px] text-[#9B9B8F] group-hover:text-[#111111] transition-colors">View details →</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

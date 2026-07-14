import { useState, useMemo } from 'react';
import { Link } from 'react-router';
import {
  Sparkles, ChevronDown, ArrowRight, MessageSquare, MousePointerClick,
  TrendingUp, Zap, Heart, DollarSign,
} from 'lucide-react';
import { contacts, conversations, contentItems, campaigns } from '../data';
import { useApp } from '../context/AppContext';
import PageHeader from '../components/PageHeader';
import PlatformDot from '../components/PlatformDot';
import StatusPill from '../components/StatusPill';

type DateRange = '7' | '30' | '90' | 'all';

const RANGE_CONFIG: Record<DateRange, { label: string; periodText: string }> = {
  '7': { label: 'Last 7 days', periodText: 'this week' },
  '30': { label: 'Last 30 days', periodText: 'this month' },
  '90': { label: 'Last 90 days', periodText: 'in this period' },
  'all': { label: 'All time', periodText: 'all time' },
};

// Opportunity data model
interface Opportunity {
  id: string;
  title: string;
  description: string;
  count: number;
  intent: string;
  platform: string;
  contactIds: string[];
  contentId?: string;
  evidence: string[];
  action: string;
  actionTo: string;
  icon: React.ElementType;
  priority: 'primary' | 'supporting';
}

export default function OpportunitiesPage() {
  const { openContactDrawer } = useApp();
  const [dateRange, setDateRange] = useState<DateRange>('7');
  const [showRangeDropdown, setShowRangeDropdown] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState<string | null>(null);

  const config = RANGE_CONFIG[dateRange];

  // Multiplier for scaling counts by date range
  const m = dateRange === '7' ? 0.3 : dateRange === '30' ? 0.7 : 1;

  // Build opportunities from data
  const opportunities: Opportunity[] = useMemo(() => {
    const pricingQuestions = contacts.filter(c => c.intent === 'pricing');
    const clickNoContinue = contacts.filter(c => c.recentActions.some(a => a.type === 'click'));
    const engagedLaunch = contacts.filter(c => c.relationship === 'engaged' || c.relationship === 'warm');
    const needReply = conversations.filter(c => c.needsAttention);
    const highIntent = contacts.filter(c => c.intent === 'conversion');

    return [
      {
        id: 'coaching-interest',
        title: `${Math.round(12 * m)} followers are showing stronger interest in your coaching offer`,
        description: 'They asked related questions, repeatedly engaged with launch content, or clicked the offer destination.',
        count: Math.round(12 * m),
        intent: 'coaching',
        platform: 'instagram',
        contactIds: highIntent.slice(0, 12).map(c => c.id),
        contentId: contentItems[0]?.id,
        evidence: [
          `${Math.round(8 * m)} replied to related stories or DMs`,
          `${Math.round(6 * m)} clicked the offer destination`,
          `${Math.round(5 * m)} engaged with two or more related posts`,
          `${Math.round(4 * m)} asked pricing or access questions`,
          'Most activity occurred within the last 14 days',
        ],
        action: 'Review audience',
        actionTo: '/opportunities/coaching-interest',
        icon: Sparkles,
        priority: 'primary',
      },
      {
        id: 'pricing-questions',
        title: `${pricingQuestions.length} people asked about pricing`,
        description: 'They mentioned cost, budget, or asked about payment options.',
        count: pricingQuestions.length,
        intent: 'pricing',
        platform: 'instagram',
        contactIds: pricingQuestions.map(c => c.id),
        evidence: [
          `${pricingQuestions.length} direct pricing mentions in DMs or comments`,
          'Most common question: "How much is the coaching program?"',
        ],
        action: 'Open inbox',
        actionTo: '/inbox',
        icon: DollarSign,
        priority: 'supporting',
      },
      {
        id: 'clicked-no-continue',
        title: `${clickNoContinue.length} people clicked but did not continue`,
        description: 'They showed interest by clicking your link but did not complete the action.',
        count: clickNoContinue.length,
        intent: 'pricing',
        platform: 'instagram',
        contactIds: clickNoContinue.map(c => c.id),
        evidence: [
          `${clickNoContinue.length} destination link clicks recorded`,
          'Average time on page: 12 seconds',
        ],
        action: 'Follow up',
        actionTo: '/campaigns/new',
        icon: MousePointerClick,
        priority: 'supporting',
      },
      {
        id: 'need-reply',
        title: `${needReply.length} conversations need a personal reply`,
        description: 'Populr detected pricing questions and collaboration requests that need your attention.',
        count: needReply.length,
        intent: 'engagement',
        platform: 'instagram',
        contactIds: needReply.slice(0, 5).map(c => c.contactId),
        evidence: [
          `${needReply.length} conversations marked as needing attention`,
          'Topics: pricing, collaboration, support',
        ],
        action: 'Open inbox',
        actionTo: '/inbox',
        icon: MessageSquare,
        priority: 'supporting',
      },
      {
        id: 'engaged-launch',
        title: `${Math.round(engagedLaunch.length * 0.4)} repeatedly engaged with launch content`,
        description: 'They liked, commented, or shared your recent posts multiple times.',
        count: Math.round(engagedLaunch.length * 0.4),
        intent: 'engagement',
        platform: 'instagram',
        contactIds: engagedLaunch.slice(0, 8).map(c => c.id),
        evidence: [
          `${Math.round(engagedLaunch.length * 0.4)} contacts with 3+ engagements on recent posts`,
          'Highest engagement: Summer Style Guide post',
        ],
        action: 'Review audience',
        actionTo: '/opportunities/engaged-launch',
        icon: Heart,
        priority: 'supporting',
      },
    ];
  }, [contacts, conversations, contentItems, m, dateRange]);

  const primary = opportunities.find(o => o.priority === 'primary');
  const supporting = opportunities.filter(o => o.priority === 'supporting');
  const activeCampaigns = campaigns.filter(c => c.status === 'active');

  // ─── OPPORTUNITY DETAIL VIEW ──────────────────────────────
  const detailOpp = selectedOpportunity ? opportunities.find(o => o.id === selectedOpportunity) : null;
  if (detailOpp) {
    const audienceContacts = contacts.filter(c => detailOpp.contactIds.includes(c.id));
    return (
      <div className="pop-page max-w-[900px]">
        <button onClick={() => setSelectedOpportunity(null)} className="pop-btn-ghost mb-5">
          <ArrowRight size={16} className="rotate-180" />Back to opportunities
        </button>

        <div className="mb-6">
          <h1 className="pop-section-heading">{detailOpp.title}</h1>
          <p className="pop-body mt-2">{detailOpp.description}</p>
          <div className="flex items-center gap-3 mt-3">
            <PlatformDot platform={detailOpp.platform} />
            <span className="text-[12px] text-[#6B6B6B] capitalize">{detailOpp.platform}</span>
            <span className="text-[12px] text-[#9B9B8F]">· {detailOpp.count} people</span>
          </div>
        </div>

        {/* Why these people? */}
        <div className="pop-card p-5 mb-5">
          <h2 className="pop-card-title mb-4">Why these people?</h2>
          <div className="space-y-2.5">
            {detailOpp.evidence.map((e, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-chartreuse flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-[#111111]">{i + 1}</span>
                </div>
                <p className="text-[13px] text-[#111111]">{e}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Audience */}
        <div className="pop-card p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="pop-card-title">Audience ({audienceContacts.length})</h2>
            <Link to="/campaigns/new" state={{ audienceContactIds: detailOpp.contactIds, opportunityId: detailOpp.id, opportunityTitle: detailOpp.title }}
              className="pop-btn-primary text-[12px] py-2">
              <Zap size={14} />Reach this audience
            </Link>
          </div>
          <div className="space-y-2">
            {audienceContacts.map(contact => (
              <button key={contact.id} onClick={() => openContactDrawer(contact.id, 'dashboard')}
                className="w-full flex items-center gap-3 bg-[#FAFAF8] rounded-xl p-3 text-left hover:border-[#D4CFC8] transition-all border border-transparent">
                <img src={contact.avatar} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-semibold text-[#111111]">{contact.handle}</p>
                    <PlatformDot platform={contact.platform} size={6} />
                  </div>
                  <p className="text-[11px] text-[#9B9B8F]">{contact.name}</p>
                </div>
                <StatusPill status={contact.intent === 'conversion' ? 'strong offer intent' : contact.intent} className="text-[9px]" />
                <span className="text-[11px] text-[#9B9B8F]">{contact.recentActions[0]?.time || '—'}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── OPPORTUNITIES LIST ───────────────────────────────────
  return (
    <div className="pop-page">
      <PageHeader
        title="Opportunities"
        subtitle="See who is showing meaningful intent and what deserves your attention now."
        action={
          <div className="relative">
            <button onClick={() => setShowRangeDropdown(!showRangeDropdown)}
              className="hidden sm:flex items-center gap-2 border border-[#E8E4DF] rounded-xl px-4 py-2 text-sm font-medium text-[#111111] hover:bg-white transition-all bg-white">
              {config.label}<ChevronDown size={14} />
            </button>
            {showRangeDropdown && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-[#E8E4DF] rounded-xl shadow-card p-1 min-w-[160px] z-20">
                {(Object.entries(RANGE_CONFIG) as [DateRange, typeof RANGE_CONFIG['7']][]).map(([key, cfg]) => (
                  <button key={key} onClick={() => { setDateRange(key); setShowRangeDropdown(false); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-[13px] transition-all ${dateRange === key ? 'bg-[#111111] text-white' : 'text-[#6B6B6B] hover:bg-[#FAFAF8]'}`}>
                    {cfg.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        }
      />

      {/* Primary Opportunity */}
      {primary && (
        <div className="bg-white rounded-2xl p-6 border border-[#E8E4DF] hover:border-[#D4CFC8] transition-all shadow-card mb-5">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={16} className="text-chartreuse" />
                <span className="text-[10px] font-medium text-[#9B9B8F] uppercase tracking-wider">Primary opportunity</span>
              </div>
              <h2 className="font-geist font-semibold text-xl text-[#111111]">{primary.title}</h2>
              <p className="text-sm text-[#6B6B6B] mt-2 max-w-lg">{primary.description}</p>
              <div className="flex items-center mt-4 gap-3">
                <div className="flex -space-x-2">
                  {primary.contactIds.slice(0, 5).map(cid => {
                    const c = contacts.find(x => x.id === cid);
                    return c ? <img key={cid} src={c.avatar} alt="" className="w-8 h-8 rounded-full object-cover border-2 border-white" /> : null;
                  })}
                </div>
                <span className="text-xs text-[#6B6B6B]">{primary.count} people</span>
                <PlatformDot platform={primary.platform} />
                <span className="text-[11px] text-[#6B6B6B] capitalize">{primary.platform}</span>
              </div>
            </div>
            <button onClick={() => setSelectedOpportunity(primary.id)}
              className="pop-btn-secondary w-full sm:w-auto text-center">
              Review audience
            </button>
          </div>
        </div>
      )}

      {/* Supporting Opportunities */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {supporting.map(opp => (
          <button key={opp.id} onClick={() => setSelectedOpportunity(opp.id)}
            className="pop-card p-4 pop-card-hover text-left">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#FAFAF8] flex items-center justify-center flex-shrink-0">
                <opp.icon size={18} className="text-[#6B6B6B]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-geist font-semibold text-sm text-[#111111]">{opp.title}</h3>
                <p className="text-[11px] text-[#6B6B6B] mt-1 leading-relaxed">{opp.description}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] font-medium text-[#111111]">{opp.action}</span>
                  <ArrowRight size={12} className="text-[#9B9B8F]" />
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Conversations needing attention */}
      {conversations.filter(c => c.needsAttention).length > 0 && (
        <div className="mb-6">
          <h2 className="pop-section-heading mb-3">Need a personal reply</h2>
          <div className="space-y-2">
            {conversations.filter(c => c.needsAttention).slice(0, 3).map(conv => {
              const contact = contacts.find(c => c.id === conv.contactId);
              if (!contact) return null;
              return (
                <Link to="/inbox" key={conv.id} className="pop-card p-3.5 flex items-start gap-3 pop-card-hover">
                  <img src={contact.avatar} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-[#111111]">{contact.handle}</span>
                      <PlatformDot platform={contact.platform} />
                      <StatusPill status={conv.intent} className="text-[9px]" />
                    </div>
                    <p className="text-xs text-[#6B6B6B] mt-1 truncate">{conv.lastMessage}</p>
                    <span className="text-[11px] text-[#9B9B8F] mt-1">{conv.time}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Active campaign results */}
      {activeCampaigns.length > 0 && (
        <div className="mb-8">
          <h2 className="pop-section-heading mb-3">Active campaigns</h2>
          <div className="space-y-3">
            {activeCampaigns.map(campaign => (
              <Link to="/campaigns" key={campaign.id} className="pop-card p-4 flex items-center gap-4 pop-card-hover">
                <div className="w-10 h-10 rounded-xl bg-chartreuse flex items-center justify-center flex-shrink-0">
                  <TrendingUp size={18} className="text-[#111111]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-geist font-semibold text-sm text-[#111111]">{campaign.name}</h3>
                    <StatusPill status={campaign.status} />
                  </div>
                  <p className="text-xs text-[#6B6B6B] mt-0.5">{campaign.goal} · {campaign.platform}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-[#6B6B6B] flex-shrink-0">
                  <span>{campaign.clicks} clicks</span>
                  <span>{campaign.conversions} conv.</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

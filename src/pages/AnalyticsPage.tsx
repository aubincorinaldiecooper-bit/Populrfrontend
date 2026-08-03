import { contacts, conversations, campaigns, contentItems } from '../data';
import { TrendingUp, Users, MessageSquare, MousePointerClick, Lightbulb } from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import PageHeader from '../components/PageHeader';
import PlatformDot from '../components/PlatformDot';

export default function AnalyticsPage() {
  const totalContacts = contacts.length;
  const totalConversations = conversations.length;
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const avgRate = campaigns.length > 0 ? Math.round(campaigns.reduce((s, c) => s + parseInt(c.rate), 0) / campaigns.length) : 0;

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto">
      <PageHeader title="Analytics" subtitle="Understand how your audience is growing and engaging" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total contacts', value: totalContacts, change: '+12 this week', icon: Users },
          { label: 'Conversations', value: totalConversations, change: '+3 this week', icon: MessageSquare },
          { label: 'Destination clicks', value: totalClicks, change: '+5 this week', icon: MousePointerClick },
          { label: 'Conversions', value: totalConversions, change: `Avg ${avgRate}% rate`, icon: TrendingUp },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} padding={5}>
              <div className="flex items-center gap-2 mb-2"><Icon size={16} className="text-[#6B6B6B]" /><span className="text-xs text-[#6B6B6B]">{stat.label}</span></div>
              <p className="font-geist-mono font-bold text-2xl text-[#111111]">{stat.value}</p>
              <p className="text-[11px] text-[#10B981] mt-1">{stat.change}</p>
            </Card>
          );
        })}
      </div>

      {/* Platform + Relationship */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card padding={6}>
          <h2 className="font-geist font-semibold text-sm text-[#111111] mb-4">Contacts by platform</h2>
          <div className="space-y-3">
            {(['instagram', 'tiktok', 'youtube', 'twitter'] as const).map(platform => {
              const count = contacts.filter(c => c.platform === platform).length;
              const pct = Math.round((count / totalContacts) * 100);
              return (
                <div key={platform}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2"><PlatformDot platform={platform} /><span className="text-[12px] text-[#111111] capitalize">{platform}</span></div>
                    <span className="text-[12px] font-medium text-[#111111]">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-[#E8E4DF] rounded-full overflow-hidden">
                    <div className="h-full bg-chartreuse rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card padding={6}>
          <h2 className="font-geist font-semibold text-sm text-[#111111] mb-4">Relationship distribution</h2>
          <div className="space-y-3">
            {[
              { label: 'Warm fans', key: 'warm', color: 'bg-[#E0F5E9]' },
              { label: 'Ready to convert', key: 'ready', color: 'bg-[#FFF3E0]' },
              { label: 'Engaged', key: 'engaged', color: 'bg-[#FAFAF8]' },
              { label: 'Subscribers', key: 'subscriber', color: 'bg-[#E0F5E9]' },
              { label: 'New', key: 'new', color: 'bg-[#FAFAF8]' },
            ].map(rel => {
              const count = contacts.filter(c => c.relationship === rel.key).length;
              const pct = Math.round((count / totalContacts) * 100);
              return (
                <div key={rel.label} className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full ${rel.color} border border-[#E8E4DF]`} />
                  <span className="text-[12px] text-[#111111] flex-1">{rel.label}</span>
                  <span className="text-[12px] font-medium text-[#111111]">{count}</span>
                  <span className="text-[11px] text-[#9B9B8F] w-10 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Content Attribution */}
      <Card padding={6} className="mb-8">
        <h2 className="font-geist font-semibold text-sm text-[#111111] mb-4">Content-to-contact attribution</h2>
        <div className="space-y-4">
          {contentItems.map(item => (
            <div key={item.id}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-3">
                  <img src={item.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover" />
                  <div>
                    <p className="text-[13px] font-semibold text-[#111111]">{item.title}</p>
                    <p className="text-[11px] text-[#6B6B6B] capitalize">{item.platform} · {item.views} views</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:gap-5 text-right flex-shrink-0">
                  {[
                    { label: 'Contacts', value: item.attribution.contactsGenerated },
                    { label: 'Convos', value: item.attribution.conversationsStarted },
                    { label: 'High intent', value: item.attribution.highIntentGenerated },
                    { label: 'Conv.', value: item.attribution.campaignConversions },
                  ].map(s => (
                    <div key={s.label}><p className="text-[13px] font-semibold text-[#111111]">{s.value}</p><p className="text-[9px] text-[#9B9B8F] uppercase">{s.label}</p></div>
                  ))}
                </div>
              </div>
              <div className="h-1.5 bg-[#E8E4DF] rounded-full overflow-hidden ml-[52px]">
                <div className="h-full bg-chartreuse rounded-full" style={{ width: `${(item.attribution.contactsGenerated / 30) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Plain-language insight */}
      <Card padding={4} className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-[#FFF3E0] flex items-center justify-center flex-shrink-0">
          <Lightbulb size={14} className="text-[#D97706]" />
        </div>
        <div>
          <p className="text-[13px] font-medium text-[#111111]">Insight</p>
          <p className="text-[12px] text-[#6B6B6B] mt-0.5">Instagram generated the most contacts, while TikTok produced the highest percentage of Interested contacts. Your Style Guide post is your strongest conversion driver.</p>
        </div>
      </Card>
    </div>
  );
}

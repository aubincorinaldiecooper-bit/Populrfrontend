import { Inbox, Users, FileText, Megaphone, Zap, BarChart3, Link2, MessageSquare, AlertTriangle, Search } from 'lucide-react';

const iconMap: Record<string, React.ElementType> = {
  inbox: Inbox, contacts: Users, content: FileText, campaigns: Megaphone,
  automations: Zap, analytics: BarChart3, integrations: Link2,
  conversations: MessageSquare, search: Search, alert: AlertTriangle,
};

export default function EmptyState({ icon, title, description, action }: {
  icon: string; title: string; description: string; action?: React.ReactNode;
}) {
  const Icon = iconMap[icon] || MessageSquare;
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[#FAFAF8] flex items-center justify-center mb-4">
        <Icon size={22} className="text-[#9B9B8F]" />
      </div>
      <h3 className="font-geist font-semibold text-sm text-[#111111] mb-1">{title}</h3>
      <p className="text-[13px] text-[#6B6B6B] max-w-[360px] leading-relaxed mb-4">{description}</p>
      {action}
    </div>
  );
}

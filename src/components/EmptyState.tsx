import { Inbox, Users, FileText, Megaphone, Zap, BarChart3, Link2, MessageSquare, AlertTriangle, Search } from 'lucide-react';
import { EmptyState as AstryxEmptyState } from '@astryxdesign/core/EmptyState';

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
    <AstryxEmptyState
      icon={
        <div className="w-12 h-12 rounded-2xl bg-[#FAFAF8] flex items-center justify-center">
          <Icon size={22} className="text-[#9B9B8F]" />
        </div>
      }
      title={title}
      description={description}
      actions={action}
    />
  );
}

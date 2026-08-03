import { Badge, type BadgeVariant } from '@astryxdesign/core/Badge';

const statusVariant: Record<string, BadgeVariant> = {
  // ─── General Status ───
  active: 'success',
  paused: 'warning',
  draft: 'neutral',
  completed: 'success',
  sent: 'success',
  scheduled: 'warning',
  'coming-soon': 'warning',
  connected: 'success',
  available: 'neutral',
  disconnected: 'error',
  syncing: 'warning',
  reconnect_required: 'error',

  // ─── Intent (strongest signal) ───
  'strong offer intent': 'error',
  'intent-conversion': 'error',
  'pricing question': 'warning',
  'intent-pricing': 'warning',
  'collaboration request': 'info',
  'intent-collaboration': 'info',
  'support request': 'neutral',
  'reply recommended': 'success',
  'human-review': 'error',
  'intent-alert': 'warning',

  // ─── Relationship (soft) ───
  'warm fan': 'success',
  'ready to convert': 'warning',
  engaged: 'info',
  subscriber: 'success',
  new: 'neutral',

  // ─── Stage ───
  discovered: 'neutral',
  interested: 'warning',
  converted: 'success',

  // ─── Special ───
  'needs-attention': 'error',
};

export default function StatusPill({ status, label, className }: { status: string; label?: string; className?: string }) {
  const variant = statusVariant[status.toLowerCase()] ?? 'neutral';
  return <Badge variant={variant} label={label ?? status} className={className} />;
}

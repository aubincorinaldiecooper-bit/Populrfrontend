import { Badge } from '@/components/ui/badge';

/**
 * A state, worn as a pill. The status→tone map is the product's one
 * vocabulary for "what is this thing right now" — pages pass the raw
 * status string and this decides how loudly it reads.
 *
 * Rendered by the shared Badge (soft tint + strong word) rather than the
 * Astryx Badge it used to wrap, whose saturated fills came from outside
 * Populr's palette. Geometry is unchanged: rounded-full, 12px/500,
 * 20px line, 8px inline padding.
 */
type Tone = 'success' | 'warning' | 'neutral' | 'destructive' | 'info';

const statusTone: Record<string, Tone> = {
  // ─── General Status ───
  active: 'success',
  live: 'success',
  paused: 'warning',
  draft: 'neutral',
  completed: 'success',
  sent: 'success',
  scheduled: 'warning',
  'coming-soon': 'warning',
  connected: 'success',
  available: 'neutral',
  disconnected: 'destructive',
  syncing: 'warning',
  reconnect_required: 'destructive',

  // ─── Intent (strongest signal) ───
  'strong offer intent': 'destructive',
  'intent-conversion': 'destructive',
  'pricing question': 'warning',
  'intent-pricing': 'warning',
  'collaboration request': 'info',
  'intent-collaboration': 'info',
  'support request': 'neutral',
  'reply recommended': 'success',
  'human-review': 'destructive',
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
  'needs-attention': 'destructive',
};

export default function StatusPill({ status, label, className }: {
  status: string;
  label?: string;
  className?: string;
}) {
  const variant = statusTone[status.toLowerCase()] ?? 'neutral';
  return <Badge variant={variant} className={className}>{label ?? status}</Badge>;
}

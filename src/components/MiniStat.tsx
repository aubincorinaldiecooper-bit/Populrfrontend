import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

export default function MiniStat({ value, label, tone }: { value: number; label: string; tone?: 'warning' | 'error' }) {
  const toneColor = tone === 'error' ? 'var(--color-error)' : tone === 'warning' ? 'var(--color-warning)' : undefined;
  return (
    <VStack gap={0.5} align="center">
      <Text size="xl" weight="bold" className="font-geist-mono" style={toneColor ? { color: toneColor } : undefined}>{value}</Text>
      <Text type="supporting" color="secondary">{label}</Text>
    </VStack>
  );
}

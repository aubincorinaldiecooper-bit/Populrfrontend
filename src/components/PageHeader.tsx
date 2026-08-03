import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';

export default function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <HStack wrap="wrap" justify="between" align="center" gap={4} style={{ marginBottom: 32 }}>
      <VStack gap={0.5} style={{ minWidth: 0 }}>
        <Heading level={1} type="display-3">{title}</Heading>
        {subtitle && <Text type="body" color="secondary">{subtitle}</Text>}
      </VStack>
      {action && (
        <HStack wrap="wrap" gap={3}>
          {action}
        </HStack>
      )}
    </HStack>
  );
}

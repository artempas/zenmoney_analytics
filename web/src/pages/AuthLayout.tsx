import { Card, Center, Group, Stack, Text, Title } from '@mantine/core';

export function AuthLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Center mih="100vh" p="md">
      <Stack w="100%" maw={400} gap="lg">
        <Group gap="sm" justify="center">
          <img src="/favicon.svg" width={32} height={32} alt="" />
          <Text fw={600} size="lg">
            ZenMoney Analytics
          </Text>
        </Group>
        <Card padding="xl">
          <Title order={3} mb="md">
            {title}
          </Title>
          {children}
        </Card>
      </Stack>
    </Center>
  );
}

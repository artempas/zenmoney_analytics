import { useState } from 'react';
import { Alert, Button, Card, Group, List, Modal, Stack, Table, Text, Title } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconFileTypeCsv, IconTrash, IconUpload, IconX } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { ImportRecord, ImportResult } from '@zm/shared';
import { api } from '../api/client';
import { monthEnd, monthStart } from '../lib/dates';
import { dateShort, pluralize } from '../lib/format';

export function ImportPage() {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [confirmOpen, confirm] = useDisclosure(false);
  const history = useQuery({
    queryKey: ['imports'],
    queryFn: () => api<ImportRecord[]>('/api/imports'),
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api<ImportResult>('/api/imports', { method: 'POST', form });
    },
    onSuccess: async (r) => {
      setResult(r);
      await queryClient.invalidateQueries();
    },
    onError: (e) => {
      setResult(null);
      notifications.show({
        title: 'Не удалось загрузить файл',
        message: (e as Error).message,
        color: 'red',
      });
    },
  });

  const wipe = useMutation({
    mutationFn: () => api('/api/data', { method: 'DELETE' }),
    onSuccess: async () => {
      confirm.close();
      setResult(null);
      await queryClient.invalidateQueries();
      notifications.show({ message: 'Все данные удалены', color: 'brand' });
    },
  });

  return (
    <Stack gap="md" maw={880}>
      <Title order={2}>Загрузка выгрузки</Title>
      <Card>
        <Text size="sm" c="dimmed" mb="md">
          Экспортируйте транзакции из ZenMoney в CSV и перетащите файл сюда. Операции за период,
          который покрывает файл, заменят ранее загруженные — так правки и удаления из ZenMoney тоже
          попадут в аналитику.
        </Text>
        <Dropzone
          onDrop={(files) => files[0] && upload.mutate(files[0])}
          onReject={() => notifications.show({ message: 'Нужен CSV-файл до 20 МБ', color: 'red' })}
          maxSize={20 * 1024 * 1024}
          maxFiles={1}
          accept={{
            'text/csv': ['.csv'],
            'application/vnd.ms-excel': ['.csv'],
            'text/plain': ['.csv'],
          }}
          loading={upload.isPending}
        >
          <Group justify="center" gap="lg" mih={140} style={{ pointerEvents: 'none' }}>
            <Dropzone.Accept>
              <IconUpload size={40} stroke={1.4} />
            </Dropzone.Accept>
            <Dropzone.Reject>
              <IconX size={40} stroke={1.4} />
            </Dropzone.Reject>
            <Dropzone.Idle>
              <IconFileTypeCsv size={40} stroke={1.4} />
            </Dropzone.Idle>
            <div>
              <Text size="lg">Перетащите CSV-файл или нажмите, чтобы выбрать</Text>
              <Text size="sm" c="dimmed">
                Формат: выгрузка транзакций ZenMoney (zen_…_dumpof_transactions….csv)
              </Text>
            </div>
          </Group>
        </Dropzone>
      </Card>

      {result && (
        <Alert color="green" icon={<IconCheck size={18} />} title="Файл загружен">
          <List size="sm" spacing={2}>
            <List.Item>
              Период: {dateShort(result.dateFrom)} – {dateShort(result.dateTo)}
            </List.Item>
            <List.Item>
              Загружено {result.rows} {pluralize(result.rows, 'операция', 'операции', 'операций')}
              {result.replaced > 0 && `, заменено ранее загруженных: ${result.replaced}`}
            </List.Item>
            {result.newAccounts.length > 0 && (
              <List.Item>Новые счета: {result.newAccounts.join(', ')}</List.Item>
            )}
          </List>
          <Group mt="sm" gap="sm">
            <Button
              size="xs"
              component={Link}
              to={`/?from=${monthStart(result.dateTo)}&to=${monthEnd(result.dateTo)}`}
            >
              Открыть обзор
            </Button>
            <Button size="xs" variant="default" component={Link} to="/settings">
              Проверить настройки
            </Button>
          </Group>
          <Text size="xs" c="dimmed" mt="sm">
            Совет: укажите в настройках свои имена (как они пишутся в переводах) и отметьте
            накопительные счета — тогда переводы между своими счетами не будут считаться доходами и
            расходами.
          </Text>
        </Alert>
      )}

      <Card>
        <Title order={4} mb="sm">
          История загрузок
        </Title>
        {history.data?.length ? (
          <Table.ScrollContainer minWidth={560}>
            <Table className="tabular">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Когда</Table.Th>
                  <Table.Th>Файл</Table.Th>
                  <Table.Th>Период</Table.Th>
                  <Table.Th ta="right">Операций</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {history.data.map((h) => (
                  <Table.Tr key={h.id}>
                    <Table.Td>{new Date(h.uploadedAt).toLocaleString('ru-RU')}</Table.Td>
                    <Table.Td>
                      <Text size="sm" truncate maw={260}>
                        {h.filename}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {dateShort(h.dateFrom)} – {dateShort(h.dateTo)}
                    </Table.Td>
                    <Table.Td ta="right">{h.rows}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ) : (
          <Text size="sm" c="dimmed">
            Пока ничего не загружено.
          </Text>
        )}
      </Card>

      <Card>
        <Group justify="space-between">
          <div>
            <Title order={4}>Удалить все данные</Title>
            <Text size="sm" c="dimmed">
              Удалит все загруженные операции, счета и ручные правки. Аккаунт и настройки останутся.
            </Text>
          </div>
          <Button
            color="red"
            variant="light"
            leftSection={<IconTrash size={16} />}
            onClick={confirm.open}
          >
            Удалить
          </Button>
        </Group>
      </Card>

      <Modal opened={confirmOpen} onClose={confirm.close} title="Удалить все данные?" centered>
        <Text size="sm" mb="md">
          Это действие нельзя отменить. Чтобы снова увидеть аналитику, выгрузку придётся загрузить
          заново.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={confirm.close}>
            Отмена
          </Button>
          <Button color="red" loading={wipe.isPending} onClick={() => wipe.mutate()}>
            Удалить
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}

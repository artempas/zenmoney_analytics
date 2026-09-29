import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Checkbox,
  Group,
  MultiSelect,
  PasswordInput,
  SegmentedControl,
  Stack,
  Switch,
  Table,
  TagsInput,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import { IconCheck, IconFingerprint, IconPencil, IconTrash, IconX } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Account, PasskeyInfo, Settings, SettingsResponse } from '@zm/shared';
import { api } from '../api/client';
import { PageLoader } from '../components/ui';

export function SettingsPage() {
  return (
    <Stack gap="md" maw={880}>
      <Title order={2}>Настройки</Title>
      <RulesCard />
      <AccountsCard />
      <PasskeysCard />
      <PasswordCard />
    </Stack>
  );
}

function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['settings'] }),
      queryClient.invalidateQueries({ queryKey: ['accounts'] }),
    ]);
}

function RulesCard() {
  const invalidate = useInvalidateAll();
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<SettingsResponse>('/api/settings'),
  });
  const [draft, setDraft] = useState<Settings | null>(null);

  useEffect(() => {
    if (settings.data) {
      setDraft({
        selfNames: settings.data.selfNames,
        includeUncategorized: settings.data.includeUncategorized,
        passiveCategories: settings.data.passiveCategories,
      });
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (s: Settings) => api<SettingsResponse>('/api/settings', { method: 'PUT', body: s }),
    onSuccess: async () => {
      await invalidate();
      notifications.show({
        message: 'Настройки сохранены, операции переклассифицированы',
        color: 'brand',
      });
    },
    onError: (e) => notifications.show({ message: (e as Error).message, color: 'red' }),
  });

  if (!settings.data || !draft) return <PageLoader />;
  const auto = draft.passiveCategories === null;

  return (
    <Card>
      <Title order={4}>Распознавание операций</Title>
      <Text size="sm" c="dimmed" mb="md">
        В выгрузке ZenMoney переводы между своими счетами в разных банках часто выглядят как обычный
        доход и расход. Эти правила помогают их отличить.
      </Text>
      <Stack>
        <TagsInput
          label="Мои имена"
          description="Как вы записаны в переводах: «Иван П.», «Иван Иванович П». Операции без категории с этими именами в получателе или комментарии считаются переводами себе. Нажмите Enter после каждого имени."
          placeholder="Добавьте имя"
          value={draft.selfNames}
          onChange={(selfNames) => setDraft({ ...draft, selfNames })}
          clearable
        />
        <Switch
          label="Учитывать операции без категории"
          description="Если выключить, оставшиеся операции без категории не попадут ни в доходы, ни в расходы"
          checked={draft.includeUncategorized}
          onChange={(e) => setDraft({ ...draft, includeUncategorized: e.currentTarget.checked })}
        />
        <div>
          <Checkbox
            label="Определять категории пассивного дохода автоматически"
            description="По названию: проценты, кэшбэк, дивиденды, купоны"
            checked={auto}
            onChange={(e) =>
              setDraft({
                ...draft,
                passiveCategories: e.currentTarget.checked
                  ? null
                  : settings.data.effectivePassiveCategories,
              })
            }
          />
          <MultiSelect
            mt="xs"
            label="Категории пассивного дохода"
            data={settings.data.incomeCategories}
            value={
              auto ? settings.data.effectivePassiveCategories : (draft.passiveCategories ?? [])
            }
            onChange={(v) => setDraft({ ...draft, passiveCategories: v })}
            disabled={auto}
            searchable
            placeholder={
              settings.data.incomeCategories.length
                ? 'Выберите категории'
                : 'Сначала загрузите выгрузку'
            }
          />
        </div>
        <Group>
          <Button onClick={() => save.mutate(draft)} loading={save.isPending}>
            Сохранить
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

function AccountsCard() {
  const invalidate = useInvalidateAll();
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api<Account[]>('/api/accounts'),
  });
  const update = useMutation({
    mutationFn: (body: { name: string; kind: Account['kind'] | null }) =>
      api('/api/accounts', { method: 'PUT', body }),
    onSuccess: invalidate,
    onError: (e) => notifications.show({ message: (e as Error).message, color: 'red' }),
  });

  return (
    <Card>
      <Title order={4}>Счета</Title>
      <Text size="sm" c="dimmed" mb="md">
        Операции без категории на накопительных счетах считаются переводами. Переводы на такие счета
        показываются на диаграмме «Поток денег» как накопления. Тип определяется по названию, но его
        можно поменять.
      </Text>
      {accounts.isPending ? (
        <PageLoader />
      ) : !accounts.data?.length ? (
        <Text size="sm" c="dimmed">
          Счета появятся после загрузки выгрузки.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={520}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Счёт</Table.Th>
                <Table.Th ta="right">Операций</Table.Th>
                <Table.Th>Тип</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {accounts.data.map((a) => (
                <Table.Tr key={a.name}>
                  <Table.Td>
                    <Text size="sm">{a.name}</Text>
                    {a.kindAuto && (
                      <Text size="xs" c="dimmed">
                        определено автоматически
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td ta="right" className="tabular">
                    {a.txCount}
                  </Table.Td>
                  <Table.Td>
                    <SegmentedControl
                      size="xs"
                      value={a.kind}
                      onChange={(v) => update.mutate({ name: a.name, kind: v as Account['kind'] })}
                      data={[
                        { value: 'regular', label: 'Обычный' },
                        { value: 'savings', label: 'Накопления' },
                      ]}
                    />
                    {!a.kindAuto && (
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        ml="xs"
                        onClick={() => update.mutate({ name: a.name, kind: null })}
                      >
                        авто
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Card>
  );
}

function PasskeyRow({ p }: { p: PasskeyInfo }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['passkeys'] });
  const rename = useMutation({
    mutationFn: () =>
      api(`/api/passkeys/${encodeURIComponent(p.id)}`, { method: 'PATCH', body: { name } }),
    onSuccess: async () => {
      setEditing(false);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/passkeys/${encodeURIComponent(p.id)}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  return (
    <Table.Tr>
      <Table.Td>
        {editing ? (
          <Group gap={4} wrap="nowrap">
            <TextInput
              size="xs"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              maxLength={64}
            />
            <ActionIcon variant="subtle" onClick={() => rename.mutate()} aria-label="Сохранить">
              <IconCheck size={16} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => setEditing(false)}
              aria-label="Отмена"
            >
              <IconX size={16} />
            </ActionIcon>
          </Group>
        ) : (
          <>
            <Text size="sm">{p.name}</Text>
            <Text size="xs" c="dimmed">
              {p.backedUp ? 'синхронизируется между устройствами' : 'хранится на одном устройстве'}
            </Text>
          </>
        )}
      </Table.Td>
      <Table.Td>
        <Text size="xs" c="dimmed">
          добавлен {new Date(p.createdAt).toLocaleDateString('ru-RU')}
          <br />
          {p.lastUsedAt
            ? `вход ${new Date(p.lastUsedAt).toLocaleDateString('ru-RU')}`
            : 'ещё не использовался'}
        </Text>
      </Table.Td>
      <Table.Td w={80}>
        <Group gap={4} wrap="nowrap">
          <Tooltip label="Переименовать">
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => setEditing(true)}
              aria-label="Переименовать"
            >
              <IconPencil size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Удалить">
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={() => remove.mutate()}
              aria-label="Удалить passkey"
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

function PasskeysCard() {
  const queryClient = useQueryClient();
  const passkeys = useQuery({
    queryKey: ['passkeys'],
    queryFn: () => api<PasskeyInfo[]>('/api/passkeys'),
  });
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: async () => {
      const optionsJSON = await api<PublicKeyCredentialCreationOptionsJSON>(
        '/api/passkeys/register/options',
        {
          method: 'POST',
        },
      );
      const response = await startRegistration({ optionsJSON });
      return api<PasskeyInfo>('/api/passkeys/register/verify', { body: { response } });
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['passkeys'] });
      notifications.show({ message: 'Passkey привязан', color: 'brand' });
    },
    onError: (e) => {
      const err = e as Error;
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') return;
      setError(err.message);
    },
  });

  return (
    <Card>
      <Group justify="space-between" mb="xs" align="flex-start">
        <div>
          <Title order={4}>Passkey</Title>
          <Text size="sm" c="dimmed">
            Вход без пароля — по отпечатку пальца, лицу или PIN-коду устройства.
          </Text>
        </div>
        <Button
          leftSection={<IconFingerprint size={16} />}
          onClick={() => add.mutate()}
          loading={add.isPending}
          disabled={!browserSupportsWebAuthn()}
        >
          Привязать passkey
        </Button>
      </Group>
      {!browserSupportsWebAuthn() && (
        <Alert color="yellow" mb="sm">
          Браузер не поддерживает passkey. Также passkey работают только по HTTPS (или на
          localhost).
        </Alert>
      )}
      {error && (
        <Alert color="red" mb="sm" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {passkeys.data?.length ? (
        <Table verticalSpacing="sm">
          <Table.Tbody>
            {passkeys.data.map((p) => (
              <PasskeyRow key={p.id} p={p} />
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Text size="sm" c="dimmed">
          Passkey ещё не привязаны.
        </Text>
      )}
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const change = useMutation({
    mutationFn: () =>
      api('/api/auth/password', { body: { currentPassword: current, newPassword: next } }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      notifications.show({ message: 'Пароль изменён, другие сессии завершены', color: 'brand' });
    },
    onError: (e) => notifications.show({ message: (e as Error).message, color: 'red' }),
  });
  return (
    <Card>
      <Title order={4} mb="sm">
        Смена пароля
      </Title>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate();
        }}
      >
        <Group align="flex-end" wrap="wrap">
          <PasswordInput
            label="Текущий пароль"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.currentTarget.value)}
            required
            w={240}
          />
          <PasswordInput
            label="Новый пароль"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.currentTarget.value)}
            minLength={8}
            required
            w={240}
          />
          <Button type="submit" loading={change.isPending}>
            Сменить
          </Button>
        </Group>
      </form>
    </Card>
  );
}

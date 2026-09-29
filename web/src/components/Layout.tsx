import {
  ActionIcon,
  AppShell,
  Burger,
  Group,
  NavLink,
  ScrollArea,
  Text,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconCalendarStats,
  IconChartBar,
  IconChartSankey,
  IconFileImport,
  IconLayoutDashboard,
  IconListDetails,
  IconLogout,
  IconMoon,
  IconSettings,
  IconSun,
  IconTrendingUp,
  IconZoomExclamation,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { api } from '../api/client';
import { useMe } from '../api/queries';
import { periodSearch, usePeriod } from '../lib/period';

const DASHBOARDS = [
  { to: '/', label: 'Обзор', icon: IconLayoutDashboard },
  { to: '/dynamics', label: 'Динамика', icon: IconChartBar },
  { to: '/calendar', label: 'Календарь трат', icon: IconCalendarStats },
  { to: '/flow', label: 'Поток денег', icon: IconChartSankey },
  { to: '/anomalies', label: 'Крупные и необычные', icon: IconZoomExclamation },
  { to: '/income', label: 'Доходы', icon: IconTrendingUp },
];

const DATA = [
  { to: '/transactions', label: 'Транзакции', icon: IconListDetails },
  { to: '/import', label: 'Загрузка выгрузки', icon: IconFileImport },
  { to: '/settings', label: 'Настройки', icon: IconSettings },
];

export function Layout() {
  const [opened, { toggle, close }] = useDisclosure();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe();
  const { period } = usePeriod();
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('light');
  const search = periodSearch(period);

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    queryClient.clear();
    navigate('/login');
  };

  const link = (item: (typeof DASHBOARDS)[number], keepPeriod: boolean) => (
    <NavLink
      key={item.to}
      component={Link}
      to={item.to + (keepPeriod ? search : '')}
      label={item.label}
      leftSection={<item.icon size={18} stroke={1.6} />}
      active={location.pathname === item.to}
      onClick={close}
      variant="light"
      style={{ borderRadius: 8 }}
    />
  );

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Меню" />
            <img src="/favicon.svg" width={24} height={24} alt="" />
            <Text fw={600}>ZenMoney Analytics</Text>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" c="dimmed" visibleFrom="sm">
              {me.data?.user?.email}
            </Text>
            <Tooltip label={scheme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={() => setColorScheme(scheme === 'dark' ? 'light' : 'dark')}
                aria-label="Сменить тему"
              >
                {scheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Выйти">
              <ActionIcon variant="subtle" color="gray" onClick={logout} aria-label="Выйти">
                <IconLogout size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <AppShell.Section grow component={ScrollArea}>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" px="sm" pb={4}>
            Дашборды
          </Text>
          {DASHBOARDS.map((d) => link(d, true))}
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" px="sm" pt="md" pb={4}>
            Данные
          </Text>
          {DATA.map((d) => link(d, d.to === '/transactions'))}
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

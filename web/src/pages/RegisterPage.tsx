import { useState } from 'react';
import { Alert, Anchor, Button, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate } from 'react-router';
import type { MeResponse, User } from '@zm/shared';
import { api, ApiError } from '../api/client';
import { useMe } from '../api/queries';
import { AuthLayout } from './AuthLayout';

export function RegisterPage() {
  const me = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Same destination as after a successful registration, so the two redirects never race.
  if (me.data?.user) return <Navigate to="/import" replace />;
  if (me.data && !me.data.registrationOpen) {
    return (
      <AuthLayout title="Регистрация закрыта">
        <Stack>
          <Text c="dimmed">
            Аккаунт уже создан. Чтобы разрешить регистрацию новых пользователей, запустите
            приложение с переменной <code>ALLOW_REGISTRATION=true</code>.
          </Text>
          <Button component={Link} to="/login">
            Ко входу
          </Button>
        </Stack>
      </AuthLayout>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== repeat) {
      setError('Пароли не совпадают');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { user } = await api<{ user: User }>('/api/auth/register', {
        body: { email, password },
      });
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      queryClient.setQueryData<MeResponse>(['me'], { user, registrationOpen: false });
      navigate('/import', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось зарегистрироваться');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Создание аккаунта">
      <form onSubmit={submit}>
        <Stack>
          {error && <Alert color="red">{error}</Alert>}
          <TextInput
            label="Email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            required
          />
          <PasswordInput
            label="Пароль"
            description="Не короче 8 символов"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            minLength={8}
            required
          />
          <PasswordInput
            label="Повторите пароль"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.currentTarget.value)}
            required
          />
          <Button type="submit" loading={busy}>
            Зарегистрироваться
          </Button>
          <Text size="sm" c="dimmed">
            Passkey можно привязать после входа в настройках.
          </Text>
          <Text size="sm" ta="center">
            Уже есть аккаунт?{' '}
            <Anchor component={Link} to="/login">
              Войти
            </Anchor>
          </Text>
        </Stack>
      </form>
    </AuthLayout>
  );
}

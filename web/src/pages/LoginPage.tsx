import { useEffect, useState } from 'react';
import {
  Alert,
  Anchor,
  Button,
  Divider,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  WebAuthnAbortService,
} from '@simplewebauthn/browser';
import { IconFingerprint } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import type { MeResponse, User } from '@zm/shared';
import { api, ApiError } from '../api/client';
import { useMe } from '../api/queries';
import { AuthLayout } from './AuthLayout';

async function passkeyLogin(useBrowserAutofill: boolean): Promise<User> {
  const optionsJSON = await api<PublicKeyCredentialRequestOptionsJSON>(
    '/api/passkeys/login/options',
    {
      method: 'POST',
    },
  );
  const response = await startAuthentication({ optionsJSON, useBrowserAutofill });
  return (await api<{ user: User }>('/api/passkeys/login/verify', { body: { response } })).user;
}

function isCancel(e: unknown): boolean {
  return e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'AbortError');
}

export function LoginPage() {
  const me = useMe();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const done = (user: User) => {
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    queryClient.setQueryData<MeResponse>(['me'], (prev) => ({
      user,
      registrationOpen: prev?.registrationOpen ?? false,
    }));
    navigate(from, { replace: true });
  };

  // Conditional UI: offer passkeys in the email field's autofill.
  useEffect(() => {
    void (async () => {
      if (!(await browserSupportsWebAuthnAutofill())) return;
      try {
        done(await passkeyLogin(true));
      } catch (e) {
        if (!isCancel(e)) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => WebAuthnAbortService.cancelCeremony();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (me.data?.user) return <Navigate to={from} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      done((await api<{ user: User }>('/api/auth/login', { body: { email, password } })).user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  };

  const withPasskey = async () => {
    setError(null);
    try {
      done(await passkeyLogin(false));
    } catch (e) {
      if (!isCancel(e)) setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <AuthLayout title="Вход">
      <form onSubmit={submit}>
        <Stack>
          {error && <Alert color="red">{error}</Alert>}
          <TextInput
            label="Email"
            type="email"
            autoComplete="username webauthn"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            required
          />
          <PasswordInput
            label="Пароль"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            required
          />
          <Button type="submit" loading={busy}>
            Войти
          </Button>
          {browserSupportsWebAuthn() && (
            <>
              <Divider label="или" />
              <Button
                variant="default"
                leftSection={<IconFingerprint size={18} />}
                onClick={withPasskey}
              >
                Войти с passkey
              </Button>
            </>
          )}
          {me.data?.registrationOpen && (
            <Text size="sm" ta="center">
              Нет аккаунта?{' '}
              <Anchor component={Link} to="/register">
                Зарегистрироваться
              </Anchor>
            </Text>
          )}
        </Stack>
      </form>
    </AuthLayout>
  );
}

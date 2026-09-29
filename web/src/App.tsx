import { Center, Loader } from '@mantine/core';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useMe } from './api/queries';
import { Layout } from './components/Layout';
import { AnomaliesPage } from './pages/AnomaliesPage';
import { CalendarPage } from './pages/CalendarPage';
import { DynamicsPage } from './pages/DynamicsPage';
import { FlowPage } from './pages/FlowPage';
import { ImportPage } from './pages/ImportPage';
import { IncomePage } from './pages/IncomePage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { RegisterPage } from './pages/RegisterPage';
import { SettingsPage } from './pages/SettingsPage';
import { TransactionsPage } from './pages/TransactionsPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (!me.data?.user) {
    const to = me.data?.registrationOpen ? '/register' : '/login';
    return <Navigate to={to} replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="dynamics" element={<DynamicsPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="flow" element={<FlowPage />} />
        <Route path="anomalies" element={<AnomaliesPage />} />
        <Route path="income" element={<IncomePage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

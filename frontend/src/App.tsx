import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import ProtectedRoute from '@/components/ProtectedRoute';
import PublicOnlyRoute from '@/components/PublicOnlyRoute';
import RequireRole from '@/components/RequireRole';
import AcceptInvitePage from '@/pages/AcceptInvitePage';
import ClientDetailPage from '@/pages/ClientDetailPage';
import DashboardPage from '@/pages/DashboardPage';
import EditClientPage from '@/pages/EditClientPage';
import EditTeamMemberPage from '@/pages/EditTeamMemberPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import InvitePage from '@/pages/InvitePage';
import LoginPage from '@/pages/LoginPage';
import ManageClientsPage from '@/pages/ManageClientsPage';
import ManageRolesPage from '@/pages/ManageRolesPage';
import ManageTasksPage from '@/pages/ManageTasksPage';
import NewProjectPage from '@/pages/NewProjectPage';
import ProjectDetailPage from '@/pages/ProjectDetailPage';
import ProjectsListPage from '@/pages/ProjectsListPage';
import RegisterPage from '@/pages/RegisterPage';
import ReportsPage from '@/pages/ReportsPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import TeamPage from '@/pages/TeamPage';
import { useAuthStore } from '@/store/authStore';

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <RegisterPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicOnlyRoute>
            <ForgotPasswordPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicOnlyRoute>
            <ResetPasswordPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/dashboard"
        element={<Navigate to="/time" replace />}
      />
      <Route
        path="/time"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <ProjectsListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/new"
        element={
          <ProtectedRoute>
            <RequireRole allow={['owner', 'admin']}>
              <NewProjectPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:id"
        element={
          <ProtectedRoute>
            <ProjectDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients/:id"
        element={
          <ProtectedRoute>
            <ClientDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/team"
        element={
          <ProtectedRoute>
            <RequireRole allow={['owner', 'admin']}>
              <TeamPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />
      <Route
        path="/team/invite"
        element={
          <ProtectedRoute>
            <RequireRole allow={['owner', 'admin']}>
              <InvitePage />
            </RequireRole>
          </ProtectedRoute>
        }
      />
      <Route
        path="/team/:id/edit"
        element={
          <ProtectedRoute>
            <RequireRole allow={['owner', 'admin']}>
              <EditTeamMemberPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <ReportsPage />
          </ProtectedRoute>
        }
      />
      <Route path="/manage" element={<Navigate to="/manage/clients" replace />} />
      <Route
        path="/manage/clients"
        element={
          <ProtectedRoute>
            <RequireRole allow={['owner', 'admin']}>
              <ManageClientsPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manage/clients/:id/edit"
        element={
          <ProtectedRoute>
            <RequireRole allow={['owner', 'admin']}>
              <EditClientPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manage/tasks"
        element={
          <ProtectedRoute>
            <RequireRole allow={['owner', 'admin']}>
              <ManageTasksPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manage/roles"
        element={
          <ProtectedRoute>
            <RequireRole allow={['owner', 'admin']}>
              <ManageRolesPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/time" replace />} />
      <Route path="*" element={<Navigate to="/time" replace />} />
    </Routes>
  );
}

import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import ProtectedRoute from '@/components/ProtectedRoute';
import PublicOnlyRoute from '@/components/PublicOnlyRoute';
import RequireModule from '@/components/RequireModule';
import RequireRole from '@/components/RequireRole';
import AcceptInvitePage from '@/pages/AcceptInvitePage';
import ClientDetailPage from '@/pages/ClientDetailPage';
import DashboardPage from '@/pages/DashboardPage';
import EditClientPage from '@/pages/EditClientPage';
import EditTeamMemberPage from '@/pages/EditTeamMemberPage';
import TeamMemberDetailPage from '@/pages/TeamMemberDetailPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import InvitePage from '@/pages/InvitePage';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import ManageClientsPage from '@/pages/ManageClientsPage';
import MicrosoftCallbackPage from '@/pages/MicrosoftCallbackPage';
import ManageRolesPage from '@/pages/ManageRolesPage';
import ManageTasksPage from '@/pages/ManageTasksPage';
import SettingsIntegrationsPage from '@/pages/SettingsIntegrationsPage';
import PreferencesPage from '@/pages/settings/PreferencesPage';
import ModulesPage from '@/pages/settings/ModulesPage';
import SignInSecurityPage from '@/pages/settings/SignInSecurityPage';
import ImportExportPage from '@/pages/settings/ImportExportPage';
import NewProjectPage from '@/pages/NewProjectPage';
import ProjectDetailPage from '@/pages/ProjectDetailPage';
import ProjectsListPage from '@/pages/ProjectsListPage';
import RegisterPage from '@/pages/RegisterPage';
import BasicInfoTab from '@/pages/profile/BasicInfoTab';
import AssignedProjectsTab from '@/pages/profile/AssignedProjectsTab';
import AssignedPeopleTab from '@/pages/profile/AssignedPeopleTab';
import PermissionsTab from '@/pages/profile/PermissionsTab';
import NotificationsTab from '@/pages/profile/NotificationsTab';
import ReferAFriendPage from '@/pages/profile/ReferAFriendPage';
import ReportsLayout from '@/pages/reports/ReportsLayout';
import TimeReportPage from '@/pages/reports/TimeReportPage';
import ProfitabilityReportPage from '@/pages/reports/ProfitabilityReportPage';
import DetailedTimeReportPage from '@/pages/reports/DetailedTimeReportPage';
import ActivityLogReportPage from '@/pages/reports/ActivityLogReportPage';
import SavedReportsPage from '@/pages/reports/SavedReportsPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import TeamPage from '@/pages/TeamPage';
import { useAuthStore } from '@/store/authStore';
import { useAccountSettingsStore } from '@/store/accountSettingsStore';

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const loadSettings = useAccountSettingsStore((s) => s.load);
  const resetSettings = useAccountSettingsStore((s) => s.reset);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (accessToken && user) {
      void loadSettings();
    } else {
      resetSettings();
    }
  }, [accessToken, user, loadSettings, resetSettings]);

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
      <Route path="/auth/microsoft/callback" element={<MicrosoftCallbackPage />} />
      <Route
        path="/dashboard"
        element={<Navigate to="/time" replace />}
      />
      <Route
        path="/time"
        element={
          <ProtectedRoute>
            <RequireModule module="time_tracking">
              <DashboardPage />
            </RequireModule>
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
              <RequireModule module="team">
                <TeamPage />
              </RequireModule>
            </RequireRole>
          </ProtectedRoute>
        }
      />
      <Route
        path="/team/invite"
        element={
          <ProtectedRoute>
            <RequireRole allow={['owner', 'admin']}>
              <RequireModule module="team">
                <InvitePage />
              </RequireModule>
            </RequireRole>
          </ProtectedRoute>
        }
      />
      <Route
        path="/team/:id"
        element={
          <ProtectedRoute>
            <RequireRole allow={['owner', 'admin', 'manager']}>
              <RequireModule module="team">
                <TeamMemberDetailPage />
              </RequireModule>
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
            <RequireRole allow={['owner', 'admin', 'manager', 'member']}>
              <RequireModule module="reports">
                <ReportsLayout />
              </RequireModule>
            </RequireRole>
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/reports/time" replace />} />
        <Route path="time" element={<TimeReportPage />} />
        <Route
          path="profitability"
          element={
            <RequireRole allow={['owner', 'admin']}>
              <ProfitabilityReportPage />
            </RequireRole>
          }
        />
        <Route path="detailed-time" element={<DetailedTimeReportPage />} />
        <Route
          path="activity-log"
          element={
            <RequireModule module="activity_log">
              <ActivityLogReportPage />
            </RequireModule>
          }
        />
        <Route path="saved" element={<SavedReportsPage />} />
      </Route>
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
      <Route path="/settings" element={<Navigate to="/settings/preferences" replace />} />
      <Route
        path="/settings/preferences"
        element={
          <ProtectedRoute>
            <RequireRole allow={['owner', 'admin', 'manager', 'member']}>
              <PreferencesPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/integrations"
        element={
          <ProtectedRoute>
            <RequireRole allow={['owner', 'admin']}>
              <SettingsIntegrationsPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/modules"
        element={
          <ProtectedRoute>
            <RequireRole allow={['owner', 'admin']}>
              <ModulesPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/security"
        element={
          <ProtectedRoute>
            <RequireRole allow={['owner', 'admin']}>
              <SignInSecurityPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/import-export"
        element={
          <ProtectedRoute>
            <RequireRole allow={['owner', 'admin']}>
              <ImportExportPage />
            </RequireRole>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <BasicInfoTab />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/assigned-projects"
        element={
          <ProtectedRoute>
            <AssignedProjectsTab />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/assigned-people"
        element={
          <ProtectedRoute>
            <RequireRole allow={['owner', 'admin', 'manager']}>
              <AssignedPeopleTab />
            </RequireRole>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/permissions"
        element={
          <ProtectedRoute>
            <PermissionsTab />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/notifications"
        element={
          <ProtectedRoute>
            <NotificationsTab />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/refer"
        element={
          <ProtectedRoute>
            <ReferAFriendPage />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<LandingPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

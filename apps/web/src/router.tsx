import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/Login';
import { MainLayout } from './pages/MainLayout';
import { ProjectListPage } from './pages/ProjectList';
import { ProjectDetailPage } from './pages/ProjectDetail';
import { MemoryConsolePage } from './pages/MemoryConsole';
import { SkillLibraryPage } from './pages/SkillLibrary';
import { ExperienceCardsPage } from './pages/ExperienceCards';
import { KnowledgeBasePage } from './pages/KnowledgeBase';
import { AgentRunsPage } from './pages/AgentRuns';
import { AuditPage } from './pages/Audit';
import { SettingsPage } from './pages/Settings';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      { path: 'projects', element: <ProjectListPage /> },
      { path: 'projects/:id', element: <ProjectDetailPage /> },
      { path: 'memory', element: <MemoryConsolePage /> },
      { path: 'skills', element: <SkillLibraryPage /> },
      { path: 'experience', element: <ExperienceCardsPage /> },
      { path: 'knowledge', element: <KnowledgeBasePage /> },
      { path: 'runs', element: <AgentRunsPage /> },
      { path: 'audit', element: <AuditPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);
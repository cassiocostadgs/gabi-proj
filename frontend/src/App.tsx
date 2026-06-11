import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from './pages/login/LoginPage'
import { ValidatePage } from './pages/validate/ValidatePage'
import { ResultsPage } from './pages/results/ResultsPage'
import { SubmissionsPage } from './pages/submissions/SubmissionsPage'
import { SubmissionDetailPage } from './pages/submissions/SubmissionDetailPage'
import { AdminPage } from './pages/admin/AdminPage'
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute'
import { useAuth } from './hooks/useAuth'

function HomeRedirect() {
  const { user } = useAuth()
  return <Navigate to={user?.is_admin ? '/admin/task' : '/validate'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/validate" element={<ValidatePage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/submissions" element={<SubmissionsPage />} />
          <Route path="/submissions/:id" element={<SubmissionDetailPage />} />
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<Navigate to="/admin/task" replace />} />
            <Route path="/admin/:section" element={<AdminPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

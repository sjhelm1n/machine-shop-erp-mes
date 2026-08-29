import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { OnboardingGate } from './components/OnboardingGate'
import { useAuth } from './context/AuthContext'
import { AppShell } from './layouts/AppShell'

const AuthConfirmPage = lazy(() => import('./pages/AuthPages').then((module) => ({ default: module.AuthConfirmPage })))
const ForgotPasswordPage = lazy(() => import('./pages/AuthPages').then((module) => ({ default: module.ForgotPasswordPage })))
const LoginPage = lazy(() => import('./pages/AuthPages').then((module) => ({ default: module.LoginPage })))
const UpdatePasswordPage = lazy(() => import('./pages/AuthPages').then((module) => ({ default: module.UpdatePasswordPage })))
const CreateAccountPage = lazy(() => import('./pages/OnboardingPages').then((module) => ({ default: module.CreateAccountPage })))
const FinishAccountPage = lazy(() => import('./pages/OnboardingPages').then((module) => ({ default: module.FinishAccountPage })))
const SetupPage = lazy(() => import('./pages/OnboardingPages').then((module) => ({ default: module.SetupPage })))
const CustomersPage = lazy(() => import('./pages/CustomersPage').then((module) => ({ default: module.CustomersPage })))
const CustomerPortalViewPage = lazy(() => import('./pages/CustomerPortalViewPage').then((module) => ({ default: module.CustomerPortalViewPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const DocumentsPage = lazy(() => import('./pages/DocumentsPage').then((module) => ({ default: module.DocumentsPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))
const PortalHomePage = lazy(() => import('./pages/PortalHomePage').then((module) => ({ default: module.PortalHomePage })))
const ProductionPage = lazy(() => import('./pages/ProductionPage').then((module) => ({ default: module.ProductionPage })))
const QuestionsPage = lazy(() => import('./pages/QuestionsPage').then((module) => ({ default: module.QuestionsPage })))
const RoutingTemplatesPage = lazy(() => import('./pages/RoutingTemplatesPage').then((module) => ({ default: module.RoutingTemplatesPage })))
const SalesOrderDetailPage = lazy(() => import('./pages/SalesOrderDetailPage').then((module) => ({ default: module.SalesOrderDetailPage })))
const SalesOrdersPage = lazy(() => import('./pages/SalesOrdersPage').then((module) => ({ default: module.SalesOrdersPage })))
const WorkOrderDetailPage = lazy(() => import('./pages/WorkOrderDetailPage').then((module) => ({ default: module.WorkOrderDetailPage })))
const WorkOrdersPage = lazy(() => import('./pages/WorkOrdersPage').then((module) => ({ default: module.WorkOrdersPage })))
const UsersPage = lazy(() => import('./pages/UsersPage').then((module) => ({ default: module.UsersPage })))

function HomeRedirect() {
  const { session, profile, loading } = useAuth()
  if (loading) return null
  return <Navigate to={profile?.role === 'customer' ? '/portal' : profile ? '/app' : session ? '/finish-account' : '/login'} replace />
}

export default function App() {
  return <Suspense fallback={<main className="centered"><div className="loading-state">Loading…</div></main>}><Routes>
    <Route path="/" element={<HomeRedirect />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/auth/confirm" element={<AuthConfirmPage />} />
    <Route path="/update-password" element={<UpdatePasswordPage />} />
    <Route path="/create-account" element={<CreateAccountPage />} />
    <Route path="/finish-account" element={<FinishAccountPage />} />
    <Route path="/setup" element={<ProtectedRoute role="manufacturer"><SetupPage /></ProtectedRoute>} />
    <Route path="/produce/:workOrderId/:stepId" element={<ProductionPage />} />
    <Route path="/app" element={<ProtectedRoute role="manufacturer"><OnboardingGate><AppShell /></OnboardingGate></ProtectedRoute>}>
      <Route index element={<DashboardPage />} />
      <Route path="customers" element={<CustomersPage />} />
      <Route path="customers/portal-view" element={<CustomerPortalViewPage />} />
      <Route path="sales-orders" element={<SalesOrdersPage />} />
      <Route path="sales-orders/:orderId" element={<SalesOrderDetailPage />} />
      <Route path="work-orders" element={<WorkOrdersPage />} />
      <Route path="work-orders/:workOrderId" element={<WorkOrderDetailPage />} />
      <Route path="routing" element={<RoutingTemplatesPage />} />
      <Route path="questions" element={<QuestionsPage />} />
      <Route path="documents" element={<DocumentsPage />} />
      <Route path="users" element={<UsersPage />} />
      <Route path="invoices" element={<Navigate to="/app/documents" replace />} />
    </Route>
    <Route path="/portal" element={<ProtectedRoute role="customer"><AppShell /></ProtectedRoute>}>
      <Route index element={<PortalHomePage />} />
      <Route path="orders/:orderId" element={<SalesOrderDetailPage />} />
      <Route path="questions" element={<QuestionsPage />} />
      <Route path="documents" element={<DocumentsPage />} />
      <Route path="users" element={<UsersPage />} />
      <Route path="invoices" element={<Navigate to="/portal/documents" replace />} />
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Routes></Suspense>
}

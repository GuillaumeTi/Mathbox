import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import ProfDashboard from './pages/ProfDashboard';
import StudentDashboard from './pages/StudentDashboard';
import ParentDashboard from './pages/ParentDashboard';
import Room from './pages/Room';
import Cloud from './pages/Cloud';
import Shop from './pages/Shop';
import Billing from './pages/Billing';
import InvitePage from './pages/InvitePage';
import MagicLogin from './pages/MagicLogin';

function getRoleHome(role) {
    if (role === 'PROFESSOR' || role === 'PROF') return '/dashboard';
    if (role === 'PARENT') return '/parent';
    return '/student';
}

function ProtectedRoute({ children, allowedRoles }) {
    const { user, token } = useAuthStore();
    if (!token || !user) return <Navigate to="/login" replace />;
    const effectiveRole = user.role === 'PROF' ? 'PROFESSOR' : user.role;
    if (allowedRoles && !allowedRoles.includes(effectiveRole)) {
        return <Navigate to={getRoleHome(effectiveRole)} replace />;
    }
    return children;
}

function AuthRedirect({ children }) {
    const { user, token } = useAuthStore();
    if (token && user) {
        return <Navigate to={getRoleHome(user.role)} replace />;
    }
    return children;
}

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* Public */}
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<AuthRedirect><Login /></AuthRedirect>} />
                <Route path="/register" element={<AuthRedirect><Register /></AuthRedirect>} />
                <Route path="/invite/:code" element={<InvitePage />} />
                <Route path="/magic-login/:token" element={<MagicLogin />} />

                {/* Professor */}
                <Route path="/dashboard" element={
                    <ProtectedRoute allowedRoles={['PROFESSOR']}><ProfDashboard /></ProtectedRoute>
                } />
                <Route path="/shop" element={
                    <ProtectedRoute allowedRoles={['PROFESSOR']}><Shop /></ProtectedRoute>
                } />

                {/* Parent */}
                <Route path="/parent" element={
                    <ProtectedRoute allowedRoles={['PARENT']}><ParentDashboard /></ProtectedRoute>
                } />

                {/* Student */}
                <Route path="/student" element={
                    <ProtectedRoute allowedRoles={['STUDENT']}><StudentDashboard /></ProtectedRoute>
                } />

                {/* Shared */}
                <Route path="/room/:courseCode" element={
                    <ProtectedRoute><Room /></ProtectedRoute>
                } />
                <Route path="/cloud" element={
                    <ProtectedRoute><Cloud /></ProtectedRoute>
                } />
                <Route path="/billing" element={
                    <ProtectedRoute allowedRoles={['PROFESSOR']}><Billing /></ProtectedRoute>
                } />

                {/* Catch all */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

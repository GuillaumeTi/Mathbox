import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import ProfDashboard from './pages/ProfDashboard';
import StudentDashboard from './pages/StudentDashboard';
import Room from './pages/Room';
import Cloud from './pages/Cloud';
import Shop from './pages/Shop';

function ProtectedRoute({ children, allowedRoles }) {
    const { user, token } = useAuthStore();
    if (!token || !user) return <Navigate to="/login" replace />;
    if (allowedRoles && !allowedRoles.includes(user.role)) {
        return <Navigate to={user.role === 'PROF' ? '/dashboard' : '/student'} replace />;
    }
    return children;
}

function AuthRedirect({ children }) {
    const { user, token } = useAuthStore();
    if (token && user) {
        return <Navigate to={user.role === 'PROF' ? '/dashboard' : '/student'} replace />;
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

                {/* Professor */}
                <Route path="/dashboard" element={
                    <ProtectedRoute allowedRoles={['PROF']}><ProfDashboard /></ProtectedRoute>
                } />
                <Route path="/shop" element={
                    <ProtectedRoute allowedRoles={['PROF']}><Shop /></ProtectedRoute>
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

                {/* Catch all */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

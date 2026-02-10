import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import ProfessorDashboard from './pages/ProfessorDashboard';
import StudentDashboard from './pages/StudentDashboard';
import VideoRoom from './pages/VideoRoom';

function App() {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        const storedToken = localStorage.getItem('token');
        if (storedUser && storedToken) {
            setUser(JSON.parse(storedUser));
            setToken(storedToken);
        }
    }, []);

    const handleLogin = (userData, authToken) => {
        setUser(userData);
        setToken(authToken);
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('token', authToken);
    };

    const handleLogout = () => {
        setUser(null);
        setToken(null);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
    };

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={
                    user ? <Navigate to={user.role === 'PROF' ? '/professor' : '/student'} /> : <Login onLogin={handleLogin} />
                } />
                <Route path="/register" element={
                    user ? <Navigate to={user.role === 'PROF' ? '/professor' : '/student'} /> : <Register onLogin={handleLogin} />
                } />
                <Route path="/professor" element={
                    user && user.role === 'PROF' ? <ProfessorDashboard user={user} token={token} onLogout={handleLogout} /> : <Navigate to="/login" />
                } />
                <Route path="/student" element={
                    user && user.role === 'STUDENT' ? <StudentDashboard user={user} token={token} onLogout={handleLogout} /> : <Navigate to="/login" />
                } />
                <Route path="/room/:roomName" element={
                    user ? <VideoRoom user={user} token={token} /> : <Navigate to="/login" />
                } />
                <Route path="/" element={<Landing />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;

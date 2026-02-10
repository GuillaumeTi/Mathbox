import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';

function ProfessorDashboard({ user, token, onLogout }) {
    const [courses, setCourses] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [joinCode, setJoinCode] = useState('');
    const [onlineStudents, setOnlineStudents] = useState(new Set());
    const [formData, setFormData] = useState({
        student_name: '',
        subject: '',
        level: '',
        schedule_day: '',
        schedule_time: '',
    });
    const [socket, setSocket] = useState(null); // Added socket state
    const navigate = useNavigate();

    useEffect(() => {
        fetchCourses();

        // Setup Socket.io connection
        const newSocket = io({
            auth: { token }
        });

        newSocket.on('connect', () => {
            console.log('Socket connected');
        });

        newSocket.on('student_online', (data) => {
            console.log('Student online event:', data);
            if (data.status === 'online') {
                setOnlineStudents(prev => new Set([...prev, data.student_id]));
            } else {
                setOnlineStudents(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(data.student_id);
                    return newSet;
                });
            }
        });

        setSocket(newSocket);

        // Function to fetch room status
        const fetchRoomStatus = async () => {
            try {
                const response = await fetch('/api/rooms/status', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    const onlineStudentIds = new Set(
                        data.rooms
                            .filter(room => room.is_online && room.student_id)
                            .map(room => room.student_id)
                    );
                    setOnlineStudents(onlineStudentIds);
                    console.log('Room status updated:', onlineStudentIds);
                }
            } catch (error) {
                console.error('Error polling room status:', error);
            }
        };

        // Fetch room status immediately on mount
        fetchRoomStatus();

        // Then poll room status every 5 seconds as backup
        const pollInterval = setInterval(fetchRoomStatus, 5000);

        return () => {
            newSocket.disconnect();
            clearInterval(pollInterval);
        };
    }, [token]);

    const fetchCourses = async () => {
        try {
            const response = await fetch('/api/courses', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const data = await response.json();
            setCourses(data.courses || []);
        } catch (error) {
            console.error('Error fetching courses:', error);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch('/api/courses', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(formData),
            });
            const data = await response.json();
            setJoinCode(data.join_code);
            fetchCourses();
            setFormData({
                student_name: '',
                subject: '',
                level: '',
                schedule_day: '',
                schedule_time: '',
            });
        } catch (error) {
            console.error('Error creating course:', error);
        }
    };

    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

    return (
        <div className="min-h-screen bg-gray-100">
            <nav className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-gray-800">Tableau de bord - Professeur</h1>
                    <div className="flex items-center gap-4">
                        <span className="text-gray-600">{user.name}</span>
                        <button
                            onClick={onLogout}
                            className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600"
                        >
                            Déconnexion
                        </button>
                    </div>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold text-gray-800">Mes Étudiants</h2>
                    <button
                        onClick={() => setShowModal(true)}
                        className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                    >
                        + Ajouter un étudiant
                    </button>
                </div>

                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Matière</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Niveau</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Horaire</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {courses.map((course) => (
                                <tr key={course.id}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">{course.student_name || 'En attente'}</div>
                                        <div className="text-sm text-gray-500">{course.student_email || '-'}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{course.subject}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{course.level}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {course.schedule_day !== null ? `${days[course.schedule_day]} ${course.schedule_time}` : '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center`}>
                                            <span className={`h-3 w-3 rounded-full ${onlineStudents.has(course.student_id) ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                            <span className="ml-2 text-sm text-gray-600">
                                                {onlineStudents.has(course.student_id) ? 'En ligne' : 'Hors ligne'}
                                            </span>
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => navigate(`/room/${course.livekit_room_name}`)}
                                                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                                            >
                                                Rejoindre
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (window.confirm('Supprimer ce cours ?')) {
                                                        try {
                                                            await fetch(`/api/courses/${course.id}`, {
                                                                method: 'DELETE',
                                                                headers: { 'Authorization': `Bearer ${token}` },
                                                            });
                                                            fetchCourses();
                                                        } catch (error) {
                                                            console.error('Error deleting course:', error);
                                                        }
                                                    }
                                                }}
                                                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                                            >
                                                Supprimer
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Student Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h3 className="text-xl font-bold mb-4">Ajouter un étudiant</h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l'étudiant</label>
                                <input
                                    type="text"
                                    value={formData.student_name}
                                    onChange={(e) => setFormData({ ...formData, student_name: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Matière</label>
                                <input
                                    type="text"
                                    value={formData.subject}
                                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Niveau</label>
                                <input
                                    type="text"
                                    value={formData.level}
                                    onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Jour</label>
                                <select
                                    value={formData.schedule_day}
                                    onChange={(e) => setFormData({ ...formData, schedule_day: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                                >
                                    <option value="">Sélectionner...</option>
                                    {days.map((day, index) => (
                                        <option key={index} value={index}>{day}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Heure</label>
                                <input
                                    type="time"
                                    value={formData.schedule_time}
                                    onChange={(e) => setFormData({ ...formData, schedule_time: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                                />
                            </div>

                            {joinCode && (
                                <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
                                    <p className="font-bold">Code d'inscription: {joinCode}</p>
                                    <p className="text-sm">Partagez ce code avec votre étudiant</p>
                                </div>
                            )}

                            <div className="flex gap-2">
                                <button
                                    type="submit"
                                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
                                >
                                    Créer
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowModal(false);
                                        setJoinCode('');
                                    }}
                                    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
                                >
                                    Fermer
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ProfessorDashboard;

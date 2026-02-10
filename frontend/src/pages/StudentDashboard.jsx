import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function StudentDashboard({ user, token, onLogout }) {
    const [courses, setCourses] = useState([]);
    const [joinCode, setJoinCode] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        fetchCourses();
    }, []);

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

    const handleJoinCourse = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const response = await fetch('/api/courses/join', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ join_code: joinCode }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Code invalide');
            }

            setJoinCode('');
            fetchCourses();
        } catch (err) {
            setError(err.message);
        }
    };

    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

    return (
        <div className="min-h-screen bg-gray-100">
            <nav className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-gray-800">Tableau de bord - Étudiant</h1>
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
                <div className="bg-white rounded-lg shadow p-6 mb-6">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">Rejoindre un cours</h2>
                    <form onSubmit={handleJoinCourse} className="flex gap-2">
                        <input
                            type="text"
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                            placeholder="Entrez le code d'inscription"
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            required
                        />
                        <button
                            type="submit"
                            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                        >
                            Rejoindre
                        </button>
                    </form>
                    {error && (
                        <div className="mt-2 bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded">
                            {error}
                        </div>
                    )}
                </div>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">Mes Cours</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {courses.map((course) => (
                        <div key={course.id} className="bg-white rounded-lg shadow p-6">
                            <h3 className="text-lg font-semibold text-gray-800 mb-2">{course.subject}</h3>
                            <div className="space-y-2 text-sm text-gray-600 mb-4">
                                <p><span className="font-medium">Professeur:</span> {course.prof_name}</p>
                                <p><span className="font-medium">Niveau:</span> {course.level}</p>
                                {course.schedule_day !== null && (
                                    <p><span className="font-medium">Horaire:</span> {days[course.schedule_day]} à {course.schedule_time}</p>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => navigate(`/room/${course.livekit_room_name}`)}
                                    className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                                >
                                    Rejoindre la salle
                                </button>
                                <button
                                    onClick={async () => {
                                        if (window.confirm('Quitter ce cours ?')) {
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
                                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                                >
                                    Quitter
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {courses.length === 0 && (
                    <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                        Aucun cours inscrit. Utilisez un code d'inscription pour rejoindre un cours.
                    </div>
                )}
            </div>
        </div>
    );
}

export default StudentDashboard;

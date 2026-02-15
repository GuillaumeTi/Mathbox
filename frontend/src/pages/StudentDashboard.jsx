import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useCoursesStore } from '@/stores/coursesStore';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
    BookOpen, Plus, Video, Clock, LogOut, Cloud, ChevronRight,
    CalendarDays, CheckSquare, AlertCircle
} from 'lucide-react';

const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export default function StudentDashboard() {
    const { user, logout } = useAuthStore();
    const { courses, fetchCourses, joinCourse } = useCoursesStore();
    const navigate = useNavigate();
    const [showJoin, setShowJoin] = useState(false);
    const [code, setCode] = useState('');
    const [joining, setJoining] = useState(false);
    const [joinError, setJoinError] = useState('');
    const [homeworks, setHomeworks] = useState([]);

    useEffect(() => {
        fetchCourses();
        fetchHomeworks();
    }, []);

    const fetchHomeworks = async () => {
        try {
            const data = await api.get('/homework');
            setHomeworks(data.homeworks || []);
        } catch (err) { }
    };

    const handleJoin = async (e) => {
        e.preventDefault();
        setJoining(true);
        setJoinError('');
        try {
            await joinCourse(code.toUpperCase().trim());
            setShowJoin(false);
            setCode('');
        } catch (err) {
            setJoinError(err.message);
        }
        setJoining(false);
    };

    const canJoinRoom = (course) => {
        if (!course.startTime || course.dayOfWeek == null) return true;
        const now = new Date();
        if (now.getDay() !== course.dayOfWeek) return false;
        const [h, m] = course.startTime.split(':').map(Number);
        const courseTime = new Date();
        courseTime.setHours(h, m, 0, 0);
        const diff = (courseTime - now) / 60000; // minutes until start
        return diff <= 10;
    };

    const nextCourse = courses
        .filter(c => c.dayOfWeek != null && c.startTime)
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)[0];

    const pendingHomeworks = homeworks.filter(h => !h.completed);

    const handleLogout = () => { logout(); navigate('/'); };

    return (
        <div className="min-h-screen bg-background">
            {/* Nav */}
            <nav className="sticky top-0 z-40 glass-strong border-b">
                <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-bold gradient-text text-lg">MathBox</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link to="/cloud"><Button variant="ghost" size="sm"><Cloud className="w-4 h-4 mr-1.5" />Cloud</Button></Link>
                        <Button variant="ghost" size="sm" onClick={handleLogout}><LogOut className="w-4 h-4 mr-1.5" />Déconnexion</Button>
                    </div>
                </div>
            </nav>

            <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
                {/* Welcome */}
                <div>
                    <h1 className="text-3xl font-bold mb-1">
                        Salut, <span className="gradient-text">{user?.name?.split(' ')[0]}</span> 👋
                    </h1>
                    <p className="text-muted-foreground">
                        {nextCourse
                            ? `Ton prochain cours : ${nextCourse.title} — ${DAYS[nextCourse.dayOfWeek]} ${nextCourse.startTime}`
                            : "Aucun cours à venir pour le moment"}
                    </p>
                </div>

                {/* Timeline + Homework */}
                <div className="grid md:grid-cols-2 gap-6">
                    {/* Upcoming courses timeline */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <CalendarDays className="w-4 h-4 text-primary" />
                                Prochains cours
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {courses.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-4 text-center">Aucun cours. Ajoute un cours avec un code !</p>
                            ) : (
                                courses.slice(0, 5).map((course) => (
                                    <div key={course.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                                <BookOpen className="w-5 h-5 text-primary" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">{course.title}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {course.professor?.name} • {course.dayOfWeek != null ? DAYS[course.dayOfWeek] : ''} {course.startTime || ''}
                                                </p>
                                            </div>
                                        </div>
                                        <Link to={`/room/${course.code}`}>
                                            <Button
                                                variant={canJoinRoom(course) ? 'glow' : 'secondary'}
                                                size="sm"
                                                disabled={!canJoinRoom(course)}
                                            >
                                                <Video className="w-3.5 h-3.5 mr-1" />
                                                {canJoinRoom(course) ? 'Rejoindre' : 'Bientôt'}
                                            </Button>
                                        </Link>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    {/* Homework */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <CheckSquare className="w-4 h-4 text-amber-400" />
                                Devoirs ({pendingHomeworks.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {pendingHomeworks.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-4 text-center">Aucun devoir en cours 🎉</p>
                            ) : (
                                pendingHomeworks.slice(0, 5).map((hw) => (
                                    <div key={hw.id} className="p-3 rounded-lg bg-secondary/30">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <p className="text-sm font-medium">{hw.title}</p>
                                                <p className="text-xs text-muted-foreground mt-1">{hw.course?.title}</p>
                                            </div>
                                            {hw.dueDate && (
                                                <Badge variant="warning" className="text-xs">
                                                    <Clock className="w-3 h-3 mr-1" />
                                                    {new Date(hw.dueDate).toLocaleDateString('fr-FR')}
                                                </Badge>
                                            )}
                                        </div>
                                        {hw.description && (
                                            <p className="text-xs text-muted-foreground mt-2">{hw.description}</p>
                                        )}
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Course list + Add course */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold">Mes Cours</h2>
                        <Dialog open={showJoin} onOpenChange={setShowJoin}>
                            <DialogTrigger asChild>
                                <Button variant="glow" size="sm">
                                    <Plus className="w-4 h-4 mr-1.5" />
                                    Ajouter un cours
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Rejoindre un cours</DialogTitle>
                                </DialogHeader>
                                <form onSubmit={handleJoin} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Code du cours</Label>
                                        <Input
                                            placeholder="Ex: MAT-4821"
                                            value={code}
                                            onChange={(e) => { setCode(e.target.value); setJoinError(''); }}
                                            className="text-center text-lg font-mono tracking-widest"
                                            required
                                        />
                                    </div>
                                    {joinError && (
                                        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                                            <AlertCircle className="w-4 h-4 shrink-0" />
                                            {joinError}
                                        </div>
                                    )}
                                    <Button type="submit" variant="glow" className="w-full" disabled={joining}>
                                        {joining ? 'Inscription...' : 'Rejoindre'}
                                    </Button>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>

                    {courses.length === 0 ? (
                        <Card className="p-12 text-center">
                            <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                            <p className="text-lg font-medium mb-2">Aucun cours</p>
                            <p className="text-sm text-muted-foreground mb-4">Demande un code à ton professeur pour commencer.</p>
                        </Card>
                    ) : (
                        <div className="grid md:grid-cols-2 gap-4">
                            {courses.map((course) => (
                                <Card key={course.id} className="hover:border-primary/30 transition-all duration-200">
                                    <CardContent className="p-5">
                                        <div className="flex items-start justify-between mb-3">
                                            <div>
                                                <h3 className="font-semibold">{course.title}</h3>
                                                <p className="text-sm text-muted-foreground">Prof. {course.professor?.name}</p>
                                            </div>
                                            <Badge>{course.subject || 'Général'}</Badge>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {course.dayOfWeek != null ? DAYS[course.dayOfWeek] : ''} {course.startTime || ''} • {course.duration}min
                                            </p>
                                            <Link to={`/room/${course.code}`}>
                                                <Button variant="outline" size="sm">
                                                    <Video className="w-3.5 h-3.5 mr-1" /> Entrer
                                                </Button>
                                            </Link>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

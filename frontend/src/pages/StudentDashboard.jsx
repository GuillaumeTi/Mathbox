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
            const data = await api.get('/homeworks');
            setHomeworks(data.homeworks || []);
        } catch (err) { }
    };

    const markAsDone = async (id) => {
        try {
            await api.patch(`/homeworks/${id}`, { completed: true });
            setHomeworks(prev => prev.map(h => h.id === id ? { ...h, completed: true } : h));
        } catch (err) { console.error(err); }
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

    const pendingHomeworks = homeworks.filter(h => !h.completed);

    return (
        <div className="min-h-screen bg-background p-6">
            <div className="max-w-5xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">Bonjour, {user?.name} 👋</h1>
                        <p className="text-muted-foreground">Prêt à apprendre ?</p>
                    </div>
                    <div className="flex gap-2">
                        <Link to="/shop">
                            <Button variant="glow" size="sm">
                                <BookOpen className="w-4 h-4 mr-2" /> Boutique
                            </Button>
                        </Link>
                    </div>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                    {/* Stats / Next Class could go here, but using placeholder layout from before */}
                    <Card className="col-span-2">
                        <CardHeader>
                            <CardTitle>Devoirs à faire</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {pendingHomeworks.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-4 text-center">Aucun devoir en cours 🎉</p>
                            ) : (
                                <div className="space-y-3">
                                    {pendingHomeworks.slice(0, 5).map((hw) => (
                                        <div key={hw.id} className="p-3 rounded-lg bg-secondary/30 flex gap-3">
                                            <button onClick={() => markAsDone(hw.id)} className="mt-1 w-5 h-5 rounded border border-gray-400 hover:bg-primary hover:border-primary flex items-center justify-center transition-colors group" title="Marquer comme fait">
                                                <CheckSquare className="w-3 h-3 text-transparent group-hover:text-white" />
                                            </button>
                                            <div className="flex-1">
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
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Quick Info or whatever was there */}
                    <Card>
                        <CardHeader><CardTitle>Mon espace</CardTitle></CardHeader>
                        <CardContent className="space-y-2">
                            <Link to="/cloud">
                                <Button variant="outline" className="w-full justify-start">
                                    <Cloud className="w-4 h-4 mr-2" /> Mes fichiers
                                </Button>
                            </Link>
                            <Button variant="ghost" className="w-full justify-start text-red-400 hover:text-red-500 hover:bg-red-50" onClick={logout}>
                                <LogOut className="w-4 h-4 mr-2" /> Déconnexion
                            </Button>
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
            </div>
        </div>
    );
}

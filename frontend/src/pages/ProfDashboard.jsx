import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useCoursesStore } from '@/stores/coursesStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
    BookOpen, Plus, Video, Clock, Users, Brain, Bell,
    Copy, Trash2, LogOut, ShoppingBag, Cloud, ChevronRight,
    Calendar, BarChart3
} from 'lucide-react';
import { io } from 'socket.io-client';

const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function StatusDot({ status }) {
    const colors = {
        ONLINE: 'bg-emerald-400',
        OFFLINE: 'bg-gray-500',
        LATE: 'bg-amber-400',
        CANCELLED: 'bg-red-400',
    };
    return (
        <span className="relative flex h-3 w-3">
            {status === 'ONLINE' && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${colors[status] || colors.OFFLINE}`} />
        </span>
    );
}

function StatusLabel({ status }) {
    const labels = { ONLINE: 'En Ligne', OFFLINE: 'Hors Ligne', LATE: 'En Retard', CANCELLED: 'Annulé' };
    const variants = { ONLINE: 'success', OFFLINE: 'secondary', LATE: 'warning', CANCELLED: 'destructive' };
    return <Badge variant={variants[status] || 'secondary'}>{labels[status] || 'Hors Ligne'}</Badge>;
}

export default function ProfDashboard() {
    const { user, logout } = useAuthStore();
    const { courses, fetchCourses, createCourse, deleteCourse, roomStatuses, fetchRoomStatuses, updateRoomStatus } = useCoursesStore();
    const navigate = useNavigate();
    const [showCreate, setShowCreate] = useState(false);
    const [newCourse, setNewCourse] = useState({ title: '', subject: '', level: '', recurrence: 'WEEKLY', dayOfWeek: 1, startTime: '14:00', duration: 60 });
    const [creating, setCreating] = useState(false);
    const [createdCode, setCreatedCode] = useState('');
    const [copiedCode, setCopiedCode] = useState(false);

    useEffect(() => {
        fetchCourses();
        fetchRoomStatuses();

        // Socket.io for real-time status
        const socket = io(window.location.origin);
        socket.emit('subscribe:courses', user.id);

        socket.on('room:status_change', ({ courseId, status }) => {
            updateRoomStatus(courseId, status);
        });

        socket.on('course:student_joined', ({ courseId, studentName }) => {
            fetchCourses(); // Refresh to show student
        });

        // Poll statuses every 30s
        const interval = setInterval(fetchRoomStatuses, 30000);

        return () => {
            socket.disconnect();
            clearInterval(interval);
        };
    }, []);

    const handleCreate = async (e) => {
        e.preventDefault();
        setCreating(true);
        try {
            const data = await createCourse(newCourse);
            setCreatedCode(data.code);
        } catch (err) {
            alert(err.message);
        }
        setCreating(false);
    };

    const copyCode = () => {
        navigator.clipboard.writeText(createdCode);
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
    };

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const todayCourses = courses.filter(c => {
        if (!c.dayOfWeek && c.dayOfWeek !== 0) return false;
        return c.dayOfWeek === new Date().getDay();
    });

    const totalHours = courses.length * (newCourse.duration / 60);

    return (
        <div className="min-h-screen bg-background">
            {/* Top Nav */}
            <nav className="sticky top-0 z-40 glass-strong border-b">
                <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-bold gradient-text text-lg">MathBox</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link to="/cloud">
                            <Button variant="ghost" size="sm"><Cloud className="w-4 h-4 mr-1.5" />Cloud</Button>
                        </Link>
                        <Link to="/shop">
                            <Button variant="ghost" size="sm"><ShoppingBag className="w-4 h-4 mr-1.5" />Boutique</Button>
                        </Link>
                        <Button variant="ghost" size="sm" onClick={handleLogout}>
                            <LogOut className="w-4 h-4 mr-1.5" />Déconnexion
                        </Button>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
                {/* Welcome + Stats Row */}
                <div className="flex flex-col md:flex-row gap-6 justify-between">
                    <div>
                        <h1 className="text-3xl font-bold mb-1">
                            Bonjour, <span className="gradient-text">{user?.name?.split(' ')[0]}</span> 👋
                        </h1>
                        <p className="text-muted-foreground">
                            {todayCourses.length > 0
                                ? `Vous avez ${todayCourses.length} cours aujourd'hui`
                                : "Pas de cours prévu aujourd'hui"}
                        </p>
                    </div>

                    <div className="flex gap-4">
                        <Card className="px-5 py-3 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Calendar className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{courses.length}</p>
                                <p className="text-xs text-muted-foreground">Cours actifs</p>
                            </div>
                        </Card>
                        <Card className="px-5 py-3 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                <Clock className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{Math.round(totalHours)}</p>
                                <p className="text-xs text-muted-foreground">Heures / mois</p>
                            </div>
                        </Card>
                        <Card className="px-5 py-3 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                <Brain className="w-5 h-5 text-amber-400" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{user?.credits || 0}</p>
                                <p className="text-xs text-muted-foreground">Crédits IA</p>
                            </div>
                        </Card>
                    </div>
                </div>

                {/* Course List */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-primary" />
                            Mes Cours
                        </h2>

                        <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) { setCreatedCode(''); setNewCourse({ title: '', subject: '', level: '', recurrence: 'WEEKLY', dayOfWeek: 1, startTime: '14:00', duration: 60 }); } }}>
                            <DialogTrigger asChild>
                                <Button variant="glow" size="sm">
                                    <Plus className="w-4 h-4 mr-1.5" />
                                    Créer un cours
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>{createdCode ? '✅ Cours créé !' : 'Nouveau Cours'}</DialogTitle>
                                </DialogHeader>

                                {createdCode ? (
                                    <div className="text-center space-y-4 py-4">
                                        <p className="text-muted-foreground">Partagez ce code avec votre élève :</p>
                                        <div className="flex items-center justify-center gap-3">
                                            <span className="text-3xl font-mono font-bold tracking-widest gradient-text">{createdCode}</span>
                                            <Button variant="outline" size="icon" onClick={copyCode}>
                                                <Copy className="w-4 h-4" />
                                            </Button>
                                        </div>
                                        {copiedCode && <p className="text-sm text-emerald-400">Copié !</p>}
                                        <Button variant="glow" onClick={() => { setShowCreate(false); setCreatedCode(''); }}>
                                            Terminé
                                        </Button>
                                    </div>
                                ) : (
                                    <form onSubmit={handleCreate} className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2 col-span-2">
                                                <Label>Titre du cours</Label>
                                                <Input placeholder="Maths - Algèbre" value={newCourse.title} onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })} required />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Matière</Label>
                                                <Input placeholder="Mathématiques" value={newCourse.subject} onChange={(e) => setNewCourse({ ...newCourse, subject: e.target.value })} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Niveau</Label>
                                                <Input placeholder="Terminale S" value={newCourse.level} onChange={(e) => setNewCourse({ ...newCourse, level: e.target.value })} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Jour</Label>
                                                <select
                                                    className="flex h-11 w-full rounded-lg border border-input bg-secondary/50 px-4 py-2 text-sm"
                                                    value={newCourse.dayOfWeek}
                                                    onChange={(e) => setNewCourse({ ...newCourse, dayOfWeek: parseInt(e.target.value) })}
                                                >
                                                    {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Heure</Label>
                                                <Input type="time" value={newCourse.startTime} onChange={(e) => setNewCourse({ ...newCourse, startTime: e.target.value })} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Durée (min)</Label>
                                                <Input type="number" min={15} max={180} value={newCourse.duration} onChange={(e) => setNewCourse({ ...newCourse, duration: e.target.value })} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Récurrence</Label>
                                                <select
                                                    className="flex h-11 w-full rounded-lg border border-input bg-secondary/50 px-4 py-2 text-sm"
                                                    value={newCourse.recurrence}
                                                    onChange={(e) => setNewCourse({ ...newCourse, recurrence: e.target.value })}
                                                >
                                                    <option value="ONCE">Unique</option>
                                                    <option value="WEEKLY">Hebdomadaire</option>
                                                    <option value="BIWEEKLY">Bi-mensuel</option>
                                                </select>
                                            </div>
                                        </div>
                                        <Button type="submit" variant="glow" className="w-full" disabled={creating}>
                                            {creating ? 'Création...' : 'Créer le cours'}
                                        </Button>
                                    </form>
                                )}
                            </DialogContent>
                        </Dialog>
                    </div>

                    {courses.length === 0 ? (
                        <Card className="p-12 text-center">
                            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                            <p className="text-lg font-medium mb-2">Aucun cours pour le moment</p>
                            <p className="text-sm text-muted-foreground mb-4">Créez votre premier cours et partagez le code avec votre élève.</p>
                            <Button variant="glow" onClick={() => setShowCreate(true)}>
                                <Plus className="w-4 h-4 mr-1.5" />
                                Créer un cours
                            </Button>
                        </Card>
                    ) : (
                        <div className="rounded-xl border overflow-hidden">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b bg-secondary/30">
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Élève</th>
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Matière</th>
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Niveau</th>
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Jour / Heure</th>
                                        <th className="text-center p-4 text-sm font-medium text-muted-foreground">Statut</th>
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Code</th>
                                        <th className="text-right p-4 text-sm font-medium text-muted-foreground">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {courses.map((course) => {
                                        const rs = roomStatuses[course.id];
                                        const status = rs?.status || 'OFFLINE';
                                        return (
                                            <tr key={course.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                                                <td className="p-4">
                                                    <div className="flex items-center gap-2">
                                                        <StatusDot status={status} />
                                                        <span className="text-sm font-medium">
                                                            {course.student?.name || <span className="text-muted-foreground italic">En attente...</span>}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-sm">{course.subject || '—'}</td>
                                                <td className="p-4 text-sm">{course.level || '—'}</td>
                                                <td className="p-4 text-sm">
                                                    {course.dayOfWeek != null ? DAYS[course.dayOfWeek] : '—'} {course.startTime || ''}
                                                </td>
                                                <td className="p-4 text-center"><StatusLabel status={status} /></td>
                                                <td className="p-4">
                                                    <code className="text-xs bg-secondary/50 px-2 py-1 rounded font-mono">{course.code}</code>
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Link to={`/room/${course.code}`}>
                                                            <Button variant="outline" size="sm">
                                                                <Video className="w-3.5 h-3.5 mr-1" />
                                                                Entrer
                                                            </Button>
                                                        </Link>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-400" onClick={() => {
                                                            if (confirm('Supprimer ce cours ?')) deleteCourse(course.id);
                                                        }}>
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

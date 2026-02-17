import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useCoursesStore } from '@/stores/coursesStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import {
    BookOpen, Plus, Video, Clock, Users, Brain, Bell,
    Copy, Trash2, LogOut, ShoppingBag, Cloud, ChevronRight,
    Calendar, BarChart3, ChevronDown, ChevronUp, MoreVertical, Edit, XCircle, RotateCcw, CheckSquare, Square, Archive
} from 'lucide-react';
import { io } from 'socket.io-client';
import { api } from '@/lib/api';
import HomeworkModal from '@/components/HomeworkModal';

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

function ActionMenu({ course, onEdit, onCancel, onDelete }) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [menuRef]);

    return (
        <div className="relative inline-block text-left" ref={menuRef}>
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)}>
                <MoreVertical className="w-4 h-4" />
            </Button>
            {isOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-card border border-border ring-1 ring-black ring-opacity-5 z-50">
                    <div className="py-1" role="menu">
                        <button
                            className="flex w-full items-center px-4 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                            onClick={() => { setIsOpen(false); onEdit(course); }}
                        >
                            <Edit className="mr-2 h-4 w-4" /> Modifier
                        </button>
                        <button
                            className="flex w-full items-center px-4 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                            onClick={() => { setIsOpen(false); onCancel(course); }}
                        >
                            {course.status === 'CANCELLED' ? (
                                <>
                                    <RotateCcw className="mr-2 h-4 w-4 text-emerald-500" /> Réactiver
                                </>
                            ) : (
                                <>
                                    <XCircle className="mr-2 h-4 w-4 text-orange-500" /> Annuler
                                </>
                            )}
                        </button>
                        <button
                            className="flex w-full items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => { setIsOpen(false); onDelete(course.id); }}
                        >
                            <Trash2 className="mr-2 h-4 w-4" /> Supprimer
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function ProfDashboard() {
    const { user, logout } = useAuthStore();
    const { courses, fetchCourses, createCourse, deleteCourse, roomStatuses, fetchRoomStatuses, updateRoomStatus } = useCoursesStore();
    const navigate = useNavigate();

    // Create/Edit State
    const [showCreate, setShowCreate] = useState(false);
    const [newCourse, setNewCourse] = useState({ title: '', subject: '', level: '', recurrence: 'WEEKLY', dayOfWeek: 1, startTime: '14:00', duration: 60 });
    const [isEditing, setIsEditing] = useState(false);
    const [courseToEdit, setCourseToEdit] = useState(null);

    const [creating, setCreating] = useState(false);
    const [createdCode, setCreatedCode] = useState('');
    const [copiedCode, setCopiedCode] = useState(false);

    // Expansion State
    const [expandedCourseId, setExpandedCourseId] = useState(null);
    const [courseHomeworks, setCourseHomeworks] = useState({});
    const [loadingHomeworks, setLoadingHomeworks] = useState(false);
    const [showHomeworkModal, setShowHomeworkModal] = useState(false);
    const [selectedCourseId, setSelectedCourseId] = useState(null);

    // Delete confirmation
    const [courseToDelete, setCourseToDelete] = useState(null);

    // Handlers
    const toggleExpand = async (courseId) => {
        if (expandedCourseId === courseId) {
            setExpandedCourseId(null);
            return;
        }
        setExpandedCourseId(courseId);
        if (!courseHomeworks[courseId]) {
            setLoadingHomeworks(true);
            try {
                const data = await api.get(`/homeworks?courseId=${courseId}`);
                setCourseHomeworks(prev => ({ ...prev, [courseId]: data.homeworks || [] }));
            } catch (err) {
                console.error("Failed to load homeworks", err);
            } finally {
                setLoadingHomeworks(false);
            }
        }
    };

    const handleEdit = (course) => {
        setCourseToEdit(course);
        setNewCourse({ ...course });
        setIsEditing(true);
        setShowCreate(true);
    };

    const handleSaveEdit = async (e) => {
        e.preventDefault();
        setCreating(true);
        try {
            await api.put(`/courses/${courseToEdit.id}`, newCourse);
            await fetchCourses();
            setShowCreate(false);
            setIsEditing(false);
            setCourseToEdit(null);
            // Reset for create mode
            setNewCourse({ title: '', subject: '', level: '', recurrence: 'WEEKLY', dayOfWeek: 1, startTime: '14:00', duration: 60 });
        } catch (err) {
            alert("Erreur lors de la modification: " + err.message);
        }
        setCreating(false);
    };

    const handleCancel = async (course) => {
        const newStatus = course.status === 'CANCELLED' ? 'SCHEDULED' : 'CANCELLED';
        if (!confirm(`Voulez-vous ${newStatus === 'CANCELLED' ? 'annuler' : 'réactiver'} ce cours ?`)) return;
        try {
            await api.put(`/courses/${course.id}`, { status: newStatus });
            await fetchCourses();
        } catch (err) {
            alert("Erreur: " + err.message);
        }
    };

    const handleDelete = (courseId) => {
        setCourseToDelete(courseId);
    };

    const handleConfirmDelete = async (keepFiles) => {
        if (!courseToDelete) return;
        try {
            await api.delete(`/courses/${courseToDelete}?keepFiles=${keepFiles}`);

            // Update store
            useCoursesStore.setState((s) => ({ courses: s.courses.filter((c) => c.id !== courseToDelete) }));
            setCourseToDelete(null);
        } catch (err) {
            alert("Erreur lors de la suppression: " + err.message);
        }
    };

    const handleDeleteHomework = async (courseId, homeworkId) => {
        if (!confirm("Supprimer ce devoir ?")) return;

        // Optimistic update
        const previousHomeworks = { ...courseHomeworks };
        setCourseHomeworks(prev => ({
            ...prev,
            [courseId]: prev[courseId].filter(h => h.id !== homeworkId)
        }));

        try {
            await api.delete(`/homeworks/${homeworkId}`);
        } catch (err) {
            console.error("Failed to delete homework", err);
            // Revert on failure
            setCourseHomeworks(previousHomeworks);
            alert("Erreur lors de la suppression du devoir.");
        }
    };

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

                        <Dialog open={showCreate} onOpenChange={(o) => {
                            setShowCreate(o);
                            if (!o) {
                                setCreatedCode('');
                                setIsEditing(false);
                                setCourseToEdit(null);
                                setNewCourse({ title: '', subject: '', level: '', recurrence: 'WEEKLY', dayOfWeek: 1, startTime: '14:00', duration: 60 });
                            }
                        }}>
                            <DialogTrigger asChild>
                                <Button variant="glow" size="sm">
                                    <Plus className="w-4 h-4 mr-1.5" />
                                    Créer un cours
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>
                                        {isEditing ? 'Modifier le cours' : (createdCode ? '✅ Cours créé !' : 'Nouveau Cours')}
                                    </DialogTitle>
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
                                    <form onSubmit={isEditing ? handleSaveEdit : handleCreate} className="space-y-4">
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
                                            {creating ? 'Enregistrement...' : (isEditing ? 'Enregistrer les modifications' : 'Créer le cours')}
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
                        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b bg-secondary/30">
                                        <th className="w-10 p-4"></th>
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Élève</th>
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Matière</th>
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Niveau</th>
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Jour / Heure</th>
                                        <th className="text-center p-4 text-sm font-medium text-muted-foreground">Statut</th>
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">Codé</th>
                                        <th className="text-right p-4 text-sm font-medium text-muted-foreground">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {courses.map((course) => {
                                        const rs = roomStatuses[course.id];
                                        // Priority: CANCELLED administrative status > Live Status > OFFLINE
                                        const status = course.status === 'CANCELLED' ? 'CANCELLED' : (rs?.status || 'OFFLINE');
                                        const isExpanded = expandedCourseId === course.id;

                                        return (
                                            <React.Fragment key={course.id}>
                                                <tr className={`border-b border-border/50 hover:bg-secondary/20 transition-colors ${isExpanded ? 'bg-secondary/10' : ''}`}>
                                                    <td className="p-4">
                                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleExpand(course.id)}>
                                                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                        </Button>
                                                    </td>
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
                                                    <td className="p-4 text-right">
                                                        <div className="flex items-center justify-end gap-2 relative">
                                                            {status !== 'CANCELLED' && (
                                                                <Link to={`/room/${course.code}`}>
                                                                    <Button variant="outline" size="sm">
                                                                        <Video className="w-3.5 h-3.5 mr-1" />
                                                                        Entrer
                                                                    </Button>
                                                                </Link>
                                                            )}
                                                            <ActionMenu
                                                                course={course}
                                                                onEdit={handleEdit}
                                                                onCancel={handleCancel}
                                                                onDelete={handleDelete}
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr className="bg-secondary/5 animate-in fade-in slide-in-from-top-1 duration-200">
                                                        <td colSpan={8} className="p-4 pl-14">
                                                            <div className="bg-background rounded-lg border p-4">
                                                                <div className="flex items-center justify-between mb-4">
                                                                    <h4 className="font-semibold flex items-center gap-2">
                                                                        <BookOpen className="w-4 h-4 text-primary" />
                                                                        Devoirs assignés
                                                                    </h4>
                                                                    <Button variant="ghost" size="sm" onClick={() => { setSelectedCourseId(course.id); setShowHomeworkModal(true); }}>
                                                                        <Plus className="w-4 h-4 mr-1" /> Ajouter un devoir
                                                                    </Button>
                                                                </div>

                                                                {loadingHomeworks && !courseHomeworks[course.id] ? (
                                                                    <div className="text-center py-4 text-muted-foreground">Chargement...</div>
                                                                ) : courseHomeworks[course.id]?.length > 0 ? (
                                                                    <ul className="space-y-2">
                                                                        {courseHomeworks[course.id].map(hw => (
                                                                            <li key={hw.id} className="flex items-start gap-3 p-3 rounded-md border bg-card hover:bg-accent/50 transition-colors group">
                                                                                <div className="mt-0.5">
                                                                                    {hw.completed ? (
                                                                                        <CheckSquare className="w-5 h-5 text-emerald-500" />
                                                                                    ) : (
                                                                                        <Square className="w-5 h-5 text-muted-foreground" />
                                                                                    )}
                                                                                </div>
                                                                                <div className="flex-1">
                                                                                    <div className="flex justify-between">
                                                                                        <span className={`${hw.completed ? 'line-through text-muted-foreground' : 'font-medium'}`}>{hw.title}</span>
                                                                                        <div className="flex items-center gap-2">
                                                                                            <span className="text-xs text-muted-foreground">{hw.dueDate ? new Date(hw.dueDate).toLocaleDateString() : 'Sans date'}</span>
                                                                                            <Button
                                                                                                variant="ghost"
                                                                                                size="icon"
                                                                                                className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500 hover:bg-red-50"
                                                                                                onClick={() => handleDeleteHomework(course.id, hw.id)}
                                                                                                title="Supprimer ce devoir"
                                                                                            >
                                                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                                            </Button>
                                                                                        </div>
                                                                                    </div>
                                                                                    {hw.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{hw.description}</p>}
                                                                                </div>
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                ) : (
                                                                    <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
                                                                        <p>Pas de devoirs en cours</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>

            <HomeworkModal
                courseId={selectedCourseId}
                isOpen={showHomeworkModal}
                onClose={() => setShowHomeworkModal(false)}
                onSuccess={() => {
                    // Refresh homeworks for the selected course
                    setCourseHomeworks(prev => {
                        const newState = { ...prev };
                        delete newState[selectedCourseId]; // clear cache to force refetch next time or implement active fetch
                        return newState;
                    });
                    // Actually improved UX: fetch immediately
                    if (selectedCourseId) {
                        api.get(`/homeworks?courseId=${selectedCourseId}`).then(data => {
                            setCourseHomeworks(prev => ({ ...prev, [selectedCourseId]: data.homeworks || [] }));
                        });
                    }
                }}
            />

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!courseToDelete} onOpenChange={(open) => !open && setCourseToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Supprimer le cours définitivement ?</DialogTitle>
                        <DialogDescription>
                            Cette action est irréversible. Le cours sera retiré de votre tableau de bord et de celui des élèves.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-2">
                        <p className="mb-4 text-sm font-medium">Voulez-vous conserver les fichiers associés ?</p>
                        <div className="flex flex-col gap-3">
                            <Button
                                variant="outline"
                                onClick={() => handleConfirmDelete(true)}
                                className="justify-start h-auto py-3 px-4 border-primary/20 hover:bg-primary/5 hover:text-primary"
                            >
                                <Archive className="mr-3 h-5 w-5 text-primary" />
                                <div className="text-left">
                                    <div className="font-semibold">Oui, conserver les fichiers</div>
                                    <div className="text-xs text-muted-foreground font-normal">
                                        Le dossier sera rénommé en "[ARCHIVED]..." dans votre espace personnel.
                                    </div>
                                </div>
                            </Button>

                            <Button
                                variant="outline"
                                onClick={() => handleConfirmDelete(false)}
                                className="justify-start h-auto py-3 px-4 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                            >
                                <Trash2 className="mr-3 h-5 w-5" />
                                <div className="text-left">
                                    <div className="font-semibold">Non, tout supprimer</div>
                                    <div className="text-xs text-muted-foreground/80 font-normal">
                                        Les fichiers seront détruits définitivement.
                                    </div>
                                </div>
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

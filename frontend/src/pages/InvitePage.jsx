import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BookOpen, Users, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function InvitePage() {
    const { code } = useParams();
    const { user, token } = useAuthStore();
    const navigate = useNavigate();
    const [course, setCourse] = useState(null);
    const [children, setChildren] = useState([]);
    const [loading, setLoading] = useState(true);
    const [enrolling, setEnrolling] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchCourse = async () => {
            try {
                const data = await api.get(`/invite/${code}`);
                setCourse(data.course);
            } catch (err) {
                setError('Lien d\'invitation invalide');
            }
            setLoading(false);
        };
        fetchCourse();
    }, [code]);

    useEffect(() => {
        if (user?.role === 'PARENT') {
            api.get('/auth/me').then(data => {
                if (data.user?.children) setChildren(data.user.children);
            });
        }
    }, [user]);

    const enrollChild = async (childId) => {
        setEnrolling(true);
        try {
            await api.post(`/invite/${code}/enroll`, { childId });
            setSuccess(true);
        } catch (err) {
            setError(err.message);
        }
        setEnrolling(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />

            <Card className="w-full max-w-md relative animate-fade-in">
                <CardHeader className="text-center space-y-3">
                    <Link to="/" className="inline-flex items-center justify-center gap-2 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                            <BookOpen className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-2xl font-bold gradient-text">MathBox</span>
                    </Link>
                    <CardTitle className="text-2xl">
                        {success ? 'Inscription réussie ! 🎉' : 'Invitation à un cours'}
                    </CardTitle>
                    {course && !success && (
                        <CardDescription>
                            Votre enfant a été invité à rejoindre
                        </CardDescription>
                    )}
                </CardHeader>

                <CardContent className="space-y-4">
                    {error && (
                        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {error}
                        </div>
                    )}

                    {course && !success && (
                        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center space-y-1">
                            <p className="font-semibold text-lg">{course.title}</p>
                            <p className="text-sm text-muted-foreground">
                                Prof. {course.professor?.name} • {course.subject || 'Général'}
                            </p>
                        </div>
                    )}

                    {success && (
                        <div className="flex flex-col items-center gap-3 py-4">
                            <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                            <p className="text-muted-foreground text-sm">Votre enfant est inscrit au cours.</p>
                            <Button variant="glow" onClick={() => navigate('/parent')}>
                                Mon espace parent <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </div>
                    )}

                    {/* Logged in as PARENT */}
                    {!success && user?.role === 'PARENT' && (
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">Choisissez l'enfant à inscrire :</p>
                            {children.map(child => (
                                <button key={child.id} onClick={() => enrollChild(child.id)} disabled={enrolling}
                                    className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                            <Users className="w-4 h-4 text-primary" />
                                        </div>
                                        <span className="font-medium">{child.name}</span>
                                        <span className="text-xs text-muted-foreground">@{child.username}</span>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                                </button>
                            ))}
                            {children.length === 0 && (
                                <p className="text-sm text-muted-foreground text-center py-4">Aucun enfant enregistré.</p>
                            )}
                        </div>
                    )}

                    {/* Not logged in */}
                    {!success && !token && (
                        <div className="space-y-4 text-center">
                            <div className="py-4">
                                <Users className="w-12 h-12 text-primary mx-auto mb-3" />
                                <p className="text-muted-foreground text-sm">Créez un compte parent pour inscrire votre enfant</p>
                            </div>
                            <Button variant="glow" className="w-full" onClick={() => navigate(`/register?invite=${code}&role=PARENT`)}>
                                Créer mon compte parent <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                            <p className="text-sm text-muted-foreground">
                                Déjà un compte ? <Link to="/login" className="text-primary hover:underline">Se connecter</Link>
                            </p>
                        </div>
                    )}

                    {/* Logged in but not PARENT */}
                    {!success && token && user?.role !== 'PARENT' && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            Seul un compte Parent peut inscrire un enfant.
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

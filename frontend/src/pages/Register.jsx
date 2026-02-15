import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BookOpen, Mail, Lock, User, GraduationCap, Briefcase, AlertCircle } from 'lucide-react';

const SUBJECTS = ['Mathématiques', 'Physique', 'Chimie', 'SVT', 'Français', 'Anglais', 'Espagnol', 'Histoire-Géo', 'Philosophie', 'Informatique'];

export default function Register() {
    const [step, setStep] = useState(1);
    const [form, setForm] = useState({ name: '', email: '', password: '', role: '', subjects: [] });
    const { register, loading, error, clearError } = useAuthStore();
    const navigate = useNavigate();

    const handleRoleSelect = (role) => {
        setForm({ ...form, role });
        setStep(2);
    };

    const toggleSubject = (s) => {
        setForm((f) => ({
            ...f,
            subjects: f.subjects.includes(s) ? f.subjects.filter((x) => x !== s) : [...f.subjects, s],
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const data = await register(form);
            navigate(data.user.role === 'PROF' ? '/dashboard' : '/student');
        } catch (err) { }
    };

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
                        {step === 1 ? 'Vous êtes...' : 'Créer votre compte'}
                    </CardTitle>
                    <CardDescription>
                        {step === 1 ? 'Choisissez votre profil pour commencer' : `Inscription en tant que ${form.role === 'PROF' ? 'Professeur' : 'Élève'}`}
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {step === 1 ? (
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => handleRoleSelect('PROF')}
                                className="group flex flex-col items-center gap-3 p-6 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all duration-200"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                                    <Briefcase className="w-8 h-8 text-primary" />
                                </div>
                                <span className="font-semibold">Professeur</span>
                                <span className="text-xs text-muted-foreground text-center">Je donne des cours</span>
                            </button>

                            <button
                                onClick={() => handleRoleSelect('STUDENT')}
                                className="group flex flex-col items-center gap-3 p-6 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all duration-200"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                                    <GraduationCap className="w-8 h-8 text-primary" />
                                </div>
                                <span className="font-semibold">Élève</span>
                                <span className="text-xs text-muted-foreground text-center">Je prends des cours</span>
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    {error}
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label>Nom complet</Label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Jean Dupont"
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        className="pl-10"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Email</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        type="email"
                                        placeholder="jean@exemple.fr"
                                        value={form.email}
                                        onChange={(e) => { setForm({ ...form, email: e.target.value }); clearError(); }}
                                        className="pl-10"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Mot de passe</Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        type="password"
                                        placeholder="Min. 6 caractères"
                                        value={form.password}
                                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                                        className="pl-10"
                                        required
                                        minLength={6}
                                    />
                                </div>
                            </div>

                            {form.role === 'PROF' && (
                                <div className="space-y-2">
                                    <Label>Matières enseignées</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {SUBJECTS.map((s) => (
                                            <button
                                                key={s}
                                                type="button"
                                                onClick={() => toggleSubject(s)}
                                                className={`px-3 py-1.5 text-xs rounded-full border transition-all ${form.subjects.includes(s)
                                                        ? 'bg-primary/20 border-primary/50 text-primary'
                                                        : 'border-border text-muted-foreground hover:border-primary/30'
                                                    }`}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <Button type="submit" variant="glow" className="w-full" disabled={loading}>
                                {loading ? 'Création...' : 'Créer mon compte'}
                            </Button>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => { setStep(1); clearError(); }}
                                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    ← Changer de profil
                                </button>
                            </div>
                        </form>
                    )}

                    <p className="text-center text-sm text-muted-foreground mt-6">
                        Déjà un compte ?{' '}
                        <Link to="/login" className="text-primary hover:underline font-medium">
                            Se connecter
                        </Link>
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

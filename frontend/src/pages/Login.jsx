import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BookOpen, Mail, Lock, User, AlertCircle } from 'lucide-react';

function getRoleHome(role) {
    if (role === 'PROFESSOR') return '/dashboard';
    if (role === 'PARENT') return '/parent';
    return '/student';
}

export default function Login() {
    const [mode, setMode] = useState('email'); // 'email' | 'username'
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const { login, loading, error, clearError } = useAuthStore();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = mode === 'email' ? { email, password } : { username, password };
            const data = await login(payload);
            navigate(getRoleHome(data.user.role));
        } catch (err) { }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
            <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-primary/5 rounded-full blur-3xl" />

            <Card className="w-full max-w-md relative animate-fade-in">
                <CardHeader className="text-center space-y-3">
                    <Link to="/" className="inline-flex items-center justify-center gap-2 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                            <BookOpen className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-2xl font-bold gradient-text">MathBox</span>
                    </Link>
                    <CardTitle className="text-2xl">Bon retour !</CardTitle>
                    <CardDescription>Connectez-vous à votre compte</CardDescription>
                </CardHeader>

                <CardContent>
                    {/* Toggle email / username */}
                    <div className="flex gap-2 mb-4">
                        <button
                            type="button"
                            onClick={() => { setMode('email'); clearError(); }}
                            className={`flex-1 py-2 text-sm rounded-lg border transition-all ${mode === 'email' ? 'bg-primary/10 border-primary/50 text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/30'}`}
                        >
                            <Mail className="w-4 h-4 inline mr-1.5" />Email
                        </button>
                        <button
                            type="button"
                            onClick={() => { setMode('username'); clearError(); }}
                            className={`flex-1 py-2 text-sm rounded-lg border transition-all ${mode === 'username' ? 'bg-primary/10 border-primary/50 text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/30'}`}
                        >
                            <User className="w-4 h-4 inline mr-1.5" />Nom d'utilisateur
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                {error}
                            </div>
                        )}

                        {mode === 'email' ? (
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="prof@exemple.fr"
                                        value={email}
                                        onChange={(e) => { setEmail(e.target.value); clearError(); }}
                                        className="pl-10"
                                        required
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Label htmlFor="username">Nom d'utilisateur</Label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        id="username"
                                        type="text"
                                        placeholder="leo3456"
                                        value={username}
                                        onChange={(e) => { setUsername(e.target.value); clearError(); }}
                                        className="pl-10"
                                        required
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="password">Mot de passe</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => { setPassword(e.target.value); clearError(); }}
                                    className="pl-10"
                                    required
                                />
                            </div>
                        </div>

                        <Button type="submit" variant="glow" className="w-full" disabled={loading}>
                            {loading ? 'Connexion...' : 'Se connecter'}
                        </Button>

                        <p className="text-center text-sm text-muted-foreground mt-4">
                            Pas encore de compte ?{' '}
                            <Link to="/register" className="text-primary hover:underline font-medium">
                                S'inscrire gratuitement
                            </Link>
                        </p>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

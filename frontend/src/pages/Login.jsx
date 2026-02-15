import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BookOpen, Mail, Lock, AlertCircle } from 'lucide-react';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login, loading, error, clearError } = useAuthStore();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const data = await login(email, password);
            navigate(data.user.role === 'PROF' ? '/dashboard' : '/student');
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
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                {error}
                            </div>
                        )}

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

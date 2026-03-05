import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BookOpen, Lock, AlertCircle, Sparkles } from 'lucide-react';

export default function MagicLogin() {
    const { token: magicToken } = useParams();
    const { loginWithMagicLink, setPassword, user, loading, error } = useAuthStore();
    const navigate = useNavigate();
    const [showPasswordSetup, setShowPasswordSetup] = useState(false);
    const [password, setPasswordVal] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pwError, setPwError] = useState(null);
    const [authenticating, setAuthenticating] = useState(true);

    useEffect(() => {
        const doLogin = async () => {
            try {
                const data = await loginWithMagicLink(magicToken);
                if (data.user.needsPasswordSetup) {
                    setShowPasswordSetup(true);
                } else {
                    navigate('/student');
                }
            } catch (err) {
                // error is set in store
            }
            setAuthenticating(false);
        };
        doLogin();
    }, [magicToken]);

    const handleSetPassword = async (e) => {
        e.preventDefault();
        if (password.length < 6) {
            setPwError('Le mot de passe doit contenir au moins 6 caractères');
            return;
        }
        if (password !== confirmPassword) {
            setPwError('Les mots de passe ne correspondent pas');
            return;
        }
        try {
            await setPassword(password);
            navigate('/student');
        } catch (err) {
            setPwError('Erreur lors de la création du mot de passe');
        }
    };

    if (authenticating) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center space-y-3">
                    <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                    <p className="text-muted-foreground">Connexion en cours...</p>
                </div>
            </div>
        );
    }

    if (error && !showPasswordSetup) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4">
                <Card className="w-full max-w-md">
                    <CardContent className="pt-6 text-center space-y-4">
                        <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
                        <p className="text-red-400">{error}</p>
                        <p className="text-sm text-muted-foreground">Ce lien magique est invalide ou expiré. Demandez un nouveau lien à votre parent.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (showPasswordSetup) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4 relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
                <Card className="w-full max-w-md relative animate-fade-in">
                    <CardHeader className="text-center space-y-3">
                        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                            <Sparkles className="w-7 h-7 text-primary" />
                        </div>
                        <CardTitle className="text-2xl">Bienvenue {user?.name} ! 🎉</CardTitle>
                        <CardDescription>
                            Créez un mot de passe pour votre compte
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSetPassword} className="space-y-4">
                            {pwError && (
                                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    {pwError}
                                </div>
                            )}

                            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                                <p className="text-xs text-muted-foreground">Votre nom d'utilisateur</p>
                                <p className="font-mono font-bold">{user?.username}</p>
                            </div>

                            <div className="space-y-2">
                                <Label>Mot de passe</Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input type="password" placeholder="Min. 6 caractères" value={password}
                                        onChange={(e) => { setPasswordVal(e.target.value); setPwError(null); }}
                                        className="pl-10" required minLength={6} />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Confirmer le mot de passe</Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input type="password" placeholder="Confirmez..." value={confirmPassword}
                                        onChange={(e) => { setConfirmPassword(e.target.value); setPwError(null); }}
                                        className="pl-10" required minLength={6} />
                                </div>
                            </div>

                            <Button type="submit" variant="glow" className="w-full">
                                Créer mon mot de passe
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return null;
}

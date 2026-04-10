import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    BookOpen, ArrowLeft, Send, CheckCircle2, Loader2,
    Lightbulb, Bug, Megaphone, HelpCircle, MessageSquare
} from 'lucide-react';

const REQUEST_TYPES = [
    { id: 'suggestion', label: 'Suggestion', icon: Lightbulb, color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/30', desc: 'Proposer une amélioration' },
    { id: 'reclamation', label: 'Réclamation', icon: Megaphone, color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/30', desc: 'Signaler un problème de service' },
    { id: 'bug', label: 'Bug', icon: Bug, color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/30', desc: 'Signaler un bug technique' },
    { id: 'autre', label: 'Autre', icon: HelpCircle, color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/30', desc: 'Question ou demande diverse' },
];

export default function Contact() {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const [email, setEmail] = useState(user?.email || '');
    const [type, setType] = useState('');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const canSend = email.trim() && type && message.trim() && !sending;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!canSend) return;
        setSending(true);
        setError('');
        try {
            const data = await api.post('/contact', { email, type, message });
            setResult(data);
        } catch (err) {
            setError(err.message || 'Erreur lors de l\'envoi');
        }
        setSending(false);
    };

    const goBack = () => {
        if (user) {
            if (user.role === 'PROFESSOR' || user.role === 'PROF') navigate('/dashboard');
            else if (user.role === 'PARENT') navigate('/parent');
            else navigate('/student');
        } else {
            navigate('/');
        }
    };

    return (
        <div className="min-h-screen bg-background">
            {/* Nav */}
            <nav className="fixed top-0 left-0 right-0 z-50 glass-strong">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xl font-bold gradient-text">MathBox</span>
                    </Link>
                    <Button variant="ghost" size="sm" onClick={goBack}>
                        <ArrowLeft className="w-4 h-4 mr-1.5" />
                        Retour
                    </Button>
                </div>
            </nav>

            <div className="pt-28 pb-16 px-6">
                <div className="max-w-2xl mx-auto">
                    {/* Header */}
                    <div className="text-center mb-10">
                        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                            <MessageSquare className="w-8 h-8 text-primary" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold mb-2">
                            Nous <span className="gradient-text">contacter</span>
                        </h1>
                        <p className="text-muted-foreground max-w-md mx-auto">
                            Une question, une suggestion ou un problème ? Envoyez-nous un message, nous vous répondrons rapidement.
                        </p>
                    </div>

                    {/* Success State */}
                    {result ? (
                        <Card className="border-emerald-500/30 bg-emerald-500/5">
                            <CardContent className="pt-8 pb-8 text-center space-y-4">
                                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold mb-1">Message envoyé !</h2>
                                    <p className="text-muted-foreground text-sm">
                                        Votre demande a bien été enregistrée.
                                    </p>
                                </div>
                                <Badge variant="outline" className="text-sm px-4 py-1.5 border-emerald-500/30">
                                    {result.ticketId}
                                </Badge>
                                <p className="text-xs text-muted-foreground">
                                    Conservez cet identifiant pour le suivi de votre demande.
                                </p>
                                <div className="pt-4 flex gap-3 justify-center">
                                    <Button variant="outline" onClick={() => { setResult(null); setType(''); setMessage(''); }}>
                                        Nouveau message
                                    </Button>
                                    <Button variant="glow" onClick={goBack}>
                                        Retour
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        /* Form */
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Email */}
                            <Card>
                                <CardContent className="pt-6 space-y-2">
                                    <Label htmlFor="contact-email" className="text-sm font-medium">Adresse e-mail</Label>
                                    <Input
                                        id="contact-email"
                                        type="email"
                                        placeholder="votre@email.com"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        required
                                        disabled={!!user?.email}
                                        className={user?.email ? 'opacity-70' : ''}
                                    />
                                    {user?.email && (
                                        <p className="text-xs text-muted-foreground">Pré-rempli avec l'email de votre compte</p>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Type */}
                            <Card>
                                <CardContent className="pt-6 space-y-3">
                                    <Label className="text-sm font-medium">Type de demande</Label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {REQUEST_TYPES.map(t => (
                                            <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => setType(t.id)}
                                                className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-200 text-left ${
                                                    type === t.id
                                                        ? `${t.bg} ring-1 ring-current ${t.color} scale-[1.02]`
                                                        : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
                                                }`}
                                            >
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                                                    type === t.id ? t.bg : 'bg-muted/50'
                                                }`}>
                                                    <t.icon className={`w-5 h-5 ${type === t.id ? t.color : 'text-muted-foreground'}`} />
                                                </div>
                                                <div>
                                                    <p className={`text-sm font-medium ${type === t.id ? '' : 'text-foreground'}`}>{t.label}</p>
                                                    <p className="text-xs text-muted-foreground">{t.desc}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Message */}
                            <Card>
                                <CardContent className="pt-6 space-y-2">
                                    <Label htmlFor="contact-message" className="text-sm font-medium">Message</Label>
                                    <textarea
                                        id="contact-message"
                                        className="flex min-h-[160px] w-full rounded-lg border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background transition-all resize-y"
                                        placeholder="Décrivez votre demande en détail..."
                                        value={message}
                                        onChange={e => setMessage(e.target.value)}
                                        required
                                    />
                                    <p className="text-xs text-muted-foreground text-right">{message.length} caractères</p>
                                </CardContent>
                            </Card>

                            {/* Error */}
                            {error && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
                                    {error}
                                </div>
                            )}

                            {/* Submit */}
                            <Button
                                type="submit"
                                variant="glow"
                                size="lg"
                                className="w-full"
                                disabled={!canSend}
                            >
                                {sending ? (
                                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Envoi en cours...</>
                                ) : (
                                    <><Send className="w-5 h-5 mr-2" /> Envoyer le message</>
                                )}
                            </Button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}

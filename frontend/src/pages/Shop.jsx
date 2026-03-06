import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    BookOpen, ArrowLeft, ShoppingBag, Brain, Check,
    Sparkles, CreditCard, History, Zap
} from 'lucide-react';
import SubscribeModal from '@/components/SubscribeModal';
import BuyCreditsModal from '@/components/BuyCreditsModal';

export default function Shop() {
    const { user, fetchMe } = useAuthStore();
    const [tab, setTab] = useState('credits');
    const [transactions, setTransactions] = useState([]);

    // Stripe modals
    const [showSubscribe, setShowSubscribe] = useState(false);
    const [showBuyCredits, setShowBuyCredits] = useState(false);
    const [stripeStatus, setStripeStatus] = useState(null);
    const [canceling, setCanceling] = useState(false);
    const [reactivating, setReactivating] = useState(false);

    useEffect(() => {
        fetchMe();
        loadTransactions();
        loadStripeStatus();
    }, []);

    useEffect(() => {
        if (user?.subscriptionStatus === 'ACTIVE') {
            loadStripeStatus();
        }
    }, [user?.subscriptionStatus]);

    const loadStripeStatus = async () => {
        try {
            const data = await api.get('/stripe/status');
            setStripeStatus(data);
        } catch (err) { }
    };

    const loadTransactions = async () => {
        try {
            const txData = await api.get('/shop/transactions');
            setTransactions(txData.transactions || []);
        } catch (err) { }
    };

    const handleCancelSubscription = async (e) => {
        e.stopPropagation();
        if (!window.confirm("Voulez-vous vraiment annuler le renouvellement de votre abonnement ?")) return;
        setCanceling(true);
        try {
            await api.post('/stripe/cancel-subscription');
            await loadStripeStatus();
        } catch (err) {
            alert(err.message || "Erreur lors de l'annulation");
        }
        setCanceling(false);
    };

    const handleReactivateSubscription = async (e) => {
        e.stopPropagation();
        setReactivating(true);
        try {
            await api.post('/stripe/reactivate-subscription');
            await loadStripeStatus();
        } catch (err) {
            alert(err.message || "Erreur lors de la réactivation");
        }
        setReactivating(false);
    };

    return (
        <div className="min-h-screen bg-background">
            <nav className="sticky top-0 z-40 glass-strong border-b">
                <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-bold gradient-text text-lg">MathBox</span>
                    </div>
                    <Link to="/dashboard"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1.5" />Dashboard</Button></Link>
                </div>
            </nav>

            <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <ShoppingBag className="w-6 h-6 text-primary" />
                            Boutique & Abonnement
                        </h1>
                        <p className="text-muted-foreground mt-1">Gérez votre abonnement et vos crédits IA</p>
                    </div>
                    <Card className="px-5 py-3 flex items-center gap-3">
                        <Brain className="w-6 h-6 text-primary" />
                        <div>
                            <p className="text-2xl font-bold">{user?.credits || 0}</p>
                            <p className="text-xs text-muted-foreground">Crédits IA</p>
                        </div>
                    </Card>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-secondary/30 rounded-lg p-1 w-fit">
                    {[
                        { id: 'credits', label: 'Crédits IA', icon: Brain },
                        { id: 'plans', label: 'Abonnements', icon: CreditCard },
                        { id: 'history', label: 'Historique', icon: History },
                    ].map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <t.icon className="w-4 h-4" /> {t.label}
                        </button>
                    ))}
                </div>

                {/* Credits Tab */}
                {tab === 'credits' && (
                    <div className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <Card className="hover:-translate-y-1 transition-all duration-300 cursor-pointer border-primary/30 glow-primary" onClick={() => setShowBuyCredits(true)}>
                                <CardContent className="p-6 text-center">
                                    <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                                        <Brain className="w-7 h-7 text-primary" />
                                    </div>
                                    <h3 className="font-semibold text-lg mb-2">Acheter des Crédits IA</h3>
                                    <p className="text-sm text-muted-foreground mb-4">Packs de 5 ou 10 crédits pour utiliser l'assistant IA</p>
                                    <Button variant="glow" className="w-full">
                                        <Sparkles className="w-4 h-4 mr-2" /> Acheter des crédits
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                )}

                {/* Plans Tab */}
                {tab === 'plans' && (
                    <div className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <Card className="border-border">
                                <CardContent className="p-6 text-center">
                                    <h3 className="font-semibold text-lg mb-1">Plan Gratuit</h3>
                                    <p className="text-3xl font-black mb-1">0€</p>
                                    <p className="text-xs text-muted-foreground mb-4">Essai de 15 jours</p>
                                    <div className="text-left space-y-2 mb-6">
                                        {['2h de cours/semaine', 'Cloud limité', 'Sans IA'].map((f, i) => (
                                            <div key={i} className="flex items-center gap-2 text-sm">
                                                <Check className="w-4 h-4 text-muted-foreground shrink-0" /> {f}
                                            </div>
                                        ))}
                                    </div>
                                    <Button variant="outline" className="w-full" disabled>Plan actuel</Button>
                                </CardContent>
                            </Card>

                            <Card
                                className={`border-primary ${user?.subscriptionStatus === 'ACTIVE' ? '' : 'glow-primary hover:-translate-y-1 cursor-pointer'} transition-all duration-300`}
                                onClick={() => user?.subscriptionStatus !== 'ACTIVE' && setShowSubscribe(true)}
                            >
                                {user?.subscriptionStatus !== 'ACTIVE' && (
                                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                                        <Badge className="bg-primary text-white border-0 text-[10px]">
                                            <Sparkles className="w-3 h-3 mr-0.5" /> Recommandé
                                        </Badge>
                                    </div>
                                )}
                                <CardContent className="p-6 text-center">
                                    <h3 className="font-semibold text-lg mb-1">MathBox Pro</h3>
                                    <p className="text-3xl font-black mb-1">9.99€<span className="text-sm font-normal text-muted-foreground">/mois</span></p>
                                    <p className="text-xs text-muted-foreground mb-4">Accès complet</p>
                                    <div className="text-left space-y-2 mb-6">
                                        {['Cours illimités', 'Cloud 10 Go', 'IA disponible', 'Marketplace activé', 'Support prioritaire'].map((f, i) => (
                                            <div key={i} className="flex items-center gap-2 text-sm">
                                                <Check className="w-4 h-4 text-primary shrink-0" /> {f}
                                            </div>
                                        ))}
                                    </div>

                                    {user?.subscriptionStatus === 'ACTIVE' ? (
                                        <div className="space-y-2">
                                            <Button variant="outline" className="w-full bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20" disabled>
                                                <Check className="w-4 h-4 mr-2" /> Actif
                                            </Button>
                                            {stripeStatus?.cancelAtPeriodEnd ? (
                                                <p className="text-xs text-muted-foreground mt-2">
                                                    Fin de l'abonnement le {stripeStatus.currentPeriodEnd ? new Date(stripeStatus.currentPeriodEnd * 1000).toLocaleDateString() : '...'}
                                                    {' - '}
                                                    <button
                                                        onClick={handleReactivateSubscription}
                                                        disabled={reactivating}
                                                        className="inline-block transition-colors underline-offset-4 underline hover:text-emerald-400"
                                                    >
                                                        {reactivating ? 'Activation...' : "Re-Activer"}
                                                    </button>
                                                </p>
                                            ) : (
                                                <button
                                                    onClick={handleCancelSubscription}
                                                    disabled={canceling}
                                                    className="inline-block text-xs text-muted-foreground hover:text-red-400 transition-colors mt-2 underline-offset-4 hover:underline"
                                                >
                                                    {canceling ? 'Annulation...' : "Annuler l'abonnement"}
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <Button variant="glow" className="w-full">
                                            <Zap className="w-4 h-4 mr-2" /> S'abonner
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                )}

                {/* History Tab */}
                {tab === 'history' && (
                    <Card>
                        <CardContent className="p-0">
                            {transactions.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground">
                                    <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    Aucune transaction
                                </div>
                            ) : (
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b bg-secondary/30">
                                            <th className="text-left p-3 text-sm font-medium text-muted-foreground">Date</th>
                                            <th className="text-left p-3 text-sm font-medium text-muted-foreground">Description</th>
                                            <th className="text-left p-3 text-sm font-medium text-muted-foreground">Type</th>
                                            <th className="text-right p-3 text-sm font-medium text-muted-foreground">Crédits</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transactions.map(tx => (
                                            <tr key={tx.id} className="border-b border-border/50">
                                                <td className="p-3 text-sm">{new Date(tx.createdAt).toLocaleDateString('fr-FR')}</td>
                                                <td className="p-3 text-sm">{tx.description || '—'}</td>
                                                <td className="p-3">
                                                    <Badge variant={tx.type === 'PURCHASE' ? 'success' : tx.type === 'SPEND' ? 'warning' : 'default'} className="text-xs">
                                                        {tx.type}
                                                    </Badge>
                                                </td>
                                                <td className="p-3 text-right text-sm font-medium">
                                                    <span className={tx.type === 'SPEND' ? 'text-red-400' : 'text-emerald-400'}>
                                                        {tx.type === 'SPEND' ? '-' : '+'}{tx.amount}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </CardContent>
                    </Card>
                )}

                <SubscribeModal isOpen={showSubscribe} onClose={() => setShowSubscribe(false)} />
                <BuyCreditsModal isOpen={showBuyCredits} onClose={() => setShowBuyCredits(false)} />
            </main>
        </div>
    );
}

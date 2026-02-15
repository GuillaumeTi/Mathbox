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

export default function Shop() {
    const { user, fetchMe } = useAuthStore();
    const [plans, setPlans] = useState([]);
    const [packs, setPacks] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [purchasing, setPurchasing] = useState('');
    const [tab, setTab] = useState('credits');

    useEffect(() => {
        loadShopData();
    }, []);

    const loadShopData = async () => {
        try {
            const [plansData, packsData, txData] = await Promise.all([
                api.get('/shop/plans'),
                api.get('/shop/credits'),
                api.get('/shop/transactions'),
            ]);
            setPlans(plansData.plans || []);
            setPacks(packsData.packs || []);
            setTransactions(txData.transactions || []);
        } catch (err) { }
    };

    const purchaseCredits = async (packId) => {
        setPurchasing(packId);
        try {
            const data = await api.post('/shop/credits/purchase', { packId });
            alert(data.message);
            await fetchMe();
            loadShopData();
        } catch (err) {
            alert(err.message);
        }
        setPurchasing('');
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
                    <div className="grid md:grid-cols-4 gap-4">
                        {packs.map(pack => (
                            <Card key={pack.id} className={`relative ${pack.popular ? 'border-primary glow-primary' : ''} hover:-translate-y-1 transition-all duration-300`}>
                                {pack.popular && (
                                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                                        <Badge className="bg-primary text-white border-0 text-[10px]">
                                            <Sparkles className="w-3 h-3 mr-0.5" /> Populaire
                                        </Badge>
                                    </div>
                                )}
                                <CardContent className="p-5 text-center">
                                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                                        <Brain className="w-6 h-6 text-primary" />
                                    </div>
                                    <h3 className="font-semibold mb-1">{pack.name}</h3>
                                    <p className="text-3xl font-black mb-1">{pack.price}€</p>
                                    <p className="text-xs text-muted-foreground mb-4">{(pack.price / pack.credits).toFixed(2)}€ / crédit</p>
                                    <Button
                                        variant={pack.popular ? 'glow' : 'outline'}
                                        className="w-full"
                                        onClick={() => purchaseCredits(pack.id)}
                                        disabled={purchasing === pack.id}
                                    >
                                        {purchasing === pack.id ? 'Achat...' : 'Acheter'}
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Plans Tab */}
                {tab === 'plans' && (
                    <div className="grid md:grid-cols-3 gap-6">
                        {plans.map(plan => (
                            <Card key={plan.id} className={`${plan.popular ? 'border-primary glow-primary' : ''} transition-all duration-300`}>
                                {plan.popular && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                        <Badge className="bg-primary text-white border-0">Populaire</Badge>
                                    </div>
                                )}
                                <CardHeader className="text-center">
                                    <CardTitle>{plan.name}</CardTitle>
                                    <div className="mt-2">
                                        <span className="text-4xl font-black">{plan.price}€</span>
                                        <span className="text-muted-foreground">/mois</span>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {plan.features?.map((f, i) => (
                                        <div key={i} className="flex items-center gap-2 text-sm">
                                            <Check className="w-4 h-4 text-primary shrink-0" /> {f}
                                        </div>
                                    ))}
                                    <Button variant={plan.popular ? 'glow' : 'outline'} className="w-full mt-4">
                                        {plan.price === 0 ? 'Plan actuel' : 'Passer au plan'}
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
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
            </main>
        </div>
    );
}

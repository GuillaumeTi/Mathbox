import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    Users, BookOpen, Receipt, DollarSign, RefreshCw,
    BarChart3, Zap, Shield, LogOut, ChevronRight,
    AlertTriangle
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

async function adminFetch(endpoint) {
    const res = await fetch(API_BASE + '/api/admin' + endpoint, {
        headers: { 'Authorization': 'Basic ' + btoa(credentials) }
    });
    if (!res.ok) throw new Error('API error: ' + res.status);
    return res.json();
}

async function adminPost(endpoint) {
    const res = await fetch(API_BASE + '/api/admin' + endpoint, {
        method: 'POST',
        headers: {
            'Authorization': 'Basic ' + btoa(credentials),
            'Content-Type': 'application/json'
        }
    });
    if (!res.ok) throw new Error('API error: ' + res.status);
    return res.json();
}

let credentials = '';

export default function AdminDashboard() {
    const [authed, setAuthed] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [metrics, setMetrics] = useState(null);
    const [professors, setProfessors] = useState([]);
    const [parents, setParents] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [activeTab, setActiveTab] = useState('metrics');
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);

    const login = (e) => {
        e.preventDefault();
        credentials = username + ':' + password;
        setAuthed(true);
    };

    useEffect(() => {
        if (!authed) return;
        fetchAll();
    }, [authed]);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [m, p, pa, t] = await Promise.all([
                adminFetch('/metrics'),
                adminFetch('/professors'),
                adminFetch('/parents'),
                adminFetch('/transactions'),
            ]);
            setMetrics(m);
            setProfessors(p.professors || []);
            setParents(pa.parents || []);
            setTransactions(t.transactions || []);
        } catch (err) {
            console.error('Admin fetch error:', err);
            setAuthed(false);
            alert('Identifiants invalides ou erreur serveur');
        }
        setLoading(false);
    };

    const handleGenerateB2B = async () => {
        if (!confirm('Générer les factures B2B pour ce mois ?')) return;
        setGenerating(true);
        try {
            const res = await adminPost('/generate-b2b');
            alert('Factures générées: ' + res.generatedCount);
            fetchAll();
        } catch (err) {
            alert('Erreur: ' + err.message);
        }
        setGenerating(false);
    };

    if (!authed) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <Card className="w-96 shadow-2xl">
                    <CardHeader className="text-center">
                        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                            <Shield className="w-8 h-8 text-primary" />
                        </div>
                        <CardTitle className="text-2xl">Admin MathBox</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={login} className="space-y-4">
                            <Input placeholder="Identifiant" value={username} onChange={e => setUsername(e.target.value)} autoFocus />
                            <Input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} />
                            <Button type="submit" variant="glow" className="w-full">Se connecter</Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const tabs = [
        { id: 'metrics', label: 'Métriques', icon: BarChart3 },
        { id: 'professors', label: 'Professeurs', icon: Users },
        { id: 'parents', label: 'Parents', icon: Users },
        { id: 'transactions', label: 'Transactions', icon: Receipt },
    ];

    return (
        <div className="min-h-screen bg-background">
            {/* Nav */}
            <nav className="sticky top-0 z-40 glass-strong border-b">
                <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center">
                            <Shield className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-bold text-lg">Admin <span className="gradient-text">MathBox</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={fetchAll} disabled={loading}>
                            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                            Actualiser
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setAuthed(false)}>
                            <LogOut className="w-4 h-4 mr-1.5" />Déconnexion
                        </Button>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
                {/* KPI Cards */}
                {metrics && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <Card className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                    <Users className="w-5 h-5 text-blue-400" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">{metrics.professors}</p>
                                    <p className="text-xs text-muted-foreground">Professeurs</p>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                    <Users className="w-5 h-5 text-emerald-400" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">{metrics.parents}</p>
                                    <p className="text-xs text-muted-foreground">Parents</p>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                    <BookOpen className="w-5 h-5 text-amber-400" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">{metrics.activeCourses}</p>
                                    <p className="text-xs text-muted-foreground">Cours actifs</p>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                                    <DollarSign className="w-5 h-5 text-purple-400" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">{metrics.totalCommissions.toFixed(2)}€</p>
                                    <p className="text-xs text-muted-foreground">Commissions</p>
                                </div>
                            </div>
                        </Card>
                        <Card className="p-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center">
                                    <Zap className="w-5 h-5 text-pink-400" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">{metrics.totalMRR.toFixed(2)}€</p>
                                    <p className="text-xs text-muted-foreground">MRR (Abonnements)</p>
                                </div>
                            </div>
                        </Card>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex items-center gap-2 border-b pb-2">
                    {tabs.map(t => (
                        <Button
                            key={t.id}
                            variant={activeTab === t.id ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setActiveTab(t.id)}
                        >
                            <t.icon className="w-4 h-4 mr-1.5" />
                            {t.label}
                        </Button>
                    ))}
                    <div className="ml-auto">
                        <Button variant="outline" size="sm" onClick={handleGenerateB2B} disabled={generating}>
                            <Receipt className="w-4 h-4 mr-1.5" />
                            {generating ? 'Génération...' : 'Générer Factures B2B'}
                        </Button>
                    </div>
                </div>

                {/* Content */}
                {activeTab === 'metrics' && metrics && (
                    <Card>
                        <CardHeader><CardTitle>Vue d'ensemble</CardTitle></CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-6 text-center">
                                <div className="p-6 rounded-xl bg-secondary/30">
                                    <p className="text-4xl font-bold gradient-text">{metrics.totalCommissions.toFixed(2)}€</p>
                                    <p className="text-muted-foreground mt-2">Total Commissions perçues</p>
                                </div>
                                <div className="p-6 rounded-xl bg-secondary/30">
                                    <p className="text-4xl font-bold gradient-text">{metrics.totalMRR.toFixed(2)}€</p>
                                    <p className="text-muted-foreground mt-2">Total Abonnements perçus</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {activeTab === 'professors' && (
                    <Card>
                        <CardHeader><CardTitle>Professeurs ({professors.length})</CardTitle></CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="text-left p-3 font-medium">Nom</th>
                                            <th className="text-left p-3 font-medium">Email</th>
                                            <th className="text-left p-3 font-medium">Statut</th>
                                            <th className="text-left p-3 font-medium">Abonnement</th>
                                            <th className="text-left p-3 font-medium">Commission</th>
                                            <th className="text-left p-3 font-medium">Mandat</th>
                                            <th className="text-left p-3 font-medium">Inscrit le</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {professors.map(p => (
                                            <tr key={p.id} className="border-b hover:bg-secondary/20">
                                                <td className="p-3 font-medium">{p.name}</td>
                                                <td className="p-3 text-muted-foreground">{p.email}</td>
                                                <td className="p-3"><Badge variant={p.legalStatus === 'PRO' ? 'default' : 'secondary'}>{p.legalStatus || 'PARTICULIER'}</Badge></td>
                                                <td className="p-3"><Badge variant={p.subscriptionStatus === 'ACTIVE' ? 'success' : p.subscriptionStatus === 'TRIAL' ? 'warning' : 'destructive'}>{p.subscriptionStatus || 'NONE'}</Badge></td>
                                                <td className="p-3">{((p.commissionRate || 0.1) * 100).toFixed(0)}%</td>
                                                <td className="p-3">{p.billingMandate ? '✅' : '❌'}</td>
                                                <td className="p-3 text-muted-foreground">{new Date(p.createdAt).toLocaleDateString('fr-FR')}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {activeTab === 'parents' && (
                    <Card>
                        <CardHeader><CardTitle>Parents ({parents.length})</CardTitle></CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="text-left p-3 font-medium">Nom</th>
                                            <th className="text-left p-3 font-medium">Email</th>
                                            <th className="text-left p-3 font-medium">Enfants</th>
                                            <th className="text-left p-3 font-medium">Inscrit le</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parents.map(p => (
                                            <tr key={p.id} className="border-b hover:bg-secondary/20">
                                                <td className="p-3 font-medium">{p.name}</td>
                                                <td className="p-3 text-muted-foreground">{p.email}</td>
                                                <td className="p-3"><Badge>{p.childrenCount || 0}</Badge></td>
                                                <td className="p-3 text-muted-foreground">{new Date(p.createdAt).toLocaleDateString('fr-FR')}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {activeTab === 'transactions' && (
                    <Card>
                        <CardHeader><CardTitle>Transactions plateforme ({transactions.length})</CardTitle></CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="text-left p-3 font-medium">Date</th>
                                            <th className="text-left p-3 font-medium">Prof</th>
                                            <th className="text-left p-3 font-medium">Type</th>
                                            <th className="text-left p-3 font-medium">Montant</th>
                                            <th className="text-left p-3 font-medium">Status</th>
                                            <th className="text-left p-3 font-medium">Description</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transactions.map(t => (
                                            <tr key={t.id} className="border-b hover:bg-secondary/20">
                                                <td className="p-3 text-muted-foreground">{new Date(t.createdAt).toLocaleDateString('fr-FR')}</td>
                                                <td className="p-3 font-medium">{t.prof?.name || '—'}</td>
                                                <td className="p-3">
                                                    <Badge variant={t.type === 'COMMISSION' ? 'default' : t.type === 'SUBSCRIPTION' ? 'secondary' : 'outline'}>
                                                        {t.type}
                                                    </Badge>
                                                </td>
                                                <td className="p-3 font-mono">{t.amount.toFixed(2)}€</td>
                                                <td className="p-3">
                                                    <Badge variant={t.status === 'INVOICED' ? 'success' : 'warning'}>
                                                        {t.status}
                                                    </Badge>
                                                </td>
                                                <td className="p-3 text-muted-foreground text-xs max-w-[200px] truncate">{t.description}</td>
                                            </tr>
                                        ))}
                                        {transactions.length === 0 && (
                                            <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Aucune transaction</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </main>
        </div>
    );
}

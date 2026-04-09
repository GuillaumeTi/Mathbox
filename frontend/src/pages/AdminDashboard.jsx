import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    Users, BookOpen, Receipt, DollarSign, RefreshCw,
    BarChart3, Zap, Shield, LogOut, ChevronRight,
    AlertTriangle, FileText, Download
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function AdminDashboard() {
    const [authed, setAuthed] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [metrics, setMetrics] = useState(null);
    const [professors, setProfessors] = useState([]);
    const [parents, setParents] = useState([]);
    const [students, setStudents] = useState([]);
    const [courses, setCourses] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [platformInvoices, setPlatformInvoices] = useState([]);
    const [activeTab, setActiveTab] = useState('metrics');
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [serverError, setServerError] = useState('');
    const credRef = useRef('');

    const doFetch = async (endpoint) => {
        const res = await fetch(API_BASE + '/api/admin' + endpoint, {
            headers: { 'Authorization': 'Basic ' + btoa(credRef.current) }
        });
        if (res.status === 401) {
            throw { authError: true, message: 'Identifiants invalides' };
        }
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw { authError: false, message: body.error || 'Erreur serveur (' + res.status + ')' };
        }
        return res.json();
    };

    const doPost = async (endpoint) => {
        const res = await fetch(API_BASE + '/api/admin' + endpoint, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + btoa(credRef.current),
                'Content-Type': 'application/json'
            }
        });
        if (res.status === 401) {
            throw { authError: true, message: 'Identifiants invalides' };
        }
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw { authError: false, message: body.error || 'Erreur serveur (' + res.status + ')' };
        }
        return res.json();
    };

    const login = async (e) => {
        e.preventDefault();
        setLoginError('');
        credRef.current = username + ':' + password;

        // Test auth with a simple request
        try {
            await doFetch('/metrics');
            setAuthed(true);
        } catch (err) {
            if (err.authError) {
                setLoginError('Identifiants invalides');
            } else {
                // Auth is fine, server error on metrics — still let them in
                setAuthed(true);
            }
        }
    };

    useEffect(() => {
        if (!authed) return;
        fetchAll();
    }, [authed]);

    const fetchAll = async () => {
        setLoading(true);
        setServerError('');
        try {
            const m = await doFetch('/metrics').catch(() => null);
            const p = await doFetch('/professors').catch(() => ({ professors: [] }));
            const pa = await doFetch('/parents').catch(() => ({ parents: [] }));
            const s = await doFetch('/students').catch(() => ({ students: [] }));
            const c = await doFetch('/courses').catch(() => ({ courses: [] }));
            const t = await doFetch('/transactions').catch(() => ({ transactions: [] }));
            const inv = await doFetch('/invoices').catch(() => ({ invoices: [] }));
            if (m) setMetrics(m);
            setProfessors(p.professors || []);
            setParents(pa.parents || []);
            setStudents(s.students || []);
            setCourses(c.courses || []);
            setTransactions(t.transactions || []);
            setInvoices(inv.invoices || []);
            const pinv = await doFetch('/platform-invoices').catch(() => ({ invoices: [] }));
            setPlatformInvoices(pinv.invoices || []);
        } catch (err) {
            if (err.authError) {
                setAuthed(false);
                setLoginError('Session expirée');
            } else {
                setServerError(err.message || 'Erreur serveur');
            }
        }
        setLoading(false);
    };

    const handleGenerateB2B = async () => {
        if (!confirm('Générer les factures B2B pour ce mois ?')) return;
        setGenerating(true);
        try {
            const res = await doPost('/generate-b2b');
            if (res.generatedCount === 0) {
                alert('Aucune facture générée. (Il n\'y a pas de transactions en attente pour les professeurs ce mois-ci)');
            } else {
                alert('Factures B2B générées avec succès : ' + res.generatedCount);
            }
            fetchAll();
        } catch (err) {
            alert('Erreur: ' + (err.message || 'Erreur serveur'));
        }
        setGenerating(false);
    };

    const handleForceRefund = async (invoiceId) => {
        if (!confirm('Êtes-vous sûr de vouloir forcer le remboursement intégral de cette facture parent via Stripe ?')) return;
        setLoading(true);
        try {
            const res = await doPost(`/force-refund/${invoiceId}`);
            alert('Remboursement effectué avec succès.');
            fetchAll();
        } catch (err) {
            alert('Erreur: ' + (err.message || 'Erreur serveur'));
        }
        setLoading(false);
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
                            <Input type="text" placeholder="Identifiant" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoFocus />
                            <Input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
                            {loginError && <p className="text-red-500 text-sm text-center">{loginError}</p>}
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
        { id: 'students', label: 'Élèves', icon: Users },
        { id: 'courses', label: 'Cours', icon: BookOpen },
        { id: 'transactions', label: 'Transactions', icon: Receipt },
        { id: 'invoices', label: 'Factures Parents', icon: DollarSign },
        { id: 'platform-invoices', label: 'Factures B2B', icon: FileText },
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
                {/* Server Error Banner */}
                {serverError && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                        <p className="text-sm text-amber-400">{serverError}</p>
                    </div>
                )}

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
                                    <p className="text-xs text-muted-foreground">Revenus (Subs + Credits)</p>
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
                                    <p className="text-muted-foreground mt-2">Total Revenus Directs (Subs + Crédits)</p>
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

                {activeTab === 'students' && (
                    <Card>
                        <CardHeader><CardTitle>Élèves ({students.length})</CardTitle></CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="text-left p-3 font-medium">Nom</th>
                                            <th className="text-left p-3 font-medium">Email</th>
                                            <th className="text-left p-3 font-medium">Parent</th>
                                            <th className="text-left p-3 font-medium">Inscrit le</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {students.map(s => (
                                            <tr key={s.id} className="border-b hover:bg-secondary/20">
                                                <td className="p-3 font-medium">{s.name}</td>
                                                <td className="p-3 text-muted-foreground">{s.email || '—'}</td>
                                                <td className="p-3 font-medium text-primary">{s.parent?.name || '—'}</td>
                                                <td className="p-3 text-muted-foreground">{new Date(s.createdAt).toLocaleDateString('fr-FR')}</td>
                                            </tr>
                                        ))}
                                        {students.length === 0 && (
                                            <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Aucun élève</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {activeTab === 'courses' && (
                    <Card>
                        <CardHeader><CardTitle>Tous les Cours ({courses.length})</CardTitle></CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm whitespace-nowrap">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="text-left p-3 font-medium">Titre / Matière</th>
                                            <th className="text-left p-3 font-medium">Statut</th>
                                            <th className="text-left p-3 font-medium">Professeur</th>
                                            <th className="text-left p-3 font-medium">Élève</th>
                                            <th className="text-left p-3 font-medium">Sessions</th>
                                            <th className="text-left p-3 font-medium">Devoirs</th>
                                            <th className="text-left p-3 font-medium">Créé le</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {courses.map(c => (
                                            <tr key={c.id} className="border-b hover:bg-secondary/20">
                                                <td className="p-3 font-medium">
                                                    {c.title || '—'}
                                                    <span className="block text-xs text-muted-foreground">{c.subject || '—'}</span>
                                                </td>
                                                <td className="p-3">
                                                    <Badge variant={
                                                        c.status === 'LIVE' ? 'destructive' : 
                                                        c.status === 'SCHEDULED' ? 'default' : 'secondary'
                                                    }>
                                                        {c.status === 'LIVE' ? 'En ligne' : c.status}
                                                    </Badge>
                                                </td>
                                                <td className="p-3">
                                                    <div className="text-sm">{c.professor?.name || '—'}</div>
                                                    <div className="text-xs text-muted-foreground">{c.professor?.email || ''}</div>
                                                </td>
                                                <td className="p-3">
                                                    <div className="text-sm">{c.student?.name || '—'}</div>
                                                    <div className="text-xs text-muted-foreground">{c.student?.email || ''}</div>
                                                </td>
                                                <td className="p-3 text-center">
                                                    <Badge variant="outline" className="font-mono">{c.sessionCount || 0}</Badge>
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline">{c.completedHomeworks}/{c.homeworkCount}</Badge>
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {c.homeworkCount > 0 ? Math.round((c.completedHomeworks/c.homeworkCount)*100) : 0}%
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-muted-foreground">{new Date(c.createdAt).toLocaleDateString('fr-FR')}</td>
                                            </tr>
                                        ))}
                                        {courses.length === 0 && (
                                            <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Aucun cours</td></tr>
                                        )}
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

                {activeTab === 'invoices' && (
                    <Card>
                        <CardHeader><CardTitle>Factures Parents ({invoices.length})</CardTitle></CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="text-left p-3 font-medium">Référence</th>
                                            <th className="text-left p-3 font-medium">Date</th>
                                            <th className="text-left p-3 font-medium">Parent</th>
                                            <th className="text-left p-3 font-medium">Montant</th>
                                            <th className="text-left p-3 font-medium">Statut</th>
                                            <th className="text-left p-3 font-medium">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoices.map(inv => (
                                            <tr key={inv.id} className="border-b hover:bg-secondary/20">
                                                <td className="p-3 font-medium">{inv.invoiceNumber || '—'}</td>
                                                <td className="p-3 text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString('fr-FR')}</td>
                                                <td className="p-3 font-medium">{inv.parent?.name || '—'}</td>
                                                <td className="p-3 font-mono">{inv.amount.toFixed(2)}€</td>
                                                <td className="p-3">
                                                    <Badge variant={inv.status === 'PAID' ? 'success' : inv.status === 'CANCELLED' ? 'destructive' : 'warning'}>
                                                        {inv.status}
                                                    </Badge>
                                                </td>
                                                <td className="p-3">
                                                    {inv.status === 'PAID' && inv.stripePaymentIntentId && (
                                                        <Button variant="outline" size="sm" onClick={() => handleForceRefund(inv.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                                                            Rembourser
                                                        </Button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {invoices.length === 0 && (
                                            <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Aucune facture parent</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {activeTab === 'platform-invoices' && (
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-primary" />
                                    Factures B2B — MathBox → Professeurs ({platformInvoices.length})
                                </CardTitle>
                                <Button variant="outline" size="sm" onClick={handleGenerateB2B} disabled={generating}>
                                    <Zap className="w-4 h-4 mr-1.5" />
                                    {generating ? 'Génération...' : 'Générer ce mois'}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b">
                                            <th className="text-left p-3 font-medium">N° Facture</th>
                                            <th className="text-left p-3 font-medium">Date</th>
                                            <th className="text-left p-3 font-medium">Professeur</th>
                                            <th className="text-right p-3 font-medium">Montant</th>
                                            <th className="text-left p-3 font-medium">Statut</th>
                                            <th className="text-center p-3 font-medium">PDF</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {platformInvoices.map(inv => (
                                            <tr key={inv.id} className="border-b hover:bg-secondary/20">
                                                <td className="p-3 font-mono font-medium">{inv.invoiceNumber || '—'}</td>
                                                <td className="p-3 text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString('fr-FR')}</td>
                                                <td className="p-3">
                                                    <div className="font-medium">{inv.professor?.name || '—'}</div>
                                                    <div className="text-xs text-muted-foreground">{inv.professor?.email || ''}</div>
                                                </td>
                                                <td className="p-3 text-right font-mono font-semibold">{inv.amount?.toFixed(2)}€</td>
                                                <td className="p-3">
                                                    <Badge variant={inv.status === 'PAID' ? 'success' : inv.status === 'CANCELLED' ? 'destructive' : 'warning'}>
                                                        {inv.status === 'PAID' ? 'Payée' : inv.status === 'PENDING' ? 'En attente' : inv.status}
                                                    </Badge>
                                                </td>
                                                <td className="p-3 text-center">
                                                    {inv.documentUrl ? (
                                                        <a
                                                            href={`${API_BASE.replace('/api', '')}${inv.documentUrl}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                                        >
                                                            <Download className="w-3.5 h-3.5" /> PDF
                                                        </a>
                                                    ) : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                        {platformInvoices.length === 0 && (
                                            <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Aucune facture B2B générée</td></tr>
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

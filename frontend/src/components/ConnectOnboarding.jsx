import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
    ConnectComponentsProvider,
    ConnectAccountOnboarding,
    ConnectPayments,
    ConnectPayouts,
} from '@stripe/react-connect-js';
import { loadConnectAndInitialize } from '@stripe/connect-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import {
    CheckCircle, AlertTriangle, Loader2, Wallet,
    CreditCard, ArrowDownToLine, Settings, FileText, Plus, Trash2, Download
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { io } from 'socket.io-client';
export default function ConnectOnboarding() {
    const { user } = useAuthStore();
    const [connectStatus, setConnectStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [stripeConnectInstance, setStripeConnectInstance] = useState(null);
    const [activeTab, setActiveTab] = useState('onboarding'); // 'onboarding' | 'payments' | 'payouts' | 'factures'

    // Invoice state
    const [invoices, setInvoices] = useState([]);
    const [courses, setCourses] = useState([]);
    const [invoiceForm, setInvoiceForm] = useState({ courseId: '', hours: '', hourlyRate: '', discount: '', description: '' });
    const [creatingInvoice, setCreatingInvoice] = useState(false);
    const [invoiceSuccess, setInvoiceSuccess] = useState(false);

    // Fetch Connect status on mount
    useEffect(() => {
        fetchConnectStatus();
    }, []);

    const fetchConnectStatus = async () => {
        try {
            const data = await api.get('/stripe/connect/status');
            setConnectStatus(data);
            if (data.hasAccount && data.detailsSubmitted) {
                setActiveTab('factures');
            }
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    const fetchInvoices = async () => {
        try {
            const data = await api.get('/invoices');
            setInvoices(data.invoices || []);
        } catch (err) { console.error(err); }
    };

    const fetchCourses = async () => {
        try {
            const data = await api.get('/courses');
            setCourses(data.courses || []);
        } catch (err) { console.error(err); }
    };

    const handleCreateInvoice = async (e) => {
        e.preventDefault();
        setCreatingInvoice(true);
        setInvoiceSuccess(false);
        try {
            await api.post('/invoices/create', invoiceForm);
            setInvoiceForm({ courseId: '', hours: '', hourlyRate: '', discount: '', description: '' });
            setInvoiceSuccess(true);
            setTimeout(() => setInvoiceSuccess(false), 3000);
            fetchInvoices();
        } catch (err) {
            alert('Erreur: ' + err.message);
        }
        setCreatingInvoice(false);
    };

    const handleDeleteInvoice = async (invoiceId) => {
        if (!confirm('Voulez-vous vraiment supprimer cette facture ?')) return;
        try {
            await api.delete(`/invoices/${invoiceId}`);
            setInvoices(invoices.filter((inv) => inv.id !== invoiceId));
        } catch (err) {
            alert('Erreur: ' + err.message);
        }
    };

    // Initialize Stripe Connect instance
    const initConnect = useCallback(async () => {
        try {
            // First, ensure we have an account
            let accountResult = connectStatus;
            if (!connectStatus?.hasAccount) {
                const createData = await api.post('/stripe/connect/create-account');
                accountResult = { hasAccount: true, accountId: createData.accountId };
                setConnectStatus(accountResult);
            }

            // Fetch publishable key
            const configData = await api.get('/stripe/config');

            // Create AccountSession
            const instance = loadConnectAndInitialize({
                publishableKey: configData.publishableKey,
                fetchClientSecret: async () => {
                    const sessionData = await api.post('/stripe/connect/account-session');
                    return sessionData.clientSecret;
                },
                appearance: {
                    overlays: 'dialog',
                    variables: {
                        colorPrimary: '#6366f1',
                        colorBackground: '#1a1a2e',
                        colorText: '#e2e8f0',
                        borderRadius: '8px',
                    },
                },
            });

            setStripeConnectInstance(instance);
        } catch (err) {
            setError(err.message);
        }
    }, [connectStatus]);

    // Auto-initialize if account exists
    useEffect(() => {
        if (connectStatus?.hasAccount && !stripeConnectInstance) {
            initConnect();
        }
    }, [connectStatus, stripeConnectInstance, initConnect]);

    // Fetch invoices/courses when factures tab is active
    useEffect(() => {
        if (activeTab === 'factures') {
            fetchInvoices();
            fetchCourses();
        }
    }, [activeTab]);

    // Real-time invoice status updates
    useEffect(() => {
        if (user && activeTab === 'factures') {
            const socket = io(window.location.origin);
            socket.emit('subscribe:courses', user.id);

            socket.on('invoice:paid', ({ invoiceId }) => {
                setInvoices(prev => prev.map(inv =>
                    inv.id === invoiceId ? { ...inv, status: 'PAID' } : inv
                ));
            });

            return () => socket.disconnect();
        }
    }, [user?.id, activeTab]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <Card className="border-red-500/30">
                <CardContent className="py-6 text-center">
                    <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                    <p className="text-red-400">{error}</p>
                    <Button variant="outline" className="mt-4" onClick={() => { setError(null); fetchConnectStatus(); }}>
                        Réessayer
                    </Button>
                </CardContent>
            </Card>
        );
    }

    // Profile Completeness Check Guard
    const isProfileComplete = user?.phone && user?.address && user?.legalStatus && !(user?.legalStatus === 'PRO' && !user?.siret);

    // No account yet — show CTA
    if (!connectStatus?.hasAccount) {
        if (!isProfileComplete) {
            return (
                <Card className="border-amber-500/30">
                    <CardContent className="py-8 text-center space-y-4">
                        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto opacity-80" />
                        <h3 className="text-lg font-semibold text-amber-500">Profil Incomplet</h3>
                        <p className="text-sm text-muted-foreground max-w-md mx-auto">
                            Vous devez compléter votre profil (téléphone, adresse postale, et statut légal) avant de configurer vos paiements.
                        </p>
                        <Button variant="glow" asChild>
                            <Link to="/prof/account"><Settings className="w-4 h-4 mr-2" />Compléter mon profil</Link>
                        </Button>
                    </CardContent>
                </Card>
            );
        }

        return (
            <Card>
                <CardContent className="py-8 text-center space-y-4">
                    <Wallet className="w-12 h-12 text-primary mx-auto opacity-80" />
                    <h3 className="text-lg font-semibold">Configurer vos paiements</h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                        Activez votre compte de paiement pour recevoir les paiements de vos élèves directement sur votre compte bancaire.
                    </p>
                    <Button variant="glow" onClick={initConnect}>
                        <CreditCard className="w-4 h-4 mr-2" />
                        Commencer la configuration
                    </Button>
                </CardContent>
            </Card>
        );
    }

    if (!stripeConnectInstance) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-3 text-muted-foreground">Chargement du module de paiement...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Status Header */}
            <Card>
                <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Wallet className="w-5 h-5 text-primary" />
                            <span className="font-medium">Compte de paiement</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {connectStatus.chargesEnabled ? (
                                <Badge variant="success" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                                    <CheckCircle className="w-3 h-3 mr-1" /> Actif
                                </Badge>
                            ) : (
                                <Badge variant="warning" className="bg-amber-500/10 text-amber-400 border-amber-500/30">
                                    <AlertTriangle className="w-3 h-3 mr-1" /> Configuration requise
                                </Badge>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Tab Navigation */}
            <div className="flex gap-2 border-b border-border pb-2">
                {!connectStatus.detailsSubmitted && (
                    <Button
                        variant={activeTab === 'onboarding' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setActiveTab('onboarding')}
                    >
                        <Settings className="w-4 h-4 mr-1.5" />
                        Configuration
                    </Button>
                )}
                <Button
                    variant={activeTab === 'payments' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveTab('payments')}
                >
                    <CreditCard className="w-4 h-4 mr-1.5" />
                    Paiements reçus
                </Button>
                <Button
                    variant={activeTab === 'payouts' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveTab('payouts')}
                >
                    <ArrowDownToLine className="w-4 h-4 mr-1.5" />
                    Virements
                </Button>
                <Button
                    variant={activeTab === 'factures' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setActiveTab('factures')}
                >
                    <FileText className="w-4 h-4 mr-1.5" />
                    Factures
                </Button>
            </div>

            {/* Embedded Connect Components */}
            <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
                <div className="min-h-[400px]">
                    {activeTab === 'onboarding' && (
                        <ConnectAccountOnboarding
                            onExit={() => {
                                fetchConnectStatus();
                                setActiveTab('payments');
                            }}
                        />
                    )}
                    {activeTab === 'payments' && <ConnectPayments />}
                    {activeTab === 'payouts' && <ConnectPayouts />}
                </div>
            </ConnectComponentsProvider>

            {/* Factures Tab */}
            {activeTab === 'factures' && (
                <div className="space-y-6">
                    {/* Create Invoice Form */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Plus className="w-4 h-4" /> Créer une facture
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleCreateInvoice} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label>Cours</Label>
                                        <select
                                            className="flex h-11 w-full rounded-lg border border-input bg-secondary/50 px-4 py-2 text-sm"
                                            value={invoiceForm.courseId}
                                            onChange={(e) => setInvoiceForm({ ...invoiceForm, courseId: e.target.value })}
                                            required
                                        >
                                            <option value="">Sélectionner un cours</option>
                                            {courses.filter(c => c.student).map(c => (
                                                <option key={c.id} value={c.id}>{c.title} — {c.student?.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="space-y-2">
                                            <Label>Nb d'heures</Label>
                                            <Input
                                                type="number"
                                                min="0.5"
                                                step="0.5"
                                                placeholder="1.5"
                                                value={invoiceForm.hours}
                                                onChange={(e) => setInvoiceForm({ ...invoiceForm, hours: e.target.value })}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Taux horaire (€)</Label>
                                            <Input
                                                type="number"
                                                min="1"
                                                step="0.5"
                                                placeholder="30"
                                                value={invoiceForm.hourlyRate}
                                                onChange={(e) => setInvoiceForm({ ...invoiceForm, hourlyRate: e.target.value })}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Remise (€)</Label>
                                            <Input
                                                type="number"
                                                min="0"
                                                step="0.5"
                                                placeholder="0.00"
                                                value={invoiceForm.discount}
                                                onChange={(e) => setInvoiceForm({ ...invoiceForm, discount: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Description optionnelle</Label>
                                        <Input
                                            placeholder="Cours de mars"
                                            value={invoiceForm.description}
                                            onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {invoiceForm.hours && invoiceForm.hourlyRate && (
                                    <div className="p-3 bg-card border border-border/50 rounded-lg flex justify-between items-center text-sm shadow-sm">
                                        <span className="text-muted-foreground">Simulation du montant total :</span>
                                        <span className="font-semibold text-emerald-400">
                                            {Math.max(0, (parseFloat(invoiceForm.hours) * parseFloat(invoiceForm.hourlyRate)) - (parseFloat(invoiceForm.discount) || 0)).toFixed(2)} €
                                            {user?.tvaStatus === 'SUBJECT_20' ? ' TTC' : ' HT'}
                                        </span>
                                    </div>
                                )}
                                <div className="flex items-center gap-3">
                                    <Button type="submit" variant="glow" size="sm" disabled={creatingInvoice}>
                                        {creatingInvoice ? 'Envoi...' : 'Envoyer la facture'}
                                    </Button>
                                    {invoiceSuccess && <span className="text-sm text-emerald-400">✓ Facture envoyée !</span>}
                                </div>
                            </form>
                        </CardContent>
                    </Card>

                    {/* Invoice List */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Factures envoyées</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {invoices.length === 0 ? (
                                <p className="text-center text-muted-foreground py-4">Aucune facture envoyée</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-border text-left">
                                                <th className="pb-3 font-medium text-muted-foreground">Date</th>
                                                <th className="pb-3 font-medium text-muted-foreground">Cours</th>
                                                <th className="pb-3 font-medium text-muted-foreground">Parent</th>
                                                <th className="pb-3 font-medium text-muted-foreground">Montant HT</th>
                                                <th className="pb-3 font-medium text-muted-foreground">TVA</th>
                                                <th className="pb-3 font-medium text-muted-foreground">TTC</th>
                                                <th className="pb-3 font-medium text-muted-foreground">Statut</th>
                                                <th className="pb-3 font-medium text-muted-foreground"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {invoices.map(inv => {
                                                const isSubjectTva = user?.tvaStatus === 'SUBJECT_20';
                                                const amountTTC = inv.amount;
                                                const amountHT = isSubjectTva ? amountTTC / 1.2 : amountTTC;
                                                const amountTVA = isSubjectTva ? amountTTC - amountHT : 0;
                                                return (
                                                    <tr key={inv.id} className="border-b border-border/50">
                                                        <td className="py-3">{new Date(inv.createdAt).toLocaleDateString('fr-FR')}</td>
                                                        <td className="py-3">{inv.course?.title || '—'}</td>
                                                        <td className="py-3">{inv.parent?.name || '—'}</td>
                                                        <td className="py-3 font-medium">{amountHT.toFixed(2)} €</td>
                                                        <td className="py-3 text-muted-foreground">{amountTVA.toFixed(2)} €</td>
                                                        <td className="py-3 font-bold text-primary">{amountTTC.toFixed(2)} €</td>
                                                        <td className="py-3">
                                                            <Badge variant={inv.status === 'PAID' ? 'success' : 'warning'}
                                                                className={inv.status === 'PAID'
                                                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                                                }
                                                            >
                                                                {inv.status === 'PAID' ? 'Payé' : 'En attente'}
                                                            </Badge>
                                                        </td>
                                                        <td className="py-3 text-right">
                                                            <div className="flex items-center justify-end gap-2">
                                                                {inv.documentUrl && (
                                                                    <Button variant="ghost" size="sm" asChild className="h-8 w-8 p-0 text-primary hover:text-primary hover:bg-primary/10">
                                                                        <a href={inv.documentUrl} target="_blank" rel="noopener noreferrer" title="Télécharger le document">
                                                                            <Download className="w-4 h-4" />
                                                                        </a>
                                                                    </Button>
                                                                )}
                                                                {inv.status === 'PENDING' && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="text-red-400 hover:text-red-500 hover:bg-red-500/10 h-8 w-8 p-0"
                                                                        onClick={() => handleDeleteInvoice(inv.id)}
                                                                        title="Supprimer la facture"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}

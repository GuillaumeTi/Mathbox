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
    CreditCard, ArrowDownToLine, Settings, FileText, Plus, Trash2, Download, RotateCcw, Clock,
} from 'lucide-react';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
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
    const [stocks, setStocks] = useState([]);
    const [refunding, setRefunding] = useState(null);
    const [refundModalOpen, setRefundModalOpen] = useState(false);
    const [invoiceToRefund, setInvoiceToRefund] = useState(null);
    const [openAccordions, setOpenAccordions] = useState({});
    const [updatingPref, setUpdatingPref] = useState({});
    const [generatingMonthly, setGeneratingMonthly] = useState({});
    const [facturesSubTab, setFacturesSubTab] = useState('tarifs'); // 'tarifs' | 'create' | 'parents'
    const [savingRate, setSavingRate] = useState({}); // { [courseId]: true }
    const [localRates, setLocalRates] = useState({}); // { [courseId]: string } editable value

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

    const fetchStocks = async () => {
        try {
            const data = await api.get('/invoices/stock');
            setStocks(data.stocks || []);
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
            // Rate always comes from the course configuration, never from a free-text input
            const selectedCourse = courses.find(c => c.id === invoiceForm.courseId);
            const rate = selectedCourse?.hourlyRate;
            if (!rate) {
                alert('Erreur: ce cours n\'a pas de tarif horaire configuré. Définissez-le dans "Tarifs des cours".');
                setCreatingInvoice(false);
                return;
            }

            const hrs = parseFloat(invoiceForm.hours) || 0;
            const discountPct = parseFloat(invoiceForm.discount) || 0;
            const absoluteDiscount = (hrs * rate) * (discountPct / 100);

            const payload = {
                ...invoiceForm,
                hourlyRate: String(rate),   // always from course config
                type: 'ACOMPTE',            // this form always creates top-up invoices
                discount: absoluteDiscount.toString()
            };

            await api.post('/invoices/create', payload);
            setInvoiceForm({ courseId: '', hours: '', hourlyRate: '', discount: '', description: '' });
            setInvoiceSuccess(true);
            setTimeout(() => setInvoiceSuccess(false), 3000);
            fetchInvoices();
        } catch (err) {
            alert('Erreur: ' + err.message);
        }
        setCreatingInvoice(false);
    };

    // When a course is selected in the invoice form, auto-fill the hourly rate
    const handleCourseSelect = (courseId) => {
        const selected = courses.find(c => c.id === courseId);
        setInvoiceForm(f => ({
            ...f,
            courseId,
            hourlyRate: selected?.hourlyRate != null ? String(selected.hourlyRate) : f.hourlyRate,
        }));
    };

    const updateCourseHourlyRate = async (courseId, rate) => {
        setSavingRate(s => ({ ...s, [courseId]: true }));
        try {
            const updated = await api.patch(`/courses/${courseId}/hourly-rate`, { hourlyRate: rate === '' ? null : parseFloat(rate) });
            // Update courses list in place
            setCourses(prev => prev.map(c => c.id === courseId ? { ...c, hourlyRate: updated.course.hourlyRate } : c));
        } catch (err) {
            alert('Erreur: ' + err.message);
        }
        setSavingRate(s => ({ ...s, [courseId]: false }));
    };

    const updateBillingPreference = async (studentId, preference) => {
        setUpdatingPref(p => ({ ...p, [studentId]: true }));
        try {
            await api.patch('/invoices/billing-preference', { studentId, preference });
            fetchStocks();
        } catch (err) {
            alert('Erreur: ' + err.message);
        }
        setUpdatingPref(p => ({ ...p, [studentId]: false }));
    };

    const generateMonthlyInvoice = async (parentId) => {
        setGeneratingMonthly(p => ({ ...p, [parentId]: true }));
        try {
            await api.post('/invoices/generate-monthly', { parentId });
            fetchInvoices();
            fetchStocks();
            alert('Facture de solde générée avec succès !');
        } catch (err) {
            alert('Erreur: ' + err.message);
        }
        setGeneratingMonthly(p => ({ ...p, [parentId]: false }));
    };

    const toggleAccordion = (parentId) => {
        setOpenAccordions(p => ({ ...p, [parentId]: !p[parentId] }));
    };

    // Group invoices AND parents from courses
    const invoicesByParent = React.useMemo(() => {
        const map = {};
        
        // 1. Register parents from active courses
        for (const c of courses) {
            if (c.student && c.student.parent) {
                const pid = c.student.parent.id;
                if (!map[pid]) {
                    map[pid] = { parent: c.student.parent, parentId: pid, invoices: [] };
                }
            }
        }

        // 2. Register existing invoices (may add backward compatibility for deleted courses)
        for (const inv of invoices) {
            if (!inv.parent) continue;
            const pid = inv.parentId || inv.parent?.id;
            if (!pid) continue;
            if (!map[pid]) map[pid] = { parent: inv.parent, parentId: pid, invoices: [] };
            map[pid].invoices.push(inv);
        }
        
        return Object.values(map);
    }, [invoices, courses]);

    // Build stocks map by studentId for billing pref lookup
    const stockByStudent = React.useMemo(() => {
        const map = {};
        for (const s of stocks) map[s.studentId] = s;
        return map;
    }, [stocks]);

    // Find children IDs that belong to a parent (from courses)
    const getStudentsForParent = (parentId) => {
        return courses
            .filter(c => c.student && (c.student.parentId === parentId || invoicesByParent.find(g => g.parentId === parentId)));
    };

    const handleDeleteInvoice = async (invoiceId) => {
        if (!confirm('Voulez-vous vraiment annuler cette facture ?')) return;
        try {
            await api.delete(`/invoices/${invoiceId}`);
            fetchInvoices();
            fetchStocks(); // stock may change if the invoice was a paid ACOMPTE
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

    // Fetch invoices/courses/stocks when factures tab is active
    useEffect(() => {
        if (activeTab === 'factures') {
            fetchInvoices();
            fetchCourses();
            fetchStocks();
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

    const executeRefund = async () => {
        if (!invoiceToRefund) return;
        setRefunding(invoiceToRefund.id);
        try {
            const result = await api.post(`/invoices/${invoiceToRefund.id}/refund`);
            alert(`Remboursement effectué: ${result.refundedHours}h (${result.refundedAmount}€)`);
            fetchInvoices();
            fetchStocks();
            setRefundModalOpen(false);
            setInvoiceToRefund(null);
        } catch (err) {
            alert('Erreur: ' + err.message);
        }
        setRefunding(null);
    };

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
                    {!user?.billingMandate ? (
                        <Card className="border-amber-500/30">
                            <CardContent className="py-12 flex flex-col items-center justify-center text-center">
                                <AlertTriangle className="w-12 h-12 text-amber-500 mb-4 opacity-80" />
                                <h3 className="text-xl font-bold mb-2">Mandat de facturation requis</h3>
                                <p className="text-muted-foreground max-w-md mx-auto mb-6">
                                    Pour générer et émettre des factures au nom de vos élèves via MathBox, vous devez d'abord lire et accepter le mandat de facturation dans les paramètres de votre compte.
                                </p>
                                <Button variant="glow" asChild>
                                    <Link to="/prof/account"><Settings className="w-4 h-4 mr-2" />Configurer</Link>
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            {/* Sub-tab navigation */}
                            <div className="flex gap-1 p-1 bg-secondary/40 rounded-lg w-fit">
                                <button
                                    onClick={() => setFacturesSubTab('tarifs')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${facturesSubTab === 'tarifs' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    💶 Tarifs des cours
                                </button>
                                <button
                                    onClick={() => setFacturesSubTab('create')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${facturesSubTab === 'create' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    <Plus className="w-3 h-3 inline mr-1" />Créer une facture
                                </button>
                                <button
                                    onClick={() => setFacturesSubTab('parents')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${facturesSubTab === 'parents' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    👨‍👩‍👧 Factures parents
                                </button>
                            </div>

                            {/* ===== TARIFS SUB-TAB ===== */}
                            {facturesSubTab === 'tarifs' && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base flex items-center gap-2">
                                            💶 Tarifs par cours
                                        </CardTitle>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Définissez le prix d'une heure de cours pour chaque cours. Ce tarif sera utilisé automatiquement lors de la création de factures et à la fin des séances.
                                        </p>
                                    </CardHeader>
                                    <CardContent>
                                        {courses.filter(c => c.student).length === 0 ? (
                                            <p className="text-center text-muted-foreground py-6">Aucun cours avec un élève inscrit.</p>
                                        ) : (
                                            <div className="divide-y divide-border">
                                                {courses.filter(c => c.student).map(c => (
                                                    <div key={c.id} className="flex items-center gap-4 py-3">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-medium text-sm truncate">{c.title}</div>
                                                            <div className="text-xs text-muted-foreground">{c.student?.name} · {c.subject || 'Général'}</div>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <div className="relative">
                                                                <Input
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.5"
                                                                    placeholder="€/h"
                                                                    className="w-28 pr-8 text-right"
                                                                    value={localRates[c.id] ?? (c.hourlyRate != null ? String(c.hourlyRate) : '')}
                                                                    onChange={(e) => setLocalRates(r => ({ ...r, [c.id]: e.target.value }))}
                                                                    onBlur={(e) => {
                                                                        const val = e.target.value;
                                                                        // Only save if changed
                                                                        if (String(c.hourlyRate ?? '') !== val) {
                                                                            updateCourseHourlyRate(c.id, val);
                                                                        }
                                                                    }}
                                                                />
                                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">€/h</span>
                                                            </div>
                                                            {savingRate[c.id] ? (
                                                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                                            ) : c.hourlyRate != null ? (
                                                                <span className="text-xs text-emerald-400">✓</span>
                                                            ) : (
                                                                <span className="text-xs text-muted-foreground/40">—</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <p className="text-xs text-muted-foreground/60 mt-4 pt-3 border-t border-border">💡 Cliquez sur un autre champ après avoir modifié un tarif pour l'enregistrer automatiquement.</p>
                                    </CardContent>
                                </Card>
                            )}

                            {/* ===== CREATE INVOICE SUB-TAB ===== */}
                            {facturesSubTab === 'create' && (
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
                                                        onChange={(e) => handleCourseSelect(e.target.value)}
                                                        required
                                                    >
                                                        <option value="">Sélectionner un cours</option>
                                                        {courses.filter(c => c.student).map(c => (
                                                            <option key={c.id} value={c.id}>{c.title} — {c.student?.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="text-xs text-muted-foreground col-span-full -mt-2 flex items-center gap-2">
                                                    <Badge className="text-[10px] px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border-indigo-500/30">ACOMPTE</Badge>
                                                    Cette facture alimente le stock d'heures de l'élève.
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 md:col-span-3">
                                                    <div className="space-y-2">
                                                        <Label className="text-xs">Nb d'heures</Label>
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
                                                        <Label className="text-xs">Remise (%)</Label>
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            step="1"
                                                            placeholder="0"
                                                            value={invoiceForm.discount}
                                                            onChange={(e) => setInvoiceForm({ ...invoiceForm, discount: e.target.value })}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Rate display or warning */}
                                                {(() => {
                                                    const sel = courses.find(c => c.id === invoiceForm.courseId);
                                                    if (!invoiceForm.courseId) return null;
                                                    if (sel?.hourlyRate != null) {
                                                        return (
                                                            <div className="col-span-full flex items-center gap-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                                                                <span className="text-emerald-400 text-lg">🔒</span>
                                                                <div>
                                                                    <p className="text-sm font-semibold text-emerald-400">{sel.hourlyRate} €/h</p>
                                                                    <p className="text-xs text-muted-foreground">Tarif configuré dans l'onglet "Tarifs des cours"</p>
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                    return (
                                                        <div className="col-span-full flex items-center gap-3 p-3 rounded-lg border border-amber-500/40 bg-amber-500/5">
                                                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                                                            <div>
                                                                <p className="text-sm font-medium text-amber-400">Aucun tarif configuré pour ce cours</p>
                                                                <p className="text-xs text-muted-foreground">Définissez un tarif horaire dans l'onglet <button type="button" className="underline cursor-pointer" onClick={() => setFacturesSubTab('tarifs')}>Tarifs des cours</button> avant de créer une facture.</p>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                                <div className="space-y-2">
                                                    <Label>Description optionnelle</Label>
                                                    <Input
                                                        placeholder="Cours de mars"
                                                        value={invoiceForm.description}
                                                        onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })}
                                                    />
                                                </div>
                                            </div>

                                            <div className="p-3 bg-card border border-border/50 rounded-lg flex justify-between items-center text-sm shadow-sm">
                                                <span className="text-muted-foreground">Simulation du montant final TTC :</span>
                                                <span className="font-semibold text-emerald-400">
                                                    {(() => {
                                                        const hrs = parseFloat(invoiceForm.hours);
                                                        const sel = courses.find(c => c.id === invoiceForm.courseId);
                                                        const rate = sel?.hourlyRate;
                                                        if (!isNaN(hrs) && rate != null) {
                                                            const pct = parseFloat(invoiceForm.discount) || 0;
                                                            return Math.max(0, (hrs * rate) * (1 - pct / 100)).toFixed(2);
                                                        }
                                                        return '—';
                                                    })()} {courses.find(c => c.id === invoiceForm.courseId)?.hourlyRate != null ? '€' : ''}
                                                </span>
                                            </div>

                                            {/* Block if student still has remaining hours */}
                                            {(() => {
                                                const sel = courses.find(c => c.id === invoiceForm.courseId);
                                                if (!sel) return null;
                                                const stock = stocks.find(s => s.studentId === sel.studentId);
                                                const remaining = stock ? stock.purchasedHours - stock.consumedHoursThisMonth : 0;
                                                if (remaining <= 0) return null;
                                                return (
                                                    <div className="flex items-start gap-3 p-3 rounded-lg border border-red-500/40 bg-red-500/5">
                                                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                                        <div>
                                                            <p className="text-sm font-medium text-red-400">Heures non consommées en cours</p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {stock.student?.name || 'Cet élève'} a encore <strong className="text-red-400">{remaining}h</strong> disponible(s) sur la facture précédente.
                                                                Une nouvelle facture ne peut être créée qu'une fois toutes les heures consommées.
                                                            </p>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                            <div className="flex items-center gap-3">
                                                <Button
                                                    type="submit"
                                                    variant="glow"
                                                    size="sm"
                                                    disabled={creatingInvoice || !courses.find(c => c.id === invoiceForm.courseId)?.hourlyRate || (() => {
                                                        const sel = courses.find(c => c.id === invoiceForm.courseId);
                                                        if (!sel) return false;
                                                        const stock = stocks.find(s => s.studentId === sel.studentId);
                                                        return stock && (stock.purchasedHours - stock.consumedHoursThisMonth) > 0;
                                                    })()}
                                                >
                                                    {creatingInvoice ? 'Envoi...' : 'Envoyer la facture'}
                                                </Button>
                                                {invoiceSuccess && <span className="text-sm text-emerald-400">✓ Facture envoyée !</span>}
                                            </div>
                                        </form>
                                    </CardContent>
                                </Card>
                            )}

                            {/* ===== PARENTS SUB-TAB ===== */}
                            {facturesSubTab === 'parents' && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">Factures par parent</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {invoicesByParent.length === 0 ? (
                                            <p className="text-center text-muted-foreground py-4">Aucun parent ou facture trouvés.</p>
                                        ) : invoicesByParent.map(group => {
                                                            // Get all student IDs for this parent from courses
                                                            const studentIds = Array.from(new Set(
                                                                courses.filter(c => c.student && c.student.parentId === group.parentId).map(c => c.student.id)
                                                            ));
                                                            const parentStudentStocks = stocks.filter(s => studentIds.includes(s.studentId));
                                                            
                                                            const firstStudentId = studentIds[0];
                                                            const firstStudentStock = parentStudentStocks[0] || (firstStudentId ? { studentId: firstStudentId, billingPreference: 'PER_CLASS' } : null);
                                                            const billingPref = firstStudentStock?.billingPreference || 'PER_CLASS';
                                                            const isMonthly = billingPref === 'MONTHLY';

                                                            return (
                                                                <div key={group.parentId} className="border border-border/60 rounded-xl overflow-hidden">
                                                                    <button
                                                                        className="w-full flex items-center justify-between px-4 py-3 bg-secondary/30 hover:bg-secondary/50 transition-colors text-left"
                                                                        onClick={() => toggleAccordion(group.parentId)}
                                                                    >
                                                                        <div>
                                                                            <div className="font-medium">{group.parent?.name || 'Parent'}</div>
                                                                            <div className="text-xs text-muted-foreground">{group.parent?.email} — {group.invoices.length} facture(s)</div>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <Badge variant="outline" className={isMonthly ? 'text-violet-400 border-violet-500/40' : 'text-emerald-400 border-emerald-500/40'}>
                                                                                {isMonthly ? '📅 Mensuelle' : '⚡ Par cours'}
                                                                            </Badge>
                                                                            <span className="text-muted-foreground text-lg">{openAccordions[group.parentId] ? '▲' : '▼'}</span>
                                                                        </div>
                                                                    </button>

                                                                    {openAccordions[group.parentId] && (
                                                                        <div className="p-4 space-y-4">

                                                                            {/* Hours synthesis — one card per student */}
                                                                            {parentStudentStocks.length > 0 && (
                                                                                <div className="space-y-3">
                                                                                    {parentStudentStocks.map(s => {
                                                                                        const remaining = s.purchasedHours - s.consumedHoursThisMonth;
                                                                                        const debt = Math.max(0, -remaining); // hours consumed beyond stock
                                                                                        const hasDebt = debt > 0;
                                                                                        // Find the hourly rate from a course linked to this student
                                                                                        const studentCourse = courses.find(c => c.studentId === s.studentId);
                                                                                        const rate = studentCourse?.hourlyRate;
                                                                                        const debtCost = rate ? (debt * rate).toFixed(2) : null;
                                                                                        return (
                                                                                            <div key={s.studentId}>
                                                                                                <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                                                                                                    <Clock className="w-3 h-3" />
                                                                                                    {s.student?.name || 'Élève'}
                                                                                                </p>
                                                                                                <div className={`grid gap-2 ${hasDebt ? 'grid-cols-4' : 'grid-cols-3'}`}>
                                                                                                    <div className="p-3 rounded-lg border border-border/50 bg-secondary/30 text-center">
                                                                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Achetées</p>
                                                                                                        <p className="text-lg font-bold text-emerald-400">{s.purchasedHours}<span className="text-xs font-normal ml-0.5">h</span></p>
                                                                                                    </div>
                                                                                                    <div className="p-3 rounded-lg border border-border/50 bg-secondary/30 text-center">
                                                                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Consommées</p>
                                                                                                        <p className="text-lg font-bold text-amber-400">{s.consumedHoursThisMonth}<span className="text-xs font-normal ml-0.5">h</span></p>
                                                                                                    </div>
                                                                                                    <div className="p-3 rounded-lg border border-border/50 bg-secondary/30 text-center">
                                                                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Restantes</p>
                                                                                                        <p className={`text-lg font-bold ${hasDebt ? 'text-muted-foreground/40' : 'text-primary'}`}>
                                                                                                            {hasDebt ? '0' : remaining}<span className="text-xs font-normal ml-0.5">h</span>
                                                                                                        </p>
                                                                                                    </div>
                                                                                                    {hasDebt && (
                                                                                                        <div className="p-3 rounded-lg border border-red-500/40 bg-red-500/5 text-center">
                                                                                                            <p className="text-[10px] text-red-400 uppercase tracking-wide mb-1">À payer</p>
                                                                                                            <p className="text-lg font-bold text-red-400">{debt}<span className="text-xs font-normal ml-0.5">h</span></p>
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>
                                                                                                {/* Debt cost estimate */}
                                                                                                {hasDebt && (
                                                                                                    <div className="mt-1.5 flex items-center justify-between px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/20 text-xs">
                                                                                                        <span className="text-red-400/80">{debt}h de cours non couvertes par le stock</span>
                                                                                                        {debtCost ? (
                                                                                                            <span className="font-semibold text-red-400">≈ {debtCost} € à régulariser</span>
                                                                                                        ) : (
                                                                                                            <span className="text-muted-foreground">Tarif non configuré</span>
                                                                                                        )}
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            )}

                                                                            {firstStudentStock && (
                                                                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/20 border border-border/40">
                                                                    <div>
                                                                        <p className="text-sm font-medium">Mode de facturation</p>
                                                                        <p className="text-xs text-muted-foreground">Change la façon dont les cours sont facturés</p>
                                                                    </div>
                                                                    <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
                                                                        <button
                                                                            disabled={updatingPref[firstStudentStock.studentId]}
                                                                            onClick={() => updateBillingPreference(firstStudentStock.studentId, 'PER_CLASS')}
                                                                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${billingPref === 'PER_CLASS' ? 'bg-emerald-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                                                        >
                                                                            ⚡ Après chaque cours
                                                                        </button>
                                                                        <button
                                                                            disabled={updatingPref[firstStudentStock.studentId]}
                                                                            onClick={() => updateBillingPreference(firstStudentStock.studentId, 'MONTHLY')}
                                                                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${billingPref === 'MONTHLY' ? 'bg-violet-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                                                        >
                                                                            📅 Mensuelle (1er du mois)
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {isMonthly && (
                                                                <Button
                                                                    variant="outline" size="sm"
                                                                    className="border-violet-500/40 text-violet-400 hover:bg-violet-500/10"
                                                                    disabled={generatingMonthly[group.parentId]}
                                                                    onClick={() => generateMonthlyInvoice(group.parentId)}
                                                                >
                                                                    {generatingMonthly[group.parentId] ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <FileText className="w-3 h-3 mr-2" />}
                                                                    Générer la facture de solde en avance
                                                                </Button>
                                                            )}

                                                            <div className="overflow-x-auto">
                                                                <table className="w-full text-sm">
                                                                    <thead>
                                                                        <tr className="border-b border-border text-left">
                                                                            <th className="pb-2 font-medium text-muted-foreground">Date</th>
                                                                            <th className="pb-2 font-medium text-muted-foreground">Type</th>
                                                                            <th className="pb-2 font-medium text-muted-foreground">Cours</th>
                                                                            <th className="pb-2 font-medium text-muted-foreground">Montant</th>
                                                                            <th className="pb-2 font-medium text-muted-foreground">Statut</th>
                                                                            <th className="pb-2"></th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {group.invoices.map(inv => (
                                                                            <tr key={inv.id} className="border-b border-border/50">
                                                                                <td className="py-2">
                                                                                    <div>{new Date(inv.createdAt).toLocaleDateString('fr-FR')}</div>
                                                                                    <div className="text-xs text-muted-foreground">{inv.invoiceNumber}</div>
                                                                                </td>
                                                                                <td className="py-2">
                                                                                    <Badge variant="outline" className="text-[10px]">
                                                                                        {inv.type === 'CREDIT_NOTE' ? 'AVOIR' : inv.type === 'SOLDE' ? 'SOLDE' : 'ACOMPTE'}
                                                                                    </Badge>
                                                                                </td>
                                                                                <td className="py-2 text-muted-foreground">{inv.course?.title || '—'}</td>
                                                                                <td className={`py-2 font-bold ${inv.type === 'CREDIT_NOTE' ? 'text-red-400' : 'text-primary'}`}>
                                                                                    {inv.amount.toFixed(2)} €
                                                                                </td>
                                                                                <td className="py-2">
                                                                                    {inv.type !== 'CREDIT_NOTE' && (() => {
                                                                                        if (inv.status === 'PAID') return (
                                                                                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Payé</Badge>
                                                                                        );
                                                                                        if (inv.status === 'CANCELLED') return (
                                                                                            <Badge className="bg-red-500/10 text-red-400 border-red-500/30">Annulée</Badge>
                                                                                        );
                                                                                        return (
                                                                                            <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">En attente</Badge>
                                                                                        );
                                                                                    })()}
                                                                                </td>
                                                                                <td className="py-2 text-right">
                                                                                    <div className="flex items-center justify-end gap-1">
                                                                                        {inv.documentUrl && (
                                                                                            <Button variant="ghost" size="sm" asChild className="h-7 w-7 p-0">
                                                                                                <a href={inv.documentUrl} target="_blank" rel="noopener noreferrer"><Download className="w-3.5 h-3.5" /></a>
                                                                                            </Button>
                                                                                        )}
                                                                                        {inv.status === 'PENDING' && (
                                                                                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-orange-400" onClick={() => handleDeleteInvoice(inv.id)}>
                                                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                                            </Button>
                                                                                        )}
                                                                                        {inv.status === 'PAID' && inv.type !== 'CREDIT_NOTE' && (
                                                                                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-blue-400" disabled={refunding === inv.id}
                                                                                                onClick={() => { setInvoiceToRefund(inv); setRefundModalOpen(true); }}
                                                                                            >
                                                                                                <RotateCcw className="w-3 h-3 mr-1" />{refunding === inv.id ? '...' : 'Rembourser'}
                                                                                            </Button>
                                                                                        )}
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </CardContent>
                                </Card>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Refund Modal */}
            <Dialog open={refundModalOpen} onOpenChange={setRefundModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <RotateCcw className="w-5 h-5 text-amber-500" />
                            Remboursement au Prorata
                        </DialogTitle>
                        <DialogDescription>
                            Voulez-vous vraiment rembourser les heures non consommées de la facture <strong>{invoiceToRefund?.invoiceNumber}</strong> ?
                            <br /><br />
                            Le montant maximum remboursable sera calculé automatiquement en fonction du stock d'heures restantes de l'élève.
                            Les frais de plateforme MathBox (commission) seront conservés.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setRefundModalOpen(false)}>Annuler</Button>
                        <Button variant="default" className="bg-amber-500 hover:bg-amber-600 text-white" onClick={executeRefund}>
                            Confirmer le remboursement
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

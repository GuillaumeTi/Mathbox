import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, CheckCircle, RefreshCw, XCircle, Search } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

let stripePromise = null;

function getStripePromise() {
    if (!stripePromise) {
        stripePromise = fetch('/api/stripe/config')
            .then(r => r.json())
            .then(data => {
                if (data.publishableKey) {
                    return loadStripe(data.publishableKey);
                }
                return null;
            }).catch(() => null);
    }
    return stripePromise;
}

function SetupForm() {
    const stripe = useStripe();
    const elements = useElements();
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!stripe || !elements) return;

        setLoading(true);
        setError(null);

        const { error: submitError } = await elements.submit();
        if (submitError) {
            setError(submitError.message);
            setLoading(false);
            return;
        }

        const { error: confirmError } = await stripe.confirmSetup({
            elements,
            confirmParams: {
                return_url: window.location.href,
            },
            redirect: 'if_required',
        });

        if (confirmError) {
            setError(confirmError.message);
        } else {
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        }

        setLoading(false);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <PaymentElement />
            {error && <div className="text-red-400 text-sm mt-2">{error}</div>}
            {success && <div className="text-emerald-400 text-sm mt-2 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Carte mise à jour</div>}
            <Button type="submit" disabled={!stripe || loading} variant="glow" className="w-full">
                {loading ? 'Mise à jour...' : 'Enregistrer la carte'}
            </Button>
        </form>
    );
}

export default function ProfAccount() {
    const { user, token, setProfile } = useAuthStore();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Profile form state
    const [form, setForm] = useState({
        name: '',
        phone: '',
        address: '',
        legalStatus: 'INDIVIDUAL',
        tvaStatus: 'FRANCHISE',
        siret: '',
        companyName: '',
        billingMandate: false,
    });

    const [siretSearching, setSiretSearching] = useState(false);

    // Stripe Info state
    const [stripeInfo, setStripeInfo] = useState({
        subscriptionStatus: null,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        clientSecret: null, // for setup intent
        loadingAction: false
    });

    useEffect(() => {
        if (!token || user?.role !== 'PROFESSOR') {
            navigate('/dashboard');
            return;
        }

        const initData = async () => {
            try {
                // Fetch full profile from backend to get SIRET/etc, or just use `user` from store if it has them
                const { user: refreshedUser } = await api.get('/auth/me');

                setForm({
                    name: refreshedUser.name || '',
                    phone: refreshedUser.phone || '',
                    address: refreshedUser.address || '',
                    legalStatus: refreshedUser.legalStatus || 'INDIVIDUAL',
                    tvaStatus: refreshedUser.tvaStatus || 'FRANCHISE',
                    siret: refreshedUser.siret || '',
                    companyName: refreshedUser.companyName || '',
                    billingMandate: refreshedUser.billingMandate || false,
                });

                // Fetch Stripe info & SetupIntent
                const { subscriptionStatus, cancelAtPeriodEnd, currentPeriodEnd, stripeSubscriptionId } = await api.get('/stripe/status');

                let secret = null;
                if (['ACTIVE', 'TRIAL'].includes(subscriptionStatus) || subscriptionStatus) {
                    const { clientSecret } = await api.post('/stripe/create-setup-intent');
                    secret = clientSecret;
                }

                setStripeInfo(prev => ({
                    ...prev,
                    subscriptionStatus,
                    cancelAtPeriodEnd,
                    currentPeriodEnd,
                    stripeSubscriptionId,
                    clientSecret: secret
                }));

            } catch (err) {
                console.error("Failed to fetch account info", err);
            } finally {
                setLoading(false);
            }
        };

        initData();
    }, [user, token, navigate]);

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await api.put('/users/profile', form);
            setProfile(res.user);
            alert('Profil mis à jour avec succès');
        } catch (error) {
            alert('Erreur: ' + error.message);
        }
        setSaving(false);
    };

    const handleVerifySiret = async () => {
        if (!form.siret || form.siret.length < 9) {
            alert('Veuillez entrer un SIREN/SIRET valide.');
            return;
        }
        setSiretSearching(true);
        try {
            // Public standard API from French government for SIRENE DB
            const response = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${form.siret}`);
            const data = await response.json();

            if (data.results && data.results.length > 0) {
                const company = data.results[0];
                const siege = company.siege;

                const fullAddress = `${siege.numero_voie || ''} ${siege.type_voie || ''} ${siege.libelle_voie || ''}, ${siege.code_postal || ''} ${siege.commune || ''}`.replace(/\s+/g, ' ').trim();

                setForm(prev => ({
                    ...prev,
                    companyName: company.nom_complet || prev.companyName,
                    address: fullAddress || prev.address
                }));
                alert('Informations entreprise récupérées avec succès !');
            } else {
                alert('Aucune entreprise trouvée avec ce numéro.');
            }
        } catch (err) {
            alert('Erreur lors de la vérification SIRET.');
            console.error(err);
        }
        setSiretSearching(false);
    };

    const handleToggleSub = async () => {
        const action = stripeInfo.cancelAtPeriodEnd ? 'reactivate' : 'cancel';
        setStripeInfo(prev => ({ ...prev, loadingAction: true }));
        try {
            await api.post(`/stripe/${action}-subscription`);
            setStripeInfo(prev => ({
                ...prev,
                cancelAtPeriodEnd: !prev.cancelAtPeriodEnd
            }));
        } catch (err) {
            alert('Erreur: ' + err.message);
        } finally {
            setStripeInfo(prev => ({ ...prev, loadingAction: false }));
        }
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center pt-20"><RefreshCw className="w-8 h-8 animate-spin text-primary" /></div>;
    }

    return (
        <div className="min-h-screen pt-24 pb-20 overflow-hidden relative">
            <div className="max-w-4xl mx-auto px-6 relative z-10 space-y-8">

                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                            Mon Compte
                        </h1>
                        <p className="text-muted-foreground mt-2">Gérez vos informations et préférences de facturation</p>
                    </div>
                    <Button variant="ghost" asChild>
                        <Link to="/dashboard">
                            <ArrowLeft className="w-4 h-4 mr-2" /> Retour
                        </Link>
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* SECTION A: PROFILE */}
                    <div className="md:col-span-2 space-y-6">
                        <Card className="border-border/50 bg-card/40 backdrop-blur-xl">
                            <CardHeader>
                                <CardTitle>Informations Personnelles</CardTitle>
                                <CardDescription>Ces informations sont nécessaires pour la facturation et les reçus de vos élèves.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleSaveProfile} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Nom complet</Label>
                                        <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Téléphone</Label>
                                            <Input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Statut Légal</Label>
                                            <select
                                                className="flex h-11 w-full rounded-lg border border-input bg-secondary/50 px-4 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                value={form.legalStatus}
                                                onChange={e => setForm({ ...form, legalStatus: e.target.value })}
                                            >
                                                <option value="INDIVIDUAL">Particulier (Frais 10%)</option>
                                                <option value="PRO">Professionnel (Frais 5%)</option>
                                            </select>
                                        </div>
                                    </div>

                                    {form.legalStatus === 'PRO' && (
                                        <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-4">
                                            <div className="space-y-3">
                                                <Label className="text-primary font-medium">Assujettissement à la TVA</Label>
                                                <div className="space-y-2">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input type="radio" value="FRANCHISE" checked={form.tvaStatus === 'FRANCHISE'} onChange={e => setForm({ ...form, tvaStatus: 'FRANCHISE' })} className="accent-primary" />
                                                        <span className="text-sm">Non, je suis en franchise en base (Auto-entrepreneur)</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input type="radio" value="EXONERATED" checked={form.tvaStatus === 'EXONERATED'} onChange={e => setForm({ ...form, tvaStatus: 'EXONERATED' })} className="accent-primary" />
                                                        <span className="text-sm">Non, je bénéficie de l'exonération pour l'enseignement</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input type="radio" value="SUBJECT_20" checked={form.tvaStatus === 'SUBJECT_20'} onChange={e => setForm({ ...form, tvaStatus: 'SUBJECT_20' })} className="accent-primary" />
                                                        <span className="text-sm">Oui, je facture la TVA (20%)</span>
                                                    </label>
                                                </div>
                                            </div>

                                            <div className="space-y-2 relative">
                                                <Label className="text-primary font-medium">Numéro SIRET / SIREN</Label>
                                                <div className="flex gap-2">
                                                    <Input
                                                        value={form.siret}
                                                        onChange={e => setForm({ ...form, siret: e.target.value })}
                                                        placeholder="123 456 789 00012"
                                                        required
                                                    />
                                                    <Button type="button" variant="secondary" onClick={handleVerifySiret} disabled={siretSearching}>
                                                        {siretSearching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Nom de l'entreprise</Label>
                                                <Input value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} required />
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <Label>Adresse postale complète</Label>
                                        <Input
                                            value={form.address}
                                            onChange={e => setForm({ ...form, address: e.target.value })}
                                            placeholder="123 rue de la Paix, 75000 Paris"
                                            required
                                        />
                                    </div>

                                    {/* Billing Mandate */}
                                    <div className="p-4 rounded-xl bg-secondary/30 border border-border/50 space-y-2">
                                        <label className="flex items-start gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={form.billingMandate}
                                                onChange={e => setForm({ ...form, billingMandate: e.target.checked })}
                                                className="accent-primary mt-1"
                                            />
                                            <span className="text-sm text-muted-foreground">
                                                J'accepte le <strong className="text-foreground">mandat de facturation</strong> et autorise MathBox à émettre des factures en mon nom et pour mon compte conformément aux dispositions légales en vigueur.
                                            </span>
                                        </label>
                                    </div>

                                    <Button type="submit" variant="glow" disabled={saving}>
                                        {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                                        Enregistrer les modifications
                                    </Button>
                                </form>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="space-y-6">
                        {/* SECTION B: SaaS SUBSCRIPTION */}
                        <Card className="border-border/50 bg-card/40 backdrop-blur-xl">
                            <CardHeader>
                                <CardTitle>Abonnement Pro</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {stripeInfo.subscriptionStatus === 'ACTIVE' || stripeInfo.subscriptionStatus === 'TRIAL' ? (
                                    <>
                                        {!stripeInfo.stripeSubscriptionId && stripeInfo.subscriptionStatus === 'TRIAL' ? (
                                            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-sm flex items-start gap-2">
                                                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                                <p>Période d'essai gratuite. Se termine le {new Date(stripeInfo.currentPeriodEnd * 1000).toLocaleDateString('fr-FR')}.</p>
                                            </div>
                                        ) : stripeInfo.cancelAtPeriodEnd ? (
                                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-sm flex items-start gap-2">
                                                <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                                <p>Abonnement annulé. Se termine le {new Date(stripeInfo.currentPeriodEnd * 1000).toLocaleDateString('fr-FR')}.</p>
                                            </div>
                                        ) : (
                                            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-sm flex items-start gap-2">
                                                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                                <p>Abonnement {stripeInfo.subscriptionStatus === 'TRIAL' ? 'en période d\'essai' : 'actif'}. Renouvellement le {new Date(stripeInfo.currentPeriodEnd * 1000).toLocaleDateString('fr-FR')}.</p>
                                            </div>
                                        )}

                                        {stripeInfo.stripeSubscriptionId ? (
                                            <Button
                                                variant={stripeInfo.cancelAtPeriodEnd ? "default" : "destructive"}
                                                className="w-full"
                                                onClick={handleToggleSub}
                                                disabled={stripeInfo.loadingAction}
                                            >
                                                {stripeInfo.loadingAction ? 'Chargement...' : (stripeInfo.cancelAtPeriodEnd ? 'Réactiver l\'abonnement' : 'Annuler l\'abonnement')}
                                            </Button>
                                        ) : (
                                            <Button variant="glow" className="w-full" asChild>
                                                <Link to="/pricing">S'abonner maintenant</Link>
                                            </Button>
                                        )}
                                    </>
                                ) : (
                                    <p className="text-sm text-muted-foreground">Aucun abonnement actif.</p>
                                )}
                            </CardContent>
                        </Card>

                        {/* SECTION C: SaaS PAYMENT METHOD */}
                        {stripeInfo.clientSecret && (
                            <Card className="border-border/50 bg-card/40 backdrop-blur-xl">
                                <CardHeader>
                                    <CardTitle>Moyen de paiement</CardTitle>
                                    <CardDescription>Mettez à jour la carte utilisée pour vos prélèvements</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Elements stripe={getStripePromise()} options={{
                                        clientSecret: stripeInfo.clientSecret,
                                        appearance: { theme: 'night', variables: { colorPrimary: '#3b82f6', colorBackground: '#09090b', colorText: '#f8fafc', colorDanger: '#ef4444', fontFamily: 'Inter, system-ui, sans-serif' } }
                                    }}>
                                        <SetupForm />
                                    </Elements>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}

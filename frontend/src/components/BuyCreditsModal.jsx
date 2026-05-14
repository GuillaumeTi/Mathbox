import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Coins, CheckCircle, Loader2, CreditCard, Brain, Shield, Zap } from 'lucide-react';

let stripePromise = null;

function getStripePromise() {
    if (!stripePromise) {
        stripePromise = fetch('/api/stripe/config')
            .then(r => r.json())
            .then(data => data.publishableKey ? loadStripe(data.publishableKey) : null);
    }
    return stripePromise;
}

const CREDIT_PACKS = [
    { id: '5credits', name: '5 Crédits IA', credits: 5, price: '4.90', pricePerCredit: '0.98', description: 'Pack découverte' },
    { id: '10credits', name: '10 Crédits IA', credits: 10, price: '9.80', pricePerCredit: '0.98', description: 'Pack standard', recommended: true },
];

function PaymentForm({ selectedPack, onSuccess, onCancel }) {
    const stripe = useStripe();
    const elements = useElements();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!stripe || !elements) return;

        setLoading(true);
        setError(null);

        const result = await stripe.confirmPayment({
            elements,
            confirmParams: { return_url: window.location.href },
            redirect: 'if_required',
        });

        if (result.error) {
            setError(result.error.message);
            setLoading(false);
        } else {
            // Payment confirmed — tell backend to add credits
            const paymentIntentId = result.paymentIntent?.id;
            if (paymentIntentId) {
                try {
                    await api.post('/stripe/confirm-credit-payment', { paymentIntentId });
                } catch (err) {
                    console.error('Confirm credit payment error:', err);
                }
            }
            onSuccess();
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {/* Recap line */}
            <div className="flex justify-between items-center p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-sm">
                <span className="text-muted-foreground">{selectedPack.name}</span>
                <span className="font-bold text-amber-400">{selectedPack.price}€</span>
            </div>

            <PaymentElement />
            {error && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                    {error}
                </div>
            )}
            <div className="flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
                    Retour
                </Button>
                <Button type="submit" variant="glow" className="flex-1" disabled={!stripe || loading}>
                    {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Traitement...</> : <><CreditCard className="w-4 h-4 mr-2" />Payer {selectedPack.price}€</>}
                </Button>
            </div>
        </form>
    );
}

export default function BuyCreditsModal({ isOpen, onClose }) {
    const [step, setStep] = useState('select'); // 'select' | 'payment' | 'success'
    const [selectedPack, setSelectedPack] = useState(null);
    const [clientSecret, setClientSecret] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const { fetchMe } = useAuthStore();

    const handleSelectPack = (pack) => {
        setSelectedPack(pack);
    };

    const handleProceedToPayment = async () => {
        if (!selectedPack) return;
        setLoading(true);
        setError(null);

        try {
            const data = await api.post('/stripe/create-credit-intent', { packId: selectedPack.id });
            setClientSecret(data.clientSecret);
            setStep('payment');
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    const handleSuccess = async () => {
        setStep('success');
        await fetchMe();
    };

    const handleClose = () => {
        setStep('select');
        setSelectedPack(null);
        setClientSecret(null);
        setError(null);
        onClose();
    };

    const handleBack = () => {
        setStep('select');
        setClientSecret(null);
        setError(null);
    };

    const stripePromise = getStripePromise();

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {step === 'success' ? (
                            <><CheckCircle className="w-5 h-5 text-emerald-400" /> Crédits ajoutés !</>
                        ) : step === 'payment' ? (
                            <><CreditCard className="w-5 h-5 text-primary" /> Paiement</>
                        ) : (
                            <><Brain className="w-5 h-5 text-amber-400" /> Acheter des Crédits IA</>
                        )}
                    </DialogTitle>
                </DialogHeader>

                {step === 'success' ? (
                    <div className="text-center py-6 space-y-4">
                        <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto" />
                        <p className="text-lg font-medium">{selectedPack?.credits} crédits ajoutés !</p>
                        <p className="text-sm text-muted-foreground">
                            Vos crédits sont disponibles immédiatement.
                        </p>
                        <Button variant="glow" onClick={handleClose}>Continuer</Button>
                    </div>
                ) : step === 'select' ? (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Choisissez un pack de crédits pour utiliser l'assistant IA dans vos cours.
                        </p>

                        {/* Pack selection */}
                        <div className="space-y-3">
                            {CREDIT_PACKS.map(pack => (
                                <button
                                    key={pack.id}
                                    onClick={() => handleSelectPack(pack)}
                                    className={`w-full p-4 rounded-lg border transition-all text-left group relative ${
                                        selectedPack?.id === pack.id
                                            ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                                            : 'border-border bg-secondary/30 hover:bg-secondary/60 hover:border-primary/50'
                                    }`}
                                >
                                    {pack.recommended && (
                                        <span className="absolute -top-2 right-3 text-[10px] px-2 py-0.5 rounded-full bg-amber-500 text-white font-medium">
                                            Meilleur choix
                                        </span>
                                    )}
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className={`font-semibold transition-colors ${selectedPack?.id === pack.id ? 'text-primary' : 'group-hover:text-primary'}`}>
                                                {pack.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {pack.description} — {pack.pricePerCredit}€ / crédit
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xl font-black">{pack.price}€</p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* Trust badges */}
                        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" /> Paiement sécurisé</span>
                            <span className="flex items-center gap-1"><Zap className="w-3.5 h-3.5" /> Activation immédiate</span>
                        </div>

                        {error && (
                            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                                {error}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <Button variant="outline" className="flex-1" onClick={handleClose}>
                                Annuler
                            </Button>
                            <Button
                                variant="glow"
                                className="flex-1"
                                onClick={handleProceedToPayment}
                                disabled={!selectedPack || loading}
                            >
                                {loading ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Chargement...</>
                                ) : (
                                    <><CreditCard className="w-4 h-4 mr-2" />Continuer{selectedPack ? ` — ${selectedPack.price}€` : ''}</>
                                )}
                            </Button>
                        </div>
                    </div>
                ) : step === 'payment' && clientSecret && stripePromise ? (
                    <Elements
                        stripe={stripePromise}
                        options={{
                            clientSecret,
                            appearance: {
                                theme: 'night',
                                variables: {
                                    colorPrimary: '#6366f1',
                                    colorBackground: '#1a1a2e',
                                    colorText: '#e2e8f0',
                                    borderRadius: '8px',
                                },
                            },
                        }}
                    >
                        <PaymentForm selectedPack={selectedPack} onSuccess={handleSuccess} onCancel={handleBack} />
                    </Elements>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}

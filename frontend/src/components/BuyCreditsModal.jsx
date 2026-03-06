import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Coins, CheckCircle, Loader2 } from 'lucide-react';

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
    { id: '5credits', name: '5 Crédits IA', credits: 5, description: 'Pack découverte' },
    { id: '10credits', name: '10 Crédits IA', credits: 10, description: 'Pack standard' },
];

function PaymentForm({ onSuccess, onCancel }) {
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
            <PaymentElement />
            {error && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                    {error}
                </div>
            )}
            <div className="flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
                    Annuler
                </Button>
                <Button type="submit" variant="glow" className="flex-1" disabled={!stripe || loading}>
                    {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Traitement...</> : <><Coins className="w-4 h-4 mr-2" />Payer</>}
                </Button>
            </div>
        </form>
    );
}

export default function BuyCreditsModal({ isOpen, onClose }) {
    const [selectedPack, setSelectedPack] = useState(null);
    const [clientSecret, setClientSecret] = useState(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(null);
    const { fetchMe } = useAuthStore();

    const handleSelectPack = async (pack) => {
        setSelectedPack(pack);
        setLoading(true);
        setError(null);

        try {
            const data = await api.post('/stripe/create-credit-intent', { packId: pack.id });
            setClientSecret(data.clientSecret);
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    };

    const handleSuccess = async () => {
        setSuccess(true);
        await fetchMe();
    };

    const handleClose = () => {
        setSelectedPack(null);
        setClientSecret(null);
        setSuccess(false);
        setError(null);
        onClose();
    };

    const handleBack = () => {
        setSelectedPack(null);
        setClientSecret(null);
        setError(null);
    };

    const stripePromise = getStripePromise();

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Coins className="w-5 h-5 text-amber-400" />
                        {success ? 'Crédits ajoutés !' : 'Acheter des Crédits IA'}
                    </DialogTitle>
                </DialogHeader>

                {success ? (
                    <div className="text-center py-6 space-y-4">
                        <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto" />
                        <p className="text-lg font-medium">{selectedPack?.credits} crédits ajoutés !</p>
                        <p className="text-sm text-muted-foreground">
                            Vos crédits sont disponibles immédiatement.
                        </p>
                        <Button variant="glow" onClick={handleClose}>Continuer</Button>
                    </div>
                ) : !selectedPack ? (
                    <div className="space-y-3 py-2">
                        {CREDIT_PACKS.map(pack => (
                            <button
                                key={pack.id}
                                onClick={() => handleSelectPack(pack)}
                                className="w-full p-4 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/60 hover:border-primary/50 transition-all text-left group"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-semibold group-hover:text-primary transition-colors">{pack.name}</p>
                                        <p className="text-sm text-muted-foreground">{pack.description}</p>
                                    </div>
                                    <Coins className="w-6 h-6 text-amber-400" />
                                </div>
                            </button>
                        ))}
                    </div>
                ) : loading ? (
                    <div className="text-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-3" />
                        <p className="text-sm text-muted-foreground">Préparation du paiement...</p>
                    </div>
                ) : error ? (
                    <div className="text-center py-6 space-y-4">
                        <p className="text-sm text-red-400">{error}</p>
                        <div className="flex gap-3 justify-center">
                            <Button variant="outline" onClick={handleBack}>Retour</Button>
                            <Button variant="outline" onClick={handleClose}>Fermer</Button>
                        </div>
                    </div>
                ) : clientSecret && stripePromise ? (
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
                        <PaymentForm onSuccess={handleSuccess} onCancel={handleBack} />
                    </Elements>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}

import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { CreditCard, CheckCircle, Loader2, Check, Sparkles, Shield, Zap } from 'lucide-react';

let stripePromise = null;

function getStripePromise() {
    if (!stripePromise) {
        // Fetch publishable key from backend
        stripePromise = fetch('/api/stripe/config')
            .then(r => r.json())
            .then(data => {
                if (data.publishableKey) {
                    return loadStripe(data.publishableKey);
                }
                return null;
            });
    }
    return stripePromise;
}

// Inner form component (must be inside <Elements>)
function SubscriptionForm({ subscriptionId, onSuccess, onCancel }) {
    const stripe = useStripe();
    const elements = useElements();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!stripe || !elements) return;

        setLoading(true);
        setError(null);

        const { error: submitError } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: window.location.href,
            },
            redirect: 'if_required',
        });

        if (submitError) {
            setError(submitError.message);
            setLoading(false);
        } else {
            // Payment confirmed — now tell backend to update DB
            try {
                await api.post('/stripe/confirm-subscription', { subscriptionId });
            } catch (err) {
                console.error('Confirm subscription error:', err);
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
                    Retour
                </Button>
                <Button type="submit" variant="glow" className="flex-1" disabled={!stripe || loading}>
                    {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Traitement...</> : <><CreditCard className="w-4 h-4 mr-2" />Payer 9.99€</>}
                </Button>
            </div>
        </form>
    );
}

// Pricing features list
const PRO_FEATURES = [
    'Cours illimités',
    'Cloud 10 Go',
    'IA disponible',
    'Marketplace activé',
    'Facturation automatique',
    'Support prioritaire',
];

export default function SubscribeModal({ isOpen, onClose }) {
    const [step, setStep] = useState('pricing'); // 'pricing' | 'payment' | 'success'
    const [clientSecret, setClientSecret] = useState(null);
    const [subscriptionId, setSubscriptionId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const { fetchMe } = useAuthStore();

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setStep('pricing');
            setClientSecret(null);
            setSubscriptionId(null);
            setError(null);
        }
    }, [isOpen]);

    const handleProceedToPayment = () => {
        setLoading(true);
        setError(null);
        api.post('/stripe/create-subscription')
            .then(data => {
                setClientSecret(data.clientSecret);
                setSubscriptionId(data.subscriptionId);
                setStep('payment');
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    };

    const handleSuccess = async () => {
        setStep('success');
        await fetchMe(); // Refresh trial/subscription status
    };

    const handleClose = () => {
        setStep('pricing');
        setClientSecret(null);
        setSubscriptionId(null);
        setError(null);
        onClose();
    };

    const stripePromise = getStripePromise();

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {step === 'success' ? (
                            <><CheckCircle className="w-5 h-5 text-emerald-400" /> Abonnement activé !</>
                        ) : step === 'payment' ? (
                            <><CreditCard className="w-5 h-5 text-primary" /> Paiement</>
                        ) : (
                            <><Sparkles className="w-5 h-5 text-primary" /> MathBox Pro</>
                        )}
                    </DialogTitle>
                </DialogHeader>

                {step === 'success' ? (
                    <div className="text-center py-6 space-y-4">
                        <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto" />
                        <p className="text-lg font-medium">Votre abonnement est actif !</p>
                        <p className="text-sm text-muted-foreground">
                            Vous avez maintenant accès à toutes les fonctionnalités de MathBox.
                        </p>
                        <Button variant="glow" onClick={handleClose}>Continuer</Button>
                    </div>
                ) : step === 'pricing' ? (
                    <div className="space-y-5">
                        {/* Price display */}
                        <div className="text-center pt-2">
                            <p className="text-4xl font-black">
                                9.99€
                                <span className="text-sm font-normal text-muted-foreground">/mois</span>
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">Abonnement mensuel, sans engagement</p>
                        </div>

                        {/* Features list */}
                        <div className="rounded-lg border border-border/50 bg-secondary/20 p-4 space-y-2.5">
                            {PRO_FEATURES.map((feature, i) => (
                                <div key={i} className="flex items-center gap-2.5 text-sm">
                                    <Check className="w-4 h-4 text-primary shrink-0" />
                                    <span>{feature}</span>
                                </div>
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
                            <Button variant="glow" className="flex-1" onClick={handleProceedToPayment} disabled={loading}>
                                {loading ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Chargement...</>
                                ) : (
                                    <><CreditCard className="w-4 h-4 mr-2" />Continuer</>
                                )}
                            </Button>
                        </div>
                    </div>
                ) : step === 'payment' && clientSecret && stripePromise ? (
                    <div className="space-y-4">
                        {/* Recap line */}
                        <div className="flex justify-between items-center p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
                            <span className="text-muted-foreground">MathBox Pro — Mensuel</span>
                            <span className="font-bold text-primary">9.99€/mois</span>
                        </div>

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
                            <SubscriptionForm subscriptionId={subscriptionId} onSuccess={handleSuccess} onCancel={() => setStep('pricing')} />
                        </Elements>
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}

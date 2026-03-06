import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { CreditCard, CheckCircle, Loader2 } from 'lucide-react';

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
                    Annuler
                </Button>
                <Button type="submit" variant="glow" className="flex-1" disabled={!stripe || loading}>
                    {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Traitement...</> : <><CreditCard className="w-4 h-4 mr-2" />Confirmer</>}
                </Button>
            </div>
        </form>
    );
}

export default function SubscribeModal({ isOpen, onClose }) {
    const [clientSecret, setClientSecret] = useState(null);
    const [subscriptionId, setSubscriptionId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(null);
    const { fetchMe } = useAuthStore();

    useEffect(() => {
        if (isOpen && !clientSecret && !success) {
            setLoading(true);
            setError(null);
            api.post('/stripe/create-subscription')
                .then(data => {
                    setClientSecret(data.clientSecret);
                    setSubscriptionId(data.subscriptionId);
                    setLoading(false);
                })
                .catch(err => {
                    setError(err.message);
                    setLoading(false);
                });
        }
    }, [isOpen]);

    const handleSuccess = async () => {
        setSuccess(true);
        await fetchMe(); // Refresh trial/subscription status
    };

    const handleClose = () => {
        setClientSecret(null);
        setSubscriptionId(null);
        setSuccess(false);
        setError(null);
        onClose();
    };

    const stripePromise = getStripePromise();

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CreditCard className="w-5 h-5 text-primary" />
                        {success ? 'Abonnement activé !' : 'S\'abonner à MathBox Pro'}
                    </DialogTitle>
                </DialogHeader>

                {success ? (
                    <div className="text-center py-6 space-y-4">
                        <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto" />
                        <p className="text-lg font-medium">Votre abonnement est actif !</p>
                        <p className="text-sm text-muted-foreground">
                            Vous avez maintenant accès à toutes les fonctionnalités de MathBox.
                        </p>
                        <Button variant="glow" onClick={handleClose}>Continuer</Button>
                    </div>
                ) : loading ? (
                    <div className="text-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-3" />
                        <p className="text-sm text-muted-foreground">Préparation du paiement...</p>
                    </div>
                ) : error ? (
                    <div className="text-center py-6 space-y-4">
                        <p className="text-sm text-red-400">{error}</p>
                        <Button variant="outline" onClick={handleClose}>Fermer</Button>
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
                        <SubscriptionForm subscriptionId={subscriptionId} onSuccess={handleSuccess} onCancel={handleClose} />
                    </Elements>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}

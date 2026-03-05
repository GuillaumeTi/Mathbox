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
        stripePromise = fetch('/api/stripe/config')
            .then(r => r.json())
            .then(data => data.publishableKey ? loadStripe(data.publishableKey) : null);
    }
    return stripePromise;
}

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

        const { error: submitError } = await stripe.confirmPayment({
            elements,
            confirmParams: { return_url: window.location.href },
            redirect: 'if_required',
        });

        if (submitError) {
            setError(submitError.message);
            setLoading(false);
        } else {
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
                    {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Traitement...</> : <><CreditCard className="w-4 h-4 mr-2" />Payer</>}
                </Button>
            </div>
        </form>
    );
}

export default function PayInvoiceModal({ isOpen, onClose, invoice, onPaid }) {
    const [clientSecret, setClientSecret] = useState(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen && invoice && !clientSecret && !success) {
            setLoading(true);
            setError(null);
            api.post(`/invoices/${invoice.id}/pay`)
                .then(data => {
                    setClientSecret(data.clientSecret);
                    setLoading(false);
                })
                .catch(err => {
                    setError(err.message);
                    setLoading(false);
                });
        }
    }, [isOpen, invoice]);

    const handleSuccess = () => {
        setSuccess(true);
        if (onPaid) onPaid(invoice.id);
    };

    const handleClose = () => {
        setClientSecret(null);
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
                        {success ? 'Paiement effectué !' : 'Payer la facture'}
                    </DialogTitle>
                </DialogHeader>

                {success ? (
                    <div className="text-center py-6 space-y-4">
                        <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto" />
                        <p className="text-lg font-medium">Paiement confirmé !</p>
                        <p className="text-sm text-muted-foreground">
                            {invoice?.amount?.toFixed(2)} € — {invoice?.description}
                        </p>
                        <Button variant="glow" onClick={handleClose}>Fermer</Button>
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
                    <div>
                        <div className="mb-4 p-3 rounded-lg bg-secondary/30 border border-border">
                            <p className="text-sm text-muted-foreground">Montant</p>
                            <p className="text-lg font-bold">{invoice?.amount?.toFixed(2)} €</p>
                            <p className="text-xs text-muted-foreground mt-1">{invoice?.description}</p>
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
                            <PaymentForm onSuccess={handleSuccess} onCancel={handleClose} />
                        </Elements>
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}

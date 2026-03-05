import React, { useState, useEffect, useCallback } from 'react';
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
import { api } from '@/lib/api';
import {
    CheckCircle, AlertTriangle, Loader2, Wallet,
    CreditCard, ArrowDownToLine, Settings
} from 'lucide-react';

export default function ConnectOnboarding() {
    const [connectStatus, setConnectStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [stripeConnectInstance, setStripeConnectInstance] = useState(null);
    const [activeTab, setActiveTab] = useState('onboarding'); // 'onboarding' | 'payments' | 'payouts'

    // Fetch Connect status on mount
    useEffect(() => {
        fetchConnectStatus();
    }, []);

    const fetchConnectStatus = async () => {
        try {
            const data = await api.get('/stripe/connect/status');
            setConnectStatus(data);
            if (data.hasAccount && data.detailsSubmitted) {
                setActiveTab('payments');
            }
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
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

    // No account yet — show CTA
    if (!connectStatus?.hasAccount) {
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
        </div>
    );
}

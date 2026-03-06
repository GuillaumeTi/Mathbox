import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { BookOpen, ArrowLeft, Wallet } from 'lucide-react';
import ConnectOnboarding from '@/components/ConnectOnboarding';

export default function Billing() {
    return (
        <div className="min-h-screen bg-background">
            <nav className="sticky top-0 z-40 glass-strong border-b">
                <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-bold gradient-text text-lg">MathBox</span>
                    </div>
                    <Link to="/dashboard"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1.5" />Dashboard</Button></Link>
                </div>
            </nav>

            <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Wallet className="w-6 h-6 text-primary" />
                        Facturation & Paiements
                    </h1>
                    <p className="text-muted-foreground mt-1">Gérez votre compte de paiement, vos factures et vos virements</p>
                </div>

                <ConnectOnboarding />
            </main>
        </div>
    );
}

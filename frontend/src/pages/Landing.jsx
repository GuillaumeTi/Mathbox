import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Video, PenTool, Cloud, Brain, Check, ArrowRight,
    ChevronRight, Sparkles, BookOpen, Users, Shield, Zap, MessageSquare
} from 'lucide-react';

const features = [
    { icon: Video, title: 'Visio Basse Latence', desc: 'WebRTC <150ms. Conversation naturelle et fluide.' },
    { icon: PenTool, title: 'Tableau Blanc Interactif', desc: 'Dessinez en temps réel. Stylo, formes, texte, import d\'images.' },
    { icon: Cloud, title: 'Cloud Auto-Organisé', desc: 'Chaque cours crée un dossier. Captures et docs archivés.' },
    { icon: Brain, title: 'Rapports IA', desc: 'Résumé, concepts clés et exercices générés automatiquement.' },
];

const comparison = [
    { feature: 'Visioconférence HD', mathbox: true, zoom: true, whatsapp: false },
    { feature: 'Tableau blanc intégré', mathbox: true, zoom: false, whatsapp: false },
    { feature: 'Cloud documentaire auto', mathbox: true, zoom: false, whatsapp: false },
    { feature: 'Rapports IA post-cours', mathbox: true, zoom: false, whatsapp: false },
    { feature: 'Gestion des élèves', mathbox: true, zoom: false, whatsapp: false },
    { feature: 'Devoirs intégrés', mathbox: true, zoom: false, whatsapp: false },
    { feature: 'Pas d\'installation', mathbox: true, zoom: false, whatsapp: true },
];

const plans = [
    { name: 'Gratuit', price: '0€', period: '/mois', features: ['3 cours / semaine', '1 Go stockage', 'Tableau blanc basic', '2 crédits IA / mois'], cta: 'Commencer', popular: false },
    { name: 'Pro', price: '19€', period: '/mois', features: ['Cours illimités', '10 Go stockage', 'Tableau blanc avancé', '10 crédits IA / mois', 'Support prioritaire'], cta: 'Essai gratuit', popular: true },
    { name: 'Enterprise', price: '49€', period: '/mois', features: ['Tout Pro +', '100 Go stockage', 'Crédits IA illimités', 'API access', 'Account manager'], cta: 'Nous contacter', popular: false },
];

export default function Landing() {
    return (
        <div className="min-h-screen bg-background">
            {/* Nav */}
            <nav className="fixed top-0 left-0 right-0 z-50 glass-strong">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xl font-bold gradient-text">MathBox</span>
                    </Link>
                    <div className="flex items-center gap-3">
                        <Link to="/contact">
                            <Button variant="ghost" size="sm"><MessageSquare className="w-4 h-4 mr-1.5" />Contact</Button>
                        </Link>
                        <Link to="/login">
                            <Button variant="ghost" size="sm">Connexion</Button>
                        </Link>
                        <Link to="/register">
                            <Button variant="glow" size="sm">Essai gratuit</Button>
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Hero */}
            <section className="pt-32 pb-20 px-6 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />

                <div className="max-w-4xl mx-auto text-center relative">
                    <Badge variant="default" className="mb-6 text-sm px-4 py-1.5">
                        <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                        Le premier OS pour profs indépendants
                    </Badge>

                    <h1 className="text-5xl md:text-7xl font-black leading-tight mb-6">
                        Ne donnez plus juste des cours,{' '}
                        <span className="gradient-text-warm">pilotez la réussite</span>{' '}
                        de vos élèves.
                    </h1>

                    <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
                        MathBox combine visioconférence, tableau blanc collaboratif, Cloud auto-organisé et IA pédagogique en un seul outil.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link to="/register">
                            <Button variant="glow" size="xl" className="w-full sm:w-auto">
                                Essayer gratuitement
                                <ArrowRight className="ml-2 w-5 h-5" />
                            </Button>
                        </Link>
                        <Button variant="outline" size="xl" className="w-full sm:w-auto" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>
                            Découvrir
                            <ChevronRight className="ml-1 w-5 h-5" />
                        </Button>
                    </div>

                    <p className="text-sm text-muted-foreground mt-4 flex items-center justify-center gap-2">
                        <Shield className="w-4 h-4" /> Pas de carte bancaire requise
                    </p>
                </div>
            </section>

            {/* Features */}
            <section id="features" className="py-20 px-6">
                <div className="max-w-6xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
                        Tout ce qu'il vous faut, <span className="gradient-text">en un seul endroit</span>
                    </h2>
                    <p className="text-center text-muted-foreground mb-14 max-w-2xl mx-auto">
                        Fini le jonglage entre Zoom, WhatsApp, Google Drive et vos notes. MathBox unifie tout.
                    </p>

                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {features.map((f, i) => (
                            <Card key={i} className="group hover:border-primary/30 transition-all duration-300 hover:-translate-y-1">
                                <CardHeader>
                                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                                        <f.icon className="w-6 h-6 text-primary" />
                                    </div>
                                    <CardTitle className="text-base">{f.title}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground">{f.desc}</p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            </section>

            {/* Comparison Table */}
            <section className="py-20 px-6 bg-card/50">
                <div className="max-w-4xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-bold text-center mb-14">
                        MathBox vs <span className="text-muted-foreground">les autres</span>
                    </h2>

                    <div className="rounded-xl border overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b bg-secondary/30">
                                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Fonctionnalité</th>
                                    <th className="p-4 text-center">
                                        <span className="gradient-text font-bold">MathBox</span>
                                    </th>
                                    <th className="p-4 text-center text-sm text-muted-foreground">Zoom</th>
                                    <th className="p-4 text-center text-sm text-muted-foreground">WhatsApp</th>
                                </tr>
                            </thead>
                            <tbody>
                                {comparison.map((row, i) => (
                                    <tr key={i} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                                        <td className="p-4 text-sm">{row.feature}</td>
                                        <td className="p-4 text-center">
                                            {row.mathbox ? <Check className="w-5 h-5 text-emerald-400 mx-auto" /> : <span className="text-muted-foreground">—</span>}
                                        </td>
                                        <td className="p-4 text-center">
                                            {row.zoom ? <Check className="w-5 h-5 text-muted-foreground mx-auto" /> : <span className="text-muted-foreground">—</span>}
                                        </td>
                                        <td className="p-4 text-center">
                                            {row.whatsapp ? <Check className="w-5 h-5 text-muted-foreground mx-auto" /> : <span className="text-muted-foreground">—</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            {/* Pricing */}
            <section className="py-20 px-6">
                <div className="max-w-5xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
                        Des tarifs <span className="gradient-text">simples et transparents</span>
                    </h2>
                    <p className="text-center text-muted-foreground mb-14">
                        Commencez gratuitement, passez Pro quand vous êtes prêt.
                    </p>

                    <div className="grid md:grid-cols-3 gap-6">
                        {plans.map((plan, i) => (
                            <Card key={i} className={`relative ${plan.popular ? 'border-primary glow-primary' : ''} hover:-translate-y-1 transition-all duration-300`}>
                                {plan.popular && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                        <Badge className="bg-primary text-white border-0 px-3">Populaire</Badge>
                                    </div>
                                )}
                                <CardHeader className="text-center pb-2">
                                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                                    <div className="mt-3">
                                        <span className="text-4xl font-black">{plan.price}</span>
                                        <span className="text-muted-foreground">{plan.period}</span>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {plan.features.map((f, j) => (
                                        <div key={j} className="flex items-center gap-2 text-sm">
                                            <Check className="w-4 h-4 text-primary shrink-0" />
                                            <span>{f}</span>
                                        </div>
                                    ))}
                                    <Link to="/register" className="block pt-4">
                                        <Button variant={plan.popular ? 'glow' : 'outline'} className="w-full">
                                            {plan.cta}
                                        </Button>
                                    </Link>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-20 px-6">
                <div className="max-w-3xl mx-auto text-center glass rounded-2xl p-12">
                    <Zap className="w-12 h-12 text-primary mx-auto mb-4" />
                    <h2 className="text-3xl font-bold mb-4">
                        Prêt à transformer vos cours ?
                    </h2>
                    <p className="text-muted-foreground mb-8">
                        Rejoignez les professeurs qui utilisent MathBox pour offrir une expérience pédagogique exceptionnelle.
                    </p>
                    <Link to="/register">
                        <Button variant="glow" size="xl">
                            Commencer maintenant
                            <ArrowRight className="ml-2 w-5 h-5" />
                        </Button>
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t py-8 px-6">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-primary" />
                        <span>MathBox © 2026</span>
                    </div>
                    <div className="flex gap-6">
                        <a href="#" className="hover:text-foreground transition-colors">CGU</a>
                        <a href="#" className="hover:text-foreground transition-colors">Confidentialité</a>
                        <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}

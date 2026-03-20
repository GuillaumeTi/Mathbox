import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import PayInvoiceModal from '@/components/PayInvoiceModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    BookOpen, LogOut, FileText, User, Users, Brain, Plus, ChevronDown, ChevronRight,
    Copy, Check, MapPin, CreditCard, CheckSquare, Calendar, Clock, AlertCircle, ExternalLink, Link2, Download
} from 'lucide-react';
import { io } from 'socket.io-client';

const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

const TABS = [
    { id: 'billing', label: 'Facturation', icon: FileText },
    { id: 'info', label: 'Informations', icon: User },
    { id: 'children', label: 'Gestion Enfants', icon: Users },
    { id: 'roi', label: 'Suivi ROI', icon: Brain },
];

export default function ParentDashboard() {
    const { user, logout, fetchMe, updateProfile, addChild } = useAuthStore();
    const navigate = useNavigate();
    const [tab, setTab] = useState('children');
    const [invoices, setInvoices] = useState([]);
    const [children, setChildren] = useState([]);
    const [expandedChild, setExpandedChild] = useState(null);
    const [expandedHomework, setExpandedHomework] = useState(null);
    const [homeworks, setHomeworks] = useState({});

    // Profile form
    const [profileForm, setProfileForm] = useState({ name: '', email: '', street: '', city: '', zipCode: '' });
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileSaved, setProfileSaved] = useState(false);

    // Add child
    const [showAddChild, setShowAddChild] = useState(false);
    const [newChildName, setNewChildName] = useState('');
    const [newChildResult, setNewChildResult] = useState(null);
    const [addingChild, setAddingChild] = useState(false);
    const [copied, setCopied] = useState(false);

    // Magic link per child
    const [childMagicLinks, setChildMagicLinks] = useState({});
    const [loadingMagicLink, setLoadingMagicLink] = useState(null);
    const [copiedChildLink, setCopiedChildLink] = useState(null);

    // Add course code
    const [showAddCourse, setShowAddCourse] = useState(false);
    const [courseCode, setCourseCode] = useState('');
    const [courseChildId, setCourseChildId] = useState('');
    const [enrolling, setEnrolling] = useState(false);

    // Invoice payment
    const [payingInvoice, setPayingInvoice] = useState(null);
    const [stocks, setStocks] = useState([]);

    useEffect(() => {
        fetchMe().then(() => { });

        // Set up socket listener for real-time invoice updates
        if (user) {
            const socket = io(window.location.origin);
            socket.emit('subscribe:courses', user.id); // Same channel we use for course updates is fine, or we can just send it to user:userId

            socket.on('invoice:paid', ({ invoiceId }) => {
                setInvoices(prev => prev.map(inv =>
                    inv.id === invoiceId ? { ...inv, status: 'PAID' } : inv
                ));
            });

            return () => socket.disconnect();
        }
    }, [user?.id]);

    useEffect(() => {
        if (user) {
            setProfileForm({
                name: user.name || '',
                email: user.email || '',
                street: user.street || '',
                city: user.city || '',
                zipCode: user.zipCode || '',
            });
            if (user.children) setChildren(user.children);
        }
    }, [user]);

    useEffect(() => {
        if (tab === 'billing') {
            api.get('/invoices').then(d => setInvoices(d.invoices || [])).catch(() => { });
            api.get('/invoices/stock').then(d => setStocks(d.stocks || [])).catch(() => { });
        }
    }, [tab]);

    const fetchHomeworks = async () => {
        try {
            const data = await api.get('/homeworks');
            if (data.homeworks) {
                // Group homeworks by studentId
                const grouped = {};
                for (const hw of data.homeworks) {
                    const sid = hw.studentId || hw.student?.id;
                    if (!grouped[sid]) grouped[sid] = [];
                    grouped[sid].push({ ...hw, courseTitle: hw.course?.title || '' });
                }
                setHomeworks(grouped);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const generateMagicLink = async (childId) => {
        setLoadingMagicLink(childId);
        try {
            const data = await api.post(`/auth/magic-link/${childId}`);
            setChildMagicLinks(prev => ({ ...prev, [childId]: data }));
        } catch (err) {
            console.error(err);
        }
        setLoadingMagicLink(null);
    };

    const copyChildLink = (childId, link) => {
        navigator.clipboard.writeText(window.location.origin + link);
        setCopiedChildLink(childId);
        setTimeout(() => setCopiedChildLink(null), 2000);
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        setProfileSaving(true);
        try {
            await updateProfile(profileForm);
            setProfileSaved(true);
            setTimeout(() => setProfileSaved(false), 2000);
        } catch (err) { }
        setProfileSaving(false);
    };

    const handleAddChild = async () => {
        if (!newChildName.trim()) return;
        setAddingChild(true);
        try {
            const data = await addChild(newChildName);
            setNewChildResult(data.child);
            fetchMe(); // Refresh children
        } catch (err) { }
        setAddingChild(false);
    };

    const handleEnrollCourse = async () => {
        if (!courseCode.trim() || !courseChildId) return;
        setEnrolling(true);
        try {
            await api.post(`/invite/${courseCode}/enroll`, { childId: courseChildId });
            fetchMe(); // Refresh
            setShowAddCourse(false);
            setCourseCode('');
        } catch (err) { alert(err.message); }
        setEnrolling(false);
    };

    const copyLink = (link) => {
        navigator.clipboard.writeText(window.location.origin + link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleLogout = () => { logout(); navigate('/'); };

    return (
        <div className="min-h-screen flex bg-background">
            {/* Sidebar */}
            <div className="w-64 bg-card border-r border-border flex flex-col shrink-0">
                <div className="p-4 border-b border-border">
                    <Link to="/" className="inline-flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-lg font-bold gradient-text">MathBox</span>
                    </Link>
                </div>
                <nav className="flex-1 p-3 space-y-1">
                    {TABS.map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${tab === t.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                            <t.icon className="w-4 h-4" />
                            {t.label}
                        </button>
                    ))}
                </nav>
                <div className="p-3 border-t border-border">
                    <div className="flex items-center gap-3 px-3 py-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{user?.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                        </div>
                    </div>
                    <Button variant="ghost" size="sm" className="w-full justify-start mt-1 text-muted-foreground" onClick={handleLogout}>
                        <LogOut className="w-4 h-4 mr-2" /> Déconnexion
                    </Button>
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 overflow-auto">
                <div className="max-w-4xl mx-auto p-6 space-y-6">

                    {/* ===== FACTURATION ===== */}
                    {tab === 'billing' && (
                        <>
                            <div>
                                <h1 className="text-2xl font-bold">Facturation</h1>
                                <p className="text-muted-foreground text-sm mt-1">Gérez vos factures et paiements</p>
                            </div>
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Clock className="w-4 h-4" /> Stock d'heures
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {stocks.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">Aucun stock d'heures pour le moment</p>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {stocks.map(s => (
                                                <div key={s.id} className="p-3 rounded-lg border border-border/50 bg-secondary/30">
                                                    <div className="font-medium text-sm">{s.student?.name || 'Élève'} — Prof. {s.prof?.name || ''}</div>
                                                    <div className="flex justify-between text-xs mt-1 text-muted-foreground">
                                                        <span>Achetées: <strong className="text-emerald-400">{s.purchasedHours}h</strong></span>
                                                        <span>Consommées: <strong className="text-amber-400">{s.consumedHoursThisMonth}h</strong></span>
                                                    </div>
                                                    <div className="mt-1 text-xs">
                                                        Restantes: <strong className="text-primary">{Math.max(0, s.purchasedHours - s.consumedHoursThisMonth)}h</strong>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-6">
                                    {invoices.length === 0 ? (
                                        <div className="text-center py-8">
                                            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                                            <p className="text-muted-foreground">Aucune facture pour le moment</p>
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b border-border text-left">
                                                        <th className="pb-3 font-medium text-muted-foreground">Date</th>
                                                        <th className="pb-3 font-medium text-muted-foreground">Description</th>
                                                        <th className="pb-3 font-medium text-muted-foreground">Type</th>
                                                        <th className="pb-3 font-medium text-muted-foreground">Montant TTC</th>
                                                        <th className="pb-3 font-medium text-muted-foreground">Statut</th>
                                                        <th className="pb-3 font-medium text-muted-foreground"></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {invoices.map(inv => {
                                                        const amountTTC = inv.amount;
                                                        return (
                                                            <tr key={inv.id} className="border-b border-border/50">
                                                                <td className="py-3">
                                                                    <div>{new Date(inv.createdAt).toLocaleDateString('fr-FR')}</div>
                                                                    <div className="text-xs text-muted-foreground">{inv.invoiceNumber}</div>
                                                                </td>
                                                                <td className="py-3">{inv.description || 'Abonnement MathBox'}</td>
                                                                <td className="py-3 text-muted-foreground text-xs">{inv.type === 'CREDIT_NOTE' ? 'AVOIR' : 'FACTURE'}</td>
                                                                <td className={`py-3 font-bold ${inv.type === 'CREDIT_NOTE' ? 'text-red-400' : 'text-primary'}`}>{amountTTC.toFixed(2)} €</td>
                                                                <td className="py-3">
                                                                    <Badge variant={inv.status === 'PAID' ? 'success' : inv.status === 'CANCELLED' ? 'destructive' : 'warning'}>
                                                                        {inv.status === 'PAID' ? 'Payé' : inv.status === 'CANCELLED' ? 'Annulé' : 'En attente'}
                                                                    </Badge>
                                                                </td>
                                                                <td className="py-3 text-right">
                                                                    {inv.status === 'PENDING' && (
                                                                        <Button size="sm" variant="outline" onClick={() => setPayingInvoice(inv)}>Payer</Button>
                                                                    )}
                                                                    {inv.documentUrl && (
                                                                        <Button size="sm" variant="ghost" asChild className="text-emerald-400 hover:text-emerald-300">
                                                                            <a href={inv.documentUrl} target="_blank" rel="noopener noreferrer">
                                                                                <Download className="w-4 h-4 mr-2" />
                                                                                PDF
                                                                            </a>
                                                                        </Button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </>
                    )}

                    {/* ===== INFORMATIONS ===== */}
                    {tab === 'info' && (
                        <>
                            <div>
                                <h1 className="text-2xl font-bold">Informations personnelles</h1>
                                <p className="text-muted-foreground text-sm mt-1">Mettez à jour vos coordonnées</p>
                            </div>
                            <Card>
                                <CardContent className="pt-6">
                                    <form onSubmit={handleSaveProfile} className="space-y-4 max-w-lg">
                                        <div className="space-y-2">
                                            <Label>Nom complet</Label>
                                            <Input value={profileForm.name} onChange={e => setProfileForm({ ...profileForm, name: e.target.value })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Email</Label>
                                            <Input type="email" value={profileForm.email} disabled className="opacity-60" />
                                            <p className="text-xs text-muted-foreground">L'email ne peut pas être modifié</p>
                                        </div>

                                        <div className="pt-2 border-t border-border">
                                            <div className="flex items-center gap-2 mb-3">
                                                <MapPin className="w-4 h-4 text-muted-foreground" />
                                                <Label className="text-base font-medium">Adresse de facturation</Label>
                                            </div>
                                            <div className="space-y-3">
                                                <div className="space-y-2">
                                                    <Label>Rue</Label>
                                                    <Input placeholder="12 rue de la Paix" value={profileForm.street}
                                                        onChange={e => setProfileForm({ ...profileForm, street: e.target.value })} />
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-2">
                                                        <Label>Ville</Label>
                                                        <Input placeholder="Paris" value={profileForm.city}
                                                            onChange={e => setProfileForm({ ...profileForm, city: e.target.value })} />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label>Code postal</Label>
                                                        <Input placeholder="75001" value={profileForm.zipCode}
                                                            onChange={e => setProfileForm({ ...profileForm, zipCode: e.target.value })} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="pt-2 border-t border-border">
                                            <div className="flex items-center gap-2 mb-3">
                                                <CreditCard className="w-4 h-4 text-muted-foreground" />
                                                <Label className="text-base font-medium">Moyen de paiement</Label>
                                            </div>
                                            <div className="bg-muted/50 rounded-lg p-4 flex items-center justify-between">
                                                <p className="text-sm text-muted-foreground">Aucun moyen de paiement configuré</p>
                                                <Button variant="outline" size="sm" disabled>Ajouter</Button>
                                            </div>
                                        </div>

                                        <Button type="submit" variant="glow" disabled={profileSaving}>
                                            {profileSaved ? <><Check className="w-4 h-4 mr-2" /> Sauvegardé !</> : (profileSaving ? 'Sauvegarde...' : 'Enregistrer')}
                                        </Button>
                                    </form>
                                </CardContent>
                            </Card>
                        </>
                    )}

                    {/* ===== GESTION ENFANTS ===== */}
                    {tab === 'children' && (
                        <>
                            <div className="flex items-center justify-between">
                                <div>
                                    <h1 className="text-2xl font-bold">Gestion des enfants</h1>
                                    <p className="text-muted-foreground text-sm mt-1">{children.length} enfant{children.length > 1 ? 's' : ''} inscrit{children.length > 1 ? 's' : ''}</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setShowAddCourse(true)}>
                                        <Plus className="w-4 h-4 mr-1" /> Code cours
                                    </Button>
                                    <Button variant="glow" size="sm" onClick={() => { setShowAddChild(true); setNewChildResult(null); setNewChildName(''); }}>
                                        <Plus className="w-4 h-4 mr-1" /> Ajouter un enfant
                                    </Button>
                                </div>
                            </div>

                            {/* Add child modal */}
                            {showAddChild && (
                                <Card className="border-primary/30 bg-primary/5">
                                    <CardContent className="pt-6 space-y-4">
                                        {!newChildResult ? (
                                            <>
                                                <div className="space-y-2">
                                                    <Label>Prénom de l'enfant</Label>
                                                    <div className="flex gap-2">
                                                        <Input placeholder="Léo" value={newChildName} onChange={e => setNewChildName(e.target.value)} />
                                                        <Button onClick={handleAddChild} disabled={addingChild || !newChildName.trim()}>
                                                            {addingChild ? '...' : 'Créer'}
                                                        </Button>
                                                    </div>
                                                </div>
                                                <Button variant="ghost" size="sm" onClick={() => setShowAddChild(false)}>Annuler</Button>
                                            </>
                                        ) : (
                                            <div className="space-y-3">
                                                <p className="text-sm text-emerald-400 font-medium">✅ Compte créé pour {newChildResult.name}</p>
                                                <div className="bg-background/50 rounded-lg p-3 space-y-2">
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-muted-foreground">Utilisateur</span>
                                                        <span className="font-mono font-bold">{newChildResult.username}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Input readOnly value={window.location.origin + newChildResult.magicLink} className="font-mono text-xs" />
                                                        <Button size="icon" variant="outline" onClick={() => copyLink(newChildResult.magicLink)}>
                                                            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                                                        </Button>
                                                    </div>
                                                </div>
                                                <Button variant="ghost" size="sm" onClick={() => setShowAddChild(false)}>Fermer</Button>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}

                            {/* Add course code modal */}
                            {showAddCourse && (
                                <Card className="border-primary/30 bg-primary/5">
                                    <CardContent className="pt-6 space-y-4">
                                        <div className="space-y-2">
                                            <Label>Code du cours</Label>
                                            <Input placeholder="MAT-1234" value={courseCode} onChange={e => setCourseCode(e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Enfant à inscrire</Label>
                                            <select value={courseChildId} onChange={e => setCourseChildId(e.target.value)}
                                                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                                                <option value="">Sélectionner...</option>
                                                {children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button onClick={handleEnrollCourse} disabled={enrolling || !courseCode || !courseChildId}>
                                                {enrolling ? '...' : 'Inscrire'}
                                            </Button>
                                            <Button variant="ghost" onClick={() => setShowAddCourse(false)}>Annuler</Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Children list */}
                            {children.map(child => (
                                <Card key={child.id}>
                                    <CardContent className="pt-6">
                                        <button onClick={() => {
                                            const newId = expandedChild === child.id ? null : child.id;
                                            setExpandedChild(newId);
                                            if (newId && Object.keys(homeworks).length === 0) fetchHomeworks();
                                        }}
                                            className="w-full flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                                    <Users className="w-5 h-5 text-primary" />
                                                </div>
                                                <div className="text-left">
                                                    <p className="font-semibold">{child.name}</p>
                                                    <p className="text-xs text-muted-foreground">@{child.username} • {child.coursesAsStudent?.length || 0} cours</p>
                                                </div>
                                            </div>
                                            {expandedChild === child.id ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                                        </button>

                                        {expandedChild === child.id && (
                                            <div className="mt-4 space-y-4 border-t border-border pt-4">
                                                {/* Magic Link */}
                                                <div>
                                                    <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                                                        <Link2 className="w-4 h-4 text-muted-foreground" />
                                                        {child.needsPasswordSetup ? "Lien d'inscription pour votre enfant" : "Lien de réinitialisation de mot de passe"}
                                                    </h3>
                                                    {childMagicLinks[child.id] ? (
                                                        <div className="space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <Input readOnly value={window.location.origin + childMagicLinks[child.id].magicLink} className="font-mono text-xs" />
                                                                <Button size="icon" variant="outline" onClick={() => copyChildLink(child.id, childMagicLinks[child.id].magicLink)}>
                                                                    {copiedChildLink === child.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                                                                </Button>
                                                            </div>
                                                            <p className="text-xs text-muted-foreground">
                                                                {childMagicLinks[child.id].needsPasswordSetup
                                                                    ? '⏳ En attente — l\'enfant n\'a pas encore créé son mot de passe'
                                                                    : '✅ L\'enfant a déjà configuré son compte'
                                                                }
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <Button variant="outline" size="sm" onClick={() => generateMagicLink(child.id)} disabled={loadingMagicLink === child.id}>
                                                            <Link2 className="w-4 h-4 mr-1" />
                                                            {loadingMagicLink === child.id
                                                                ? 'Génération...'
                                                                : (child.needsPasswordSetup ? "Générer un lien d'inscription" : "Générer un lien de réinitialisation")
                                                            }
                                                        </Button>
                                                    )}
                                                </div>

                                                {/* Courses */}
                                                <div>
                                                    <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                                                        <Calendar className="w-4 h-4 text-muted-foreground" /> Cours
                                                    </h3>
                                                    {(!child.coursesAsStudent || child.coursesAsStudent.length === 0) ? (
                                                        <p className="text-sm text-muted-foreground">Aucun cours inscrit</p>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            {child.coursesAsStudent.map(c => (
                                                                <div key={c.id} className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
                                                                    <div>
                                                                        <p className="text-sm font-medium">{c.title}</p>
                                                                        <p className="text-xs text-muted-foreground">
                                                                            {c.professor?.name} • {c.recurrence === 'WEEKLY' && c.dayOfWeek != null ? `${DAYS[c.dayOfWeek]} ${c.startTime || ''}` : 'Ponctuel'}
                                                                        </p>
                                                                    </div>
                                                                    <Badge variant="outline">{c.subject || 'Général'}</Badge>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Homework */}
                                                <div>
                                                    <button onClick={() => setExpandedHomework(expandedHomework === child.id ? null : child.id)}
                                                        className="w-full flex items-center justify-between text-sm font-medium mb-2">
                                                        <span className="flex items-center gap-2">
                                                            <CheckSquare className="w-4 h-4 text-muted-foreground" /> Devoirs
                                                        </span>
                                                        {expandedHomework === child.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                    </button>
                                                    {expandedHomework === child.id && (
                                                        <div className="space-y-2">
                                                            {(!homeworks[child.id] || homeworks[child.id].length === 0) ? (
                                                                <p className="text-sm text-muted-foreground">Aucun devoir</p>
                                                            ) : (
                                                                homeworks[child.id].map(hw => (
                                                                    <div key={hw.id} className="flex items-center gap-3 p-2.5 bg-muted/20 rounded-lg">
                                                                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${hw.completed ? 'bg-emerald-500 border-emerald-500' : 'border-border'}`}>
                                                                            {hw.completed && <Check className="w-3 h-3 text-white" />}
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className={`text-sm ${hw.completed ? 'line-through text-muted-foreground' : ''}`}>{hw.title}</p>
                                                                            <p className="text-xs text-muted-foreground">{hw.courseTitle}</p>
                                                                        </div>
                                                                        {hw.dueDate && (
                                                                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                                                <Clock className="w-3 h-3" />
                                                                                {new Date(hw.dueDate).toLocaleDateString('fr-FR')}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ))
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}

                            {children.length === 0 && (
                                <Card>
                                    <CardContent className="py-12 text-center">
                                        <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                                        <p className="text-muted-foreground">Aucun enfant enregistré</p>
                                        <Button variant="glow" size="sm" className="mt-4" onClick={() => { setShowAddChild(true); setNewChildResult(null); }}>
                                            <Plus className="w-4 h-4 mr-1" /> Ajouter un enfant
                                        </Button>
                                    </CardContent>
                                </Card>
                            )}
                        </>
                    )}

                    {/* ===== SUIVI ROI ===== */}
                    {tab === 'roi' && (
                        <>
                            <div>
                                <h1 className="text-2xl font-bold">Suivi du ROI</h1>
                                <p className="text-muted-foreground text-sm mt-1">Rapports IA sur la progression de votre enfant</p>
                            </div>
                            <Card>
                                <CardContent className="py-16 text-center">
                                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                                        <Brain className="w-8 h-8 text-primary" />
                                    </div>
                                    <h3 className="text-lg font-semibold mb-2">Analyse IA bientôt disponible</h3>
                                    <p className="text-muted-foreground text-sm max-w-md mx-auto">
                                        {children.length > 0
                                            ? `${children[0].name} a ${children[0].coursesAsStudent?.length || 0} cours inscrits. L'analyse IA de la progression sera disponible prochainement.`
                                            : 'Inscrivez un enfant à des cours pour commencer le suivi.'
                                        }
                                    </p>
                                </CardContent>
                            </Card>
                        </>
                    )}
                </div>
            </div>

            <PayInvoiceModal
                isOpen={!!payingInvoice}
                onClose={() => setPayingInvoice(null)}
                invoice={payingInvoice}
                onPaid={() => {
                    // Update locally to indicate success without closing modal instantly
                    setInvoices(prev => prev.map(i => i.id === payingInvoice?.id ? { ...i, status: 'PAID' } : i));
                }}
            />
        </div >
    );
}

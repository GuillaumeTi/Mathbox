import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    BookOpen, Folder, FileText, Upload, ArrowLeft, Download,
    Trash2, ChevronRight, Plus, Image, File, Pencil, RefreshCw
} from 'lucide-react';

export default function Cloud() {
    const { user } = useAuthStore();
    const [folders, setFolders] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [currentFolder, setCurrentFolder] = useState(null);
    const [breadcrumb, setBreadcrumb] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [syncing, setSyncing] = useState(false);

    // Rename State
    const [renamingItem, setRenamingItem] = useState(null); // { id, type, name }
    const [newName, setNewName] = useState('');

    useEffect(() => {
        fetchFolders();
        fetchDocuments();
    }, [currentFolder]);

    const fetchFolders = async () => {
        try {
            const params = currentFolder ? `?parentId=${currentFolder.id}` : '';
            const data = await api.get(`/folders${params}`);
            setFolders(data.folders || []);
        } catch (err) { }
    };

    const fetchDocuments = async () => {
        try {
            // Virtual Folders Logic
            if (!currentFolder || currentFolder.id === 'students' || currentFolder.id.startsWith('virtual_')) {
                setDocuments([]);
                return;
            }

            let params = '';
            if (currentFolder.id === 'private') {
                params = ''; // implies folderId: null in backend
            } else {
                params = `?folderId=${currentFolder.id}`;
            }

            const data = await api.get(`/documents${params}`);
            setDocuments(data.documents || []);
        } catch (err) { }
    };

    const openFolder = (folder) => {
        setBreadcrumb(prev => [...prev, folder]);
        setCurrentFolder(folder);
    };

    const goBack = (index) => {
        if (index < 0) {
            setCurrentFolder(null);
            setBreadcrumb([]);
        } else {
            const folder = breadcrumb[index];
            setBreadcrumb(breadcrumb.slice(0, index + 1));
            setCurrentFolder(folder);
        }
    };

    const createFolder = async () => {
        const name = prompt('Nom du dossier :');
        if (!name) return;
        try {
            await api.post('/folders', { name, parentId: currentFolder?.id });
            fetchFolders();
        } catch (err) {
            alert(err.message);
        }
    };

    const handleUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            if (currentFolder) formData.append('folderId', currentFolder.id);
            await api.upload('/documents/upload', formData);
            fetchDocuments();
        } catch (err) {
            alert(err.message);
        }
        setUploading(false);
    };

    const handleDelete = async (item) => {
        const isFolder = item.type === 'FOLDER';
        const message = isFolder
            ? `Voulez-vous vraiment supprimer le dossier "${item.name}" et tout son contenu ?`
            : `Supprimer le fichier "${item.name || item.title}" ?`;

        if (!confirm(message)) return;

        try {
            if (isFolder) {
                await api.delete(`/folders/${item.id}`);
                fetchFolders();
            } else {
                await api.delete(`/documents/${item.id}`);
                fetchDocuments();
            }
        } catch (err) {
            alert("Erreur lors de la suppression: " + err.message);
        }
    };

    const handleRename = async (e) => {
        e.preventDefault();
        if (!renamingItem || !newName.trim()) return;

        try {
            await api.put('/storage/rename', {
                id: renamingItem.id,
                type: renamingItem.type,
                newName: newName.trim()
            });

            // Refresh
            if (renamingItem.type === 'FOLDER') fetchFolders();
            else fetchDocuments();

            setRenamingItem(null);
            setNewName('');
        } catch (err) {
            alert(err.message);
        }
    };

    const handleDownloadFolder = async (folder) => {
        try {
            const res = await fetch(`/api/storage/folder/${folder.id}/download`, {
                headers: {
                    'Authorization': `Bearer ${useAuthStore.getState().token}`
                }
            });

            if (!res.ok) throw new Error("Download failed");

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${folder.name}_${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            alert("Erreur de téléchargement: " + err.message);
        }
    };

    const handleSync = async () => {
        if (!confirm("Synchroniser le stockage ? Cela supprimera les références aux fichiers manquants sur le disque.")) return;
        setSyncing(true);
        try {
            const res = await api.post('/storage/sync', {});
            alert(`Synchro terminée. ${res.removed} fichiers orphelins supprimés.`);
            fetchDocuments();
            fetchFolders();
        } catch (err) {
            alert("Erreur de synchro: " + err.message);
        }
        setSyncing(false);
    };

    const getFileIcon = (mimeType) => {
        if (mimeType?.startsWith('image/')) return <Image className="w-5 h-5 text-pink-400" />;
        if (mimeType?.includes('pdf')) return <FileText className="w-5 h-5 text-red-400" />;
        return <File className="w-5 h-5 text-blue-400" />;
    };

    const dashboardPath = user?.role === 'PROFESSOR' ? '/dashboard' : '/student';

    // UNIFIED LIST LOGIC
    const unifiedList = [
        ...folders.map(f => ({ ...f, type: 'FOLDER' })),
        ...documents.map(d => ({ ...d, type: 'FILE' }))
    ].sort((a, b) => {
        if (a.type === 'FOLDER' && b.type === 'FILE') return -1;
        if (a.type === 'FILE' && b.type === 'FOLDER') return 1;
        return (a.name || a.title).localeCompare(b.name || b.title);
    });

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
                    <Link to={dashboardPath}><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1.5" />Dashboard</Button></Link>
                </div>
            </nav>

            <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Folder className="w-6 h-6 text-primary" /> Mon Cloud
                        </h1>
                        {/* Breadcrumb */}
                        <div className="flex items-center gap-1 mt-2 text-sm">
                            <button onClick={() => goBack(-1)} className="text-muted-foreground hover:text-foreground">Racine</button>
                            {breadcrumb.map((f, i) => (
                                <span key={f.id} className="flex items-center gap-1">
                                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                                    <button onClick={() => goBack(i)} className="text-muted-foreground hover:text-foreground">{f.name}</button>
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-2">
                        {user?.role === 'PROFESSOR' && (
                            <Button variant="ghost" size="sm" onClick={handleSync} disabled={syncing} title="Nettoyer les fichiers manquants">
                                <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? 'animate-spin' : ''}`} /> Sync
                            </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={createFolder}>
                            <Plus className="w-4 h-4 mr-1" /> Dossier
                        </Button>
                        <label>
                            <Button variant="glow" size="sm" asChild disabled={uploading}>
                                <span>
                                    <Upload className="w-4 h-4 mr-1" /> {uploading ? 'Envoi...' : 'Uploader'}
                                </span>
                            </Button>
                            <input type="file" className="hidden" onChange={handleUpload} />
                        </label>
                    </div>
                </div>

                {/* UNIFIED LIST VIEW */}
                <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
                    {unifiedList.length === 0 ? (
                        <div className="p-12 text-center">
                            <Folder className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                            <p className="text-lg font-medium mb-2">Dossier vide</p>
                            <p className="text-sm text-muted-foreground">Aucun fichier ou dossier.</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b bg-secondary/30">
                                    <th className="text-left p-3 pl-4 text-sm font-medium text-muted-foreground w-12">Type</th>
                                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Nom</th>
                                    <th className="text-left p-3 text-sm font-medium text-muted-foreground w-24">Taille</th>
                                    <th className="text-left p-3 text-sm font-medium text-muted-foreground w-32">Date</th>
                                    <th className="text-right p-3 pr-4 text-sm font-medium text-muted-foreground w-32">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {unifiedList.map(item => {
                                    const isFolder = item.type === 'FOLDER';
                                    const name = item.name || item.title;
                                    const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString('fr-FR') : '—';
                                    const size = item.size ? `${(item.size / 1024).toFixed(1)} KB` : (isFolder ? `${item._count?.documents || 0} items` : '—');

                                    return (
                                        <tr
                                            key={item.id}
                                            className="border-b border-border/50 hover:bg-secondary/20 transition-colors cursor-default group"
                                        >
                                            <td className="p-3 pl-4">
                                                {isFolder ? (
                                                    <Folder className="w-5 h-5 text-amber-400 fill-amber-400/20" />
                                                ) : (
                                                    getFileIcon(item.mimeType)
                                                )}
                                            </td>
                                            <td className="p-3">
                                                {isFolder ? (
                                                    <button
                                                        onClick={() => openFolder(item)}
                                                        className="font-medium hover:text-primary hover:underline text-left w-full truncate block"
                                                    >
                                                        {name}
                                                    </button>
                                                ) : (
                                                    <span className="text-sm truncate block">{name}</span>
                                                )}
                                            </td>
                                            <td className="p-3 text-sm text-muted-foreground">{size}</td>
                                            <td className="p-3 text-sm text-muted-foreground">{date}</td>
                                            <td className="p-3 pr-4">
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {/* Rename Action */}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                                                        onClick={() => {
                                                            setRenamingItem(item);
                                                            setNewName(name);
                                                        }}
                                                        title="Renommer"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </Button>

                                                    {/* Download Action */}
                                                    {isFolder ? (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                                                            onClick={() => handleDownloadFolder(item)}
                                                            title="Tout télécharger (Zip)"
                                                        >
                                                            <Download className="w-3.5 h-3.5" />
                                                        </Button>
                                                    ) : (
                                                        <a href={item.url} target="_blank" rel="noopener noreferrer">
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title="Télécharger">
                                                                <Download className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </a>
                                                    )}

                                                    {/* Delete Action (Protect Virtual Folders?) */}
                                                    {(!isFolder || !item.isVirtual) && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-muted-foreground hover:text-red-400"
                                                            onClick={() => handleDelete(item)}
                                                            title="Supprimer"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </main>

            {/* Rename Dialog */}
            <Dialog open={!!renamingItem} onOpenChange={(open) => !open && setRenamingItem(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Renommer</DialogTitle>
                        <DialogDescription>Entrez le nouveau nom.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleRename} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Nom</Label>
                            <Input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setRenamingItem(null)}>Annuler</Button>
                            <Button type="submit" variant="glow">Enregistrer</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}

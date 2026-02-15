import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    BookOpen, Folder, FileText, Upload, ArrowLeft, Download,
    Trash2, ChevronRight, Plus, Image, File
} from 'lucide-react';

export default function Cloud() {
    const { user } = useAuthStore();
    const [folders, setFolders] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [currentFolder, setCurrentFolder] = useState(null);
    const [breadcrumb, setBreadcrumb] = useState([]);
    const [uploading, setUploading] = useState(false);

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
            const params = currentFolder ? `?folderId=${currentFolder.id}` : '';
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

    const deleteDoc = async (id) => {
        if (!confirm('Supprimer ce fichier ?')) return;
        try {
            await api.delete(`/documents/${id}`);
            fetchDocuments();
        } catch (err) { }
    };

    const getFileIcon = (mimeType) => {
        if (mimeType?.startsWith('image/')) return <Image className="w-5 h-5 text-pink-400" />;
        if (mimeType?.includes('pdf')) return <FileText className="w-5 h-5 text-red-400" />;
        return <File className="w-5 h-5 text-blue-400" />;
    };

    const dashboardPath = user?.role === 'PROF' ? '/dashboard' : '/student';

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

                {/* Folders */}
                {folders.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {folders.map(folder => (
                            <button
                                key={folder.id}
                                onClick={() => openFolder(folder)}
                                className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/20 transition-all text-left group"
                            >
                                <Folder className="w-8 h-8 text-amber-400 shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">{folder.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {folder._count?.documents || 0} fichiers
                                    </p>
                                </div>
                                {folder.isAutoGenerated && <Badge variant="default" className="ml-auto text-[10px]">Auto</Badge>}
                            </button>
                        ))}
                    </div>
                )}

                {/* Documents */}
                {documents.length > 0 ? (
                    <div className="rounded-xl border overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b bg-secondary/30">
                                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Fichier</th>
                                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Type</th>
                                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Taille</th>
                                    <th className="text-left p-3 text-sm font-medium text-muted-foreground">Date</th>
                                    <th className="text-right p-3 text-sm font-medium text-muted-foreground">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {documents.map(doc => (
                                    <tr key={doc.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                                        <td className="p-3">
                                            <div className="flex items-center gap-2">
                                                {getFileIcon(doc.mimeType)}
                                                <span className="text-sm">{doc.title}</span>
                                            </div>
                                        </td>
                                        <td className="p-3"><Badge variant="secondary" className="text-xs">{doc.type}</Badge></td>
                                        <td className="p-3 text-sm text-muted-foreground">
                                            {doc.size ? `${(doc.size / 1024).toFixed(1)} KB` : '—'}
                                        </td>
                                        <td className="p-3 text-sm text-muted-foreground">
                                            {new Date(doc.createdAt).toLocaleDateString('fr-FR')}
                                        </td>
                                        <td className="p-3">
                                            <div className="flex items-center justify-end gap-1">
                                                <a href={doc.url} target="_blank" rel="noopener noreferrer">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <Download className="w-3.5 h-3.5" />
                                                    </Button>
                                                </a>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-400" onClick={() => deleteDoc(doc.id)}>
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : folders.length === 0 ? (
                    <Card className="p-12 text-center">
                        <Folder className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium mb-2">Cloud vide</p>
                        <p className="text-sm text-muted-foreground">Vos fichiers et dossiers de cours apparaîtront ici.</p>
                    </Card>
                ) : null}
            </main>
        </div>
    );
}

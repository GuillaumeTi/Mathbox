import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

export default function HomeworkModal({ courseId, isOpen, onClose, onSuccess }) {
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({ title: '', description: '', dueDate: '' });

    const handleSubmit = async () => {
        if (!form.title) return;
        setLoading(true);
        try {
            await api.post('/homeworks', { ...form, courseId });
            setForm({ title: '', description: '', dueDate: '' });
            if (onSuccess) onSuccess();
            else alert('Devoirs assignés avec succès !');
            onClose();
        } catch (err) {
            console.error(err);
            alert('Erreur lors de l\'assignation.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-background rounded-xl border p-6 w-96 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-200">
                <h3 className="text-lg font-semibold">Assigner des Devoirs</h3>
                <div className="space-y-3">
                    <div>
                        <Label>Titre</Label>
                        <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex: Exercices page 42" autoFocus />
                    </div>
                    <div>
                        <Label>Description</Label>
                        <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[80px]" placeholder="Détails..." />
                    </div>
                    <div>
                        <Label>Date limite</Label>
                        <Input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
                    </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" onClick={onClose}>Annuler</Button>
                    <Button onClick={handleSubmit} disabled={loading}>{loading ? 'Envoi...' : 'Assigner'}</Button>
                </div>
            </div>
        </div>,
        document.body
    );
}

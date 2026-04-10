const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = 'GuillaumeTi/Mathbox';

const TYPE_LABELS = {
    suggestion: '💡 Suggestion',
    reclamation: '📢 Réclamation',
    bug: '🐛 Bug',
    autre: '📋 Autre',
};

// Simple counter using a DB table or fallback to issue count
async function getNextTicketId() {
    try {
        // Use a simple approach: count existing GitHub issues + 1
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues?state=all&per_page=1`, {
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github+json',
            }
        });
        // GitHub returns total in link header or we can parse
        // Simpler: just use timestamp-based unique ID
        const now = new Date();
        const id = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
        return id;
    } catch {
        return Date.now().toString();
    }
}

// POST /api/contact — no auth required (works for logged-in users and visitors)
router.post('/', async (req, res) => {
    try {
        const { email, type, message } = req.body;

        // Validate
        if (!email || !type || !message) {
            return res.status(400).json({ error: 'Tous les champs sont requis' });
        }
        if (!['suggestion', 'reclamation', 'bug', 'autre'].includes(type)) {
            return res.status(400).json({ error: 'Type de demande invalide' });
        }
        if (!GITHUB_TOKEN) {
            console.error('[Contact] GITHUB_TOKEN is not set');
            return res.status(500).json({ error: 'Configuration serveur manquante' });
        }

        const ticketId = await getNextTicketId();
        const typeLabel = TYPE_LABELS[type] || type;
        const title = `TICKET-${ticketId} | ${typeLabel}`;

        // Build issue body
        const body = [
            `## 📩 Demande de contact`,
            ``,
            `| Champ | Valeur |`,
            `|-------|--------|`,
            `| **Ticket** | \`TICKET-${ticketId}\` |`,
            `| **Type** | ${typeLabel} |`,
            `| **Email** | ${email} |`,
            `| **Date** | ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} |`,
            ``,
            `---`,
            ``,
            `### Message`,
            ``,
            message,
        ].join('\n');

        // Map type to GitHub label
        const labels = [];
        if (type === 'bug') labels.push('bug');
        else if (type === 'suggestion') labels.push('enhancement');
        else if (type === 'reclamation') labels.push('feedback');

        // Create GitHub issue via REST API
        const ghResponse = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title,
                body,
                labels,
            })
        });

        if (!ghResponse.ok) {
            const errText = await ghResponse.text();
            console.error('[Contact] GitHub API error:', ghResponse.status, errText);
            return res.status(500).json({ error: 'Impossible de créer le ticket' });
        }

        const ghIssue = await ghResponse.json();
        console.log(`[Contact] Issue created: #${ghIssue.number} — ${title}`);

        res.json({
            success: true,
            ticketId: `TICKET-${ticketId}`,
            issueNumber: ghIssue.number,
            message: 'Votre demande a été envoyée avec succès',
        });
    } catch (err) {
        console.error('[Contact] Error:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;

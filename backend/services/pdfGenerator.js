const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Ensures the uploads directory exists
 */
function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Generates a PDF Document (Facture for PRO, or Reçu for INDIVIDUAL)
 * 
 * @param {Object} invoice - The CourseInvoice record from Prisma (must include Professor and Parent relations)
 * @param {string} fileName - Generated filename (e.g. `facture-1234.pdf`)
 * @returns {Promise<string>} - Returns the relative URL path to the generated PDF (e.g., `/uploads/facture-1234.pdf`)
 */
async function generateInvoicePDF(invoice, fileName) {
    return new Promise((resolve, reject) => {
        try {
            const uploadDir = process.env.UPLOAD_DIR || 'uploads';
            const absoluteDir = path.isAbsolute(uploadDir) ? uploadDir : path.join(process.cwd(), uploadDir);
            ensureDirectoryExists(absoluteDir);

            const filePath = path.join(absoluteDir, fileName);
            const relativeUrl = `/uploads/${fileName}`;

            const doc = new PDFDocument({ margin: 50 });
            const stream = fs.createWriteStream(filePath);

            doc.pipe(stream);

            const prof = invoice.professor;
            const parent = invoice.parent;
            const isPro = prof.legalStatus === 'PRO';

            // --- HEADER ---
            doc.fontSize(20).text('MathBox', { align: 'right' });
            doc.moveDown();

            doc.fontSize(24).text(isPro ? 'FACTURE' : 'REÇU', { align: 'left' });
            doc.fontSize(10).text(`Document N°: ${invoice.id.split('-')[0].toUpperCase()}`, { align: 'left' });
            doc.text(`Date: ${new Date(invoice.paidAt || invoice.updatedAt).toLocaleDateString('fr-FR')}`, { align: 'left' });
            doc.moveDown(2);

            // --- PROFESSOR INFO ---
            doc.fontSize(12).font('Helvetica-Bold').text(isPro ? "Prestataire (Professeur)" : "Particulier (Professeur)");
            doc.font('Helvetica').fontSize(10);
            doc.text(prof.name);
            if (isPro && prof.companyName) {
                doc.text(prof.companyName);
            }
            if (prof.address) {
                doc.text(prof.address);
            }
            if (prof.phone) {
                doc.text(`Tél: ${prof.phone}`);
            }
            if (isPro && prof.siret) {
                doc.text(`SIRET: ${prof.siret}`);
            }
            doc.moveDown();

            // --- PARENT / CLIENT INFO ---
            doc.fontSize(12).font('Helvetica-Bold').text("Client (Parent d'élève)");
            doc.font('Helvetica').fontSize(10);
            doc.text(parent.name);
            doc.text(parent.email);
            if (parent.address) { // fallback to old fields if address is missing
                doc.text(parent.address);
            } else if (parent.street) {
                doc.text(`${parent.street}, ${parent.zipCode || ''} ${parent.city || ''}`);
            }
            doc.moveDown(2);

            // --- INVOICE DETAILS ---
            const tableTop = doc.y;
            doc.font('Helvetica-Bold');
            doc.text('Description', 50, tableTop);
            doc.text('Montant TTC', 400, tableTop, { width: 100, align: 'right' });
            doc.moveTo(50, tableTop + 15).lineTo(500, tableTop + 15).stroke();
            doc.moveDown();

            doc.font('Helvetica');
            const itemY = doc.y + 10;
            doc.text(invoice.description || 'Cours de mathématiques', 50, itemY);
            doc.text(`${invoice.amount.toFixed(2)} €`, 400, itemY, { width: 100, align: 'right' });

            doc.moveTo(50, itemY + 20).lineTo(500, itemY + 20).stroke();

            // --- TOTALS ---
            const totalY = itemY + 30;
            doc.font('Helvetica-Bold');
            doc.text('Total Payé:', 300, totalY, { width: 100, align: 'right' });
            doc.text(`${invoice.amount.toFixed(2)} €`, 400, totalY, { width: 100, align: 'right' });

            // Mentions Légales
            doc.moveDown(4);
            doc.fontSize(8).font('Helvetica-Oblique');
            if (isPro) {
                doc.text("TVA non applicable, art. 293 B du CGI (ou selon statut). Les paiements sont sécurisés par Stripe via la plateforme MathBox.", { align: 'center', width: 450 });
            } else {
                doc.text("Ceci est un reçu confirmant le paiement à un particulier. Les paiements sont sécurisés par Stripe via la plateforme MathBox.", { align: 'center', width: 450 });
            }

            doc.end();

            stream.on('finish', () => {
                resolve(relativeUrl);
            });

            stream.on('error', (err) => {
                console.error('[PDFGenerator] Stream Error:', err);
                reject(err);
            });

        } catch (error) {
            console.error('[PDFGenerator] Error:', error);
            reject(error);
        }
    });
}

module.exports = { generateInvoicePDF };

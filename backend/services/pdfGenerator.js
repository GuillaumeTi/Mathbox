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

            // --- INVOICE CALCULATIONS ---
            const tvaStatus = prof.tvaStatus || 'FRANCHISE';
            const isSubjectTva = isPro && tvaStatus === 'SUBJECT_20';

            const hours = invoice.hours || 1;
            const rateTTC = invoice.hourlyRate || invoice.amount;
            const discountTTC = invoice.discount || 0;

            const rateHT = isSubjectTva ? rateTTC / 1.2 : rateTTC;
            const baseHT = hours * rateHT;
            const discountHT = isSubjectTva ? discountTTC / 1.2 : discountTTC;
            const totalHT = baseHT - discountHT;

            const amountTTC = invoice.amount;
            const tvaAmount = isSubjectTva ? amountTTC - totalHT : 0;

            // --- INVOICE DETAILS TABLE ---
            const tableTop = doc.y;
            doc.font('Helvetica-Bold');
            doc.text('Description', 50, tableTop);
            doc.text('Qté (h)', 250, tableTop, { width: 50, align: 'right' });
            doc.text('Prix Unit. HT', 320, tableTop, { width: 80, align: 'right' });
            doc.text('Total HT', 420, tableTop, { width: 80, align: 'right' });
            doc.moveTo(50, tableTop + 15).lineTo(500, tableTop + 15).stroke();
            doc.moveDown();

            doc.font('Helvetica');
            let itemY = doc.y + 10;
            const desc = invoice.description ? `${invoice.description} (Prestation en ligne)` : `Cours de mathématiques (Prestation en ligne)`;

            // Primary Row
            doc.text(desc, 50, itemY, { width: 200 });
            doc.text(hours.toString(), 250, itemY, { width: 50, align: 'right' });
            doc.text(`${rateHT.toFixed(2)} €`, 320, itemY, { width: 80, align: 'right' });
            doc.text(`${baseHT.toFixed(2)} €`, 420, itemY, { width: 80, align: 'right' });
            itemY += 20;

            // Discount Row
            if (discountHT > 0) {
                doc.text('Remise appliquée', 50, itemY, { width: 200 });
                doc.text('-', 250, itemY, { width: 50, align: 'right' });
                doc.text(`-${discountHT.toFixed(2)} €`, 320, itemY, { width: 80, align: 'right' });
                doc.text(`-${discountHT.toFixed(2)} €`, 420, itemY, { width: 80, align: 'right' });
                itemY += 20;
            }

            doc.moveTo(50, itemY + 10).lineTo(500, itemY + 10).stroke();

            // --- TOTALS BLOCK ---
            let totalY = itemY + 25;
            doc.font('Helvetica-Bold');

            if (isPro) {
                doc.text('Total HT:', 300, totalY, { width: 100, align: 'right' });
                doc.text(`${totalHT.toFixed(2)} €`, 420, totalY, { width: 80, align: 'right' });
                totalY += 20;

                doc.text('TVA (20%):', 300, totalY, { width: 100, align: 'right' });
                doc.text(`${tvaAmount.toFixed(2)} €`, 420, totalY, { width: 80, align: 'right' });
                totalY += 20;
            }

            doc.text(isPro ? 'Total TTC (Payé):' : 'Total Payé:', 250, totalY, { width: 150, align: 'right' });
            doc.text(`${amountTTC.toFixed(2)} €`, 420, totalY, { width: 80, align: 'right' });

            // --- MENTIONS LÉGALES ---
            doc.moveDown(4);
            doc.fontSize(8).font('Helvetica-Oblique');

            if (isPro) {
                let legalMention = "";
                if (tvaStatus === 'FRANCHISE') {
                    legalMention = "TVA non applicable, article 293 B du Code Général des Impôts.";
                } else if (tvaStatus === 'EXONERATED') {
                    legalMention = "Exonération de TVA, article 261, 4, 4° b du Code Général des Impôts.";
                } else {
                    legalMention = "Prestation assujettie à la TVA au taux de 20%.";
                }
                doc.text(`${legalMention} Les paiements sont sécurisés par Stripe via la plateforme MathBox.`, { align: 'center', width: 450 });
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

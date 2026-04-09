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
 * @param {boolean} isPaid - Boolean indicating if the invoice has been successfully paid (renders RED stamp)
 * @returns {Promise<string>} - Returns the relative URL path to the generated PDF (e.g., `/uploads/facture-1234.pdf`)
 */
async function generateInvoicePDF(invoice, fileName, isPaid = true, acompteRow = null) {
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

            let titleName = 'FACTURE';
            if (!isPro) titleName = 'REÇU';
            if (invoice.type === 'CREDIT_NOTE') titleName = 'AVOIR';

            doc.fontSize(24).text(titleName, { align: 'left' });

            const displayDocNumber = invoice.invoiceNumber || invoice.id.split('-')[0].toUpperCase();
            doc.fontSize(10).text(`Document N°: ${displayDocNumber}`, { align: 'left' });

            const displayDate = invoice.paidAt ? new Date(invoice.paidAt) : new Date(invoice.createdAt || invoice.updatedAt);
            doc.text(`Date: ${displayDate.toLocaleDateString('fr-FR')}`, { align: 'left' });
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
            const acompteHT = acompteRow ? (isSubjectTva ? acompteRow.total / 1.2 : acompteRow.total) : 0;
            const totalHT = baseHT - discountHT + acompteHT; // acompteHT is negative when deduction

            const amountTTC = invoice.amount;
            const tvaAmount = isSubjectTva ? amountTTC - totalHT : 0;

            // --- INVOICE DETAILS TABLE ---
            const tableTop = doc.y;
            doc.font('Helvetica-Bold').fontSize(10);
            doc.text('Description',   50,  tableTop, { width: 200 });
            doc.text('Qté (h)',       255, tableTop, { width: 60,  align: 'right' });
            doc.text('Prix Unit. HT', 320, tableTop, { width: 90,  align: 'right' });
            doc.text('Total HT',      420, tableTop, { width: 80,  align: 'right' });
            doc.moveTo(50, tableTop + 15).lineTo(500, tableTop + 15).stroke();

            doc.font('Helvetica').fontSize(10);
            let itemY = tableTop + 25;

            // ── Session row ───────────────────────────────────────────────────
            const desc = invoice.description
                ? invoice.description.split('\n')[0].trim() + ' (Prestation en ligne)'
                : 'Cours de mathématiques (Prestation en ligne)';

            doc.text(desc,                      50,  itemY, { width: 200 });
            doc.text(hours.toString(),           255, itemY, { width: 60,  align: 'right' });
            doc.text(`${rateHT.toFixed(2)} €`,  320, itemY, { width: 90,  align: 'right' });
            doc.text(`${baseHT.toFixed(2)} €`,  420, itemY, { width: 80,  align: 'right' });
            itemY += Math.max(20, doc.heightOfString(desc, { width: 200 }) + 6);

            // ── Discount row ──────────────────────────────────────────────────
            if (discountHT > 0) {
                doc.text('Remise appliquée',              50,  itemY, { width: 200 });
                doc.text('-',                             255, itemY, { width: 60,  align: 'right' });
                doc.text(`-${discountHT.toFixed(2)} €`,  320, itemY, { width: 90,  align: 'right' });
                doc.text(`-${discountHT.toFixed(2)} €`,  420, itemY, { width: 80,  align: 'right' });
                itemY += 20;
            }

            // ── Acompte deduction row ─────────────────────────────────────────
            if (acompteRow) {
                doc.moveTo(50, itemY).lineTo(500, itemY).lineWidth(0.3).stroke();
                itemY += 6;
                doc.font('Helvetica').fontSize(10).fillColor('#374151');
                doc.text(acompteRow.label,                             50,  itemY, { width: 200 });
                doc.text('1',                                          255, itemY, { width: 60,  align: 'right' });
                doc.fillColor('#DC2626');
                doc.text(`${acompteRow.unitPrice.toFixed(2)} €`,       320, itemY, { width: 90,  align: 'right' });
                doc.text(`${acompteRow.total.toFixed(2)} €`,           420, itemY, { width: 80,  align: 'right' });
                doc.fillColor('black');
                itemY += Math.max(20, doc.heightOfString(acompteRow.label, { width: 200 }) + 6);
            }

            doc.moveTo(50, itemY + 5).lineTo(500, itemY + 5).lineWidth(0.5).stroke();

            // --- TOTALS BLOCK ---
            let totalY = itemY + 20;
            doc.font('Helvetica-Bold').fontSize(10);

            // Total HT
            doc.text('Total HT :',   300, totalY, { width: 110, align: 'right' });
            doc.font('Helvetica');
            doc.text(`${totalHT.toFixed(2)} €`, 420, totalY, { width: 80, align: 'right' });
            totalY += 18;

            // TVA
            doc.font('Helvetica-Bold');
            doc.text('TVA (20%) :', 300, totalY, { width: 110, align: 'right' });
            doc.font('Helvetica');
            doc.text(`${tvaAmount.toFixed(2)} €`, 420, totalY, { width: 80, align: 'right' });
            totalY += 18;

            // Separator + TTC
            doc.moveTo(300, totalY).lineTo(500, totalY).lineWidth(0.5).stroke();
            totalY += 6;
            const totalText = isPaid ? 'Total TTC (Payé) :' : 'Total TTC :';
            doc.font('Helvetica-Bold').fontSize(11);
            doc.text(totalText,                   300, totalY, { width: 110, align: 'right' });
            doc.text(`${amountTTC.toFixed(2)} €`, 420, totalY, { width: 80,  align: 'right' });

            // Store safe Y coordinate before stamp
            const postTotalY = totalY + 40;

            // --- RED STAMP "PAYÉ" ---
            if (isPaid && invoice.type !== 'CREDIT_NOTE') {
                doc.save();
                doc.translate(doc.page.width / 2, doc.page.height / 2);
                doc.rotate(-25);

                doc.font('Helvetica-Bold').fontSize(60);
                doc.fillOpacity(0.3).fillColor('#EF4444'); // Red color at 30% opacity
                doc.text('PAYÉ', -doc.widthOfString('PAYÉ') / 2, -40);

                if (invoice.paidAt) {
                    doc.fontSize(20);
                    const dateText = `le ${new Date(invoice.paidAt).toLocaleDateString('fr-FR')}`;
                    doc.text(dateText, -doc.widthOfString(dateText) / 2, 20);
                }

                doc.restore(); // reset transforms/colors for the legals below
                doc.fillColor('black'); // Ensure text remains black
            }

            // --- MENTIONS LÉGALES ---
            doc.fontSize(8).font('Helvetica-Oblique');
            const legalTextOptions = { align: 'center', width: 495 };

            if (isPro) {
                let legalMention = "";
                if (tvaStatus === 'FRANCHISE') {
                    legalMention = "TVA non applicable, article 293 B du Code Général des Impôts.";
                } else if (tvaStatus === 'EXONERATED') {
                    legalMention = "Exonération de TVA, article 261, 4, 4° b du Code Général des Impôts.";
                } else {
                    legalMention = "Prestation assujettie à la TVA au taux de 20%.";
                }
                doc.text(`${legalMention} Les paiements sont sécurisés par Stripe via la plateforme MathBox.`, 50, postTotalY, legalTextOptions);
            } else {
                doc.text("Ceci est un reçu confirmant le paiement à un particulier. Les paiements sont sécurisés par Stripe via la plateforme MathBox.", 50, postTotalY, legalTextOptions);
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

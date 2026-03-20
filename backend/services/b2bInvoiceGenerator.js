/**
 * B2B Platform Invoice Generator
 * 
 * Generates monthly PLATFORM_INVOICE invoices from MathBox to each Professor.
 * Sums all PENDING PlatformTransactions, generates a PDF, marks them INVOICED.
 */

const { PrismaClient } = require('@prisma/client');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const MATHBOX_INFO = {
    name: 'MathBox SAS',
    siret: '12345678900012',
    address: '1 Rue de l\'Innovation, 75001 Paris',
    email: 'contact@mathbox.io',
};

function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function generateB2BPDF(invoice, professor, transactions, fileName) {
    return new Promise((resolve, reject) => {
        try {
            const uploadDir = process.env.UPLOAD_DIR || 'uploads';
            const absoluteDir = path.isAbsolute(uploadDir) ? uploadDir : path.join(process.cwd(), uploadDir);
            ensureDirectoryExists(absoluteDir);

            const filePath = path.join(absoluteDir, fileName);
            const relativeUrl = '/uploads/' + fileName;

            const doc = new PDFDocument({ margin: 50 });
            const stream = fs.createWriteStream(filePath);
            doc.pipe(stream);

            // HEADER
            doc.fontSize(20).text('MathBox', { align: 'right' });
            doc.moveDown();
            doc.fontSize(24).text('FACTURE PLATEFORME', { align: 'left' });
            doc.fontSize(10).text('N\u00b0: ' + invoice.invoiceNumber, { align: 'left' });
            doc.text('Date: ' + new Date(invoice.createdAt).toLocaleDateString('fr-FR'), { align: 'left' });
            doc.moveDown(2);

            // EMITTER
            doc.fontSize(12).font('Helvetica-Bold').text('\u00c9metteur');
            doc.font('Helvetica').fontSize(10);
            doc.text(MATHBOX_INFO.name);
            doc.text('SIRET: ' + MATHBOX_INFO.siret);
            doc.text(MATHBOX_INFO.address);
            doc.text(MATHBOX_INFO.email);
            doc.moveDown();

            // RECIPIENT
            doc.fontSize(12).font('Helvetica-Bold').text('Destinataire');
            doc.font('Helvetica').fontSize(10);
            doc.text(professor.name);
            if (professor.companyName) doc.text(professor.companyName);
            if (professor.address) doc.text(professor.address);
            if (professor.siret) doc.text('SIRET: ' + professor.siret);
            doc.text(professor.email);
            doc.moveDown(2);

            // TABLE
            const tableTop = doc.y;
            doc.font('Helvetica-Bold');
            doc.text('Description', 50, tableTop);
            doc.text('Type', 300, tableTop, { width: 80, align: 'left' });
            doc.text('Montant', 420, tableTop, { width: 80, align: 'right' });
            doc.moveTo(50, tableTop + 15).lineTo(500, tableTop + 15).stroke();

            let currentY = tableTop + 25;
            doc.font('Helvetica').fontSize(9);

            for (const tx of transactions) {
                const typeLabel = tx.type === 'SUBSCRIPTION' ? 'Abonnement' :
                    tx.type === 'AI_CREDITS' ? 'Cr\u00e9dits IA' :
                        tx.type === 'COMMISSION' ? 'Commission' : tx.type;

                doc.text(tx.description || typeLabel, 50, currentY, { width: 240 });
                doc.text(typeLabel, 300, currentY, { width: 80, align: 'left' });
                doc.text(tx.amount.toFixed(2) + ' \u20ac', 420, currentY, { width: 80, align: 'right' });
                currentY += 18;

                if (currentY > 700) {
                    doc.addPage();
                    currentY = 50;
                }
            }

            // TOTAL
            doc.moveTo(50, currentY + 5).lineTo(500, currentY + 5).stroke();
            currentY += 15;
            doc.font('Helvetica-Bold').fontSize(12);
            doc.text('TOTAL TTC', 300, currentY, { width: 100, align: 'left' });
            doc.text(invoice.amount.toFixed(2) + ' \u20ac', 420, currentY, { width: 80, align: 'right' });

            // PAY\u00c9 STAMP
            currentY += 40;
            doc.save();
            doc.translate(120, currentY);
            doc.rotate(-30);
            doc.fontSize(60).fillColor('red').fillOpacity(0.3);
            doc.text('PAY\u00c9', 0, 0, { align: 'center' });
            doc.restore();

            // LEGAL
            doc.fillColor('black').fillOpacity(1);
            doc.fontSize(7).text(
                'TVA non applicable, article 293 B du Code G\u00e9n\u00e9ral des Imp\u00f4ts.',
                50, 720, { width: 450, align: 'center' }
            );

            doc.end();
            stream.on('finish', function() { resolve(relativeUrl); });
            stream.on('error', reject);
        } catch (error) {
            reject(error);
        }
    });
}

async function generateMonthlyB2BInvoices() {
    console.log('[B2B] Starting monthly B2B invoice generation...');

    const profsWithTransactions = await prisma.platformTransaction.groupBy({
        by: ['profId'],
        where: { status: 'PENDING' },
        _sum: { amount: true },
        _count: true,
    });

    console.log('[B2B] Found ' + profsWithTransactions.length + ' professors with pending transactions');

    const results = [];

    for (const group of profsWithTransactions) {
        try {
            const professor = await prisma.user.findUnique({
                where: { id: group.profId },
                select: { id: true, name: true, email: true, address: true, siret: true, companyName: true }
            });

            if (!professor) continue;

            const transactions = await prisma.platformTransaction.findMany({
                where: { profId: group.profId, status: 'PENDING' },
                orderBy: { createdAt: 'asc' }
            });

            const totalAmount = transactions.reduce(function(sum, tx) { return sum + tx.amount; }, 0);

            // Incremental invoice number for platform invoices
            const currentCount = await prisma.courseInvoice.count({
                where: { type: 'PLATFORM_INVOICE' }
            });
            const increment = String(currentCount + 1).padStart(4, '0');
            const invoiceNumber = 'PLAT-MB-' + increment;

            // Need a courseId — use the first course of this prof
            const firstCourse = await prisma.course.findFirst({ where: { professorId: group.profId } });
            if (!firstCourse) {
                console.log('[B2B] Skipping prof ' + professor.name + ' — no courses found');
                continue;
            }

            const monthLabel = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

            const invoice = await prisma.courseInvoice.create({
                data: {
                    invoiceNumber: invoiceNumber,
                    amount: totalAmount,
                    description: 'Facture plateforme MathBox - ' + monthLabel,
                    professorId: group.profId,
                    parentId: group.profId,
                    courseId: firstCourse.id,
                    type: 'PLATFORM_INVOICE',
                    status: 'PAID',
                    paidAt: new Date(),
                }
            });

            const fileName = invoiceNumber + '.pdf';
            const documentUrl = await generateB2BPDF(invoice, professor, transactions, fileName);

            await prisma.courseInvoice.update({
                where: { id: invoice.id },
                data: { documentUrl: documentUrl }
            });

            await prisma.platformTransaction.updateMany({
                where: { profId: group.profId, status: 'PENDING' },
                data: { status: 'INVOICED' }
            });

            results.push({
                profId: group.profId,
                profName: professor.name,
                invoiceNumber: invoiceNumber,
                amount: totalAmount,
                transactionCount: transactions.length,
            });

            console.log('[B2B] Generated ' + invoiceNumber + ' for ' + professor.name + ' - ' + totalAmount.toFixed(2) + ' EUR (' + transactions.length + ' transactions)');
        } catch (err) {
            console.error('[B2B] Error for prof ' + group.profId + ':', err);
        }
    }

    console.log('[B2B] Monthly generation complete. ' + results.length + ' invoices generated.');
    return results;
}

module.exports = { generateMonthlyB2BInvoices };

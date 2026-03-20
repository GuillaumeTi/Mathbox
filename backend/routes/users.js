const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const authMiddleware = require('../middleware/auth');
const axios = require('axios'); // if we want to call APIs from backend instead of frontend, but the user plan said calling it from the frontend to autofill is fine. The backend will just receive the payload.

// PUT /api/users/profile
// Update exhaustive profile information (used in the Professor Account page)
router.put('/profile', authMiddleware, async (req, res) => {
    try {
        const {
            name,
            phone,
            address,
            legalStatus,
            siret,
            companyName,
            commissionRate,
            tvaStatus,
        } = req.body;

        // Basic validation for SIRET if PRO
        if (legalStatus === 'PRO' && !siret) {
            return res.status(400).json({ error: 'SIRET is required for professional accounts.' });
        }

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (phone !== undefined) updateData.phone = phone;
        if (address !== undefined) updateData.address = address;
        if (legalStatus !== undefined) updateData.legalStatus = legalStatus;
        if (siret !== undefined) updateData.siret = siret;
        if (companyName !== undefined) updateData.companyName = companyName;
        if (tvaStatus !== undefined) updateData.tvaStatus = tvaStatus;

        // Billing mandate (legal checkbox)
        const { billingMandate } = req.body;
        if (billingMandate !== undefined) updateData.billingMandate = !!billingMandate;

        // Safety lock on commissionRate overrides (e.g. users sending fake rates)
        // We calculate it natively: 10% for individual, 5% for PRO.
        if (legalStatus === 'PRO') {
            updateData.commissionRate = 0.05;
        } else if (legalStatus === 'INDIVIDUAL') {
            updateData.commissionRate = 0.10;
        } else if (commissionRate !== undefined && req.user.role === 'ADMIN') {
            updateData.commissionRate = commissionRate; // Only an admin directly allows raw rates
        }

        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: updateData,
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                address: true,
                legalStatus: true,
                siret: true,
                companyName: true,
                tvaStatus: true,
                commissionRate: true,
                billingMandate: true,
                role: true,
            }
        });

        res.json({ message: 'Profile updated successfully', user: updatedUser });
    } catch (error) {
        console.error('[Users] Profile update error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

module.exports = router;

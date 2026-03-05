// Trial Guard Middleware
// Checks if a PROFESSOR's trial is expired and they have no active subscription.
// Hardcodes prof_test@gmail.com as always-expired for testing.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Test account override — always treated as trial expired
const FORCE_EXPIRED_EMAILS = ['prof_test@gmail.com'];

/**
 * Returns trial status info for a professor user.
 * Can be used both as middleware and as a utility.
 */
async function getTrialStatus(user) {
    if (user.role !== 'PROFESSOR') {
        return { trialExpired: false, trialActive: false, daysLeft: 0 };
    }

    // Hardcode override: force trial expired for test accounts
    if (user.email && FORCE_EXPIRED_EMAILS.includes(user.email)) {
        return {
            trialExpired: true,
            trialActive: false,
            daysLeft: 0,
            trialEndDate: user.trialEndDate,
            subscriptionStatus: user.subscriptionStatus,
            forced: true,
        };
    }

    // Active subscription overrides trial state
    if (user.subscriptionStatus === 'ACTIVE') {
        return {
            trialExpired: false,
            trialActive: false,
            daysLeft: 0,
            subscriptionStatus: 'ACTIVE',
        };
    }

    // Check trial dates
    const now = new Date();
    const trialEnd = user.trialEndDate ? new Date(user.trialEndDate) : null;

    if (!trialEnd) {
        // No trial set — treat as expired (legacy accounts)
        return { trialExpired: true, trialActive: false, daysLeft: 0 };
    }

    const daysLeft = Math.max(0, Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24)));
    const trialExpired = now > trialEnd;

    return {
        trialExpired,
        trialActive: !trialExpired,
        daysLeft,
        trialEndDate: user.trialEndDate,
        subscriptionStatus: user.subscriptionStatus,
    };
}

/**
 * Middleware: blocks the request if the professor's trial is expired
 * and they don't have an active subscription.
 */
function requireActiveTrial(req, res, next) {
    // Only applies to PROFESSOR role
    if (req.user.role !== 'PROFESSOR') return next();

    // We need the full user data — fetch it
    prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
            id: true,
            email: true,
            role: true,
            subscriptionStatus: true,
            trialEndDate: true,
        },
    }).then(user => {
        if (!user) return res.status(404).json({ error: 'User not found' });

        return getTrialStatus(user).then(status => {
            if (status.trialExpired) {
                return res.status(403).json({
                    error: 'Trial expired. Subscribe to access this feature.',
                    trialExpired: true,
                });
            }
            next();
        });
    }).catch(err => {
        console.error('[TrialGuard] Error:', err);
        res.status(500).json({ error: 'Internal error' });
    });
}

module.exports = { getTrialStatus, requireActiveTrial };

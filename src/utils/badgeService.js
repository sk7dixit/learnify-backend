// src/utils/badgeService.js
const pool = require('../config/db');

// --- Badge Definitions ---
const allBadges = {
    // Admin Only
    developer: { name: 'Developer', symbol: '💻', description: 'The creator of Learnify.' },

    // Upload Activity
    first_uploader: { name: 'First Uploader', symbol: '🥇', description: 'Awarded for uploading your very first note.' },
    note_master: { name: 'Note Master', symbol: '🎓', description: 'Awarded for uploading 10 or more notes.' },
    knowledge_vault: { name: 'Knowledge Vault', symbol: '🏛️', description: 'Awarded for uploading 25 or more notes.' },
    archive_builder: { name: 'Archive Builder', symbol: '📚', description: 'A true legend, awarded for uploading 100 or more notes.' },

    // Quality / Ratings
    five_star_creator: { name: '5-Star Creator', symbol: '🌟', description: 'Awarded when your notes achieve an average rating of 5.0.' },
    trusted_author: { name: 'Trusted Author', symbol: '✍️', description: 'Awarded for consistently receiving positive reviews.' },

    // Community & Interaction
    reviewer: { name: 'Reviewer', symbol: '🧐', description: 'Awarded for reviewing and rating 10 or more notes.' },

    // Milestone / Progress
    og_member: { name: 'OG Member', symbol: '⏳', description: 'Joined in the early days of Learnify.' },
    loyal_learner: { name: 'Loyal Learner', symbol: '💖', description: 'For being an active member for over 6 months.' },

    // Special / Fun Badges
    midnight_scholar: { name: 'Midnight Scholar', symbol: '🌙', description: 'For uploading a note after midnight.' },
    early_bird: { name: 'Early Bird', symbol: '☀️', description: 'For uploading a note before 7 AM.' },
};

// --- Badge Awarding Logic ---
async function checkAndAwardBadges(userId) {
    const client = await pool.connect();
    try {
        const userQuery = `
            SELECT
                u.id, u.created_at, u.badges, u.role,
                (SELECT COUNT(*) FROM notes WHERE user_id = u.id AND approval_status = 'approved') AS total_uploads,
                (SELECT COUNT(*) FROM note_ratings WHERE user_id = u.id) AS total_reviews,
                (SELECT AVG(r.rating) FROM note_ratings r JOIN notes n ON r.note_id = n.id WHERE n.user_id = u.id) AS avg_rating,
                (SELECT COUNT(*) FROM notes WHERE user_id = u.id AND approval_status = 'approved' AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= 18) AS midnight_uploads, -- Midnight UTC
                (SELECT COUNT(*) FROM notes WHERE user_id = u.id AND approval_status = 'approved' AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') < 2) AS early_uploads -- Before 7 AM UTC is 2 AM UTC
            FROM users u WHERE u.id = $1
            GROUP BY u.id;
        `;
        const { rows } = await pool.query(userQuery, [userId]);
        if (rows.length === 0) return;

        const user = rows[0];
        const currentBadges = new Set(user.badges || []);
        const newBadges = [];

        const award = (badgeKey) => {
            if (!currentBadges.has(badgeKey)) {
                newBadges.push(badgeKey);
                currentBadges.add(badgeKey);
            }
        };

        // Award Developer badge to admin
        if (user.role === 'admin') award('developer');

        // Check conditions for each badge
        if (user.total_uploads >= 1) award('first_uploader');
        if (user.total_uploads >= 10) award('note_master');
        if (user.total_uploads >= 25) award('knowledge_vault');
        if (user.total_uploads >= 100) award('archive_builder');

        if (user.avg_rating && parseFloat(user.avg_rating) >= 5.0) award('five_star_creator');
        if (user.avg_rating && parseFloat(user.avg_rating) >= 4.5 && user.total_uploads >= 5) award('trusted_author');

        if (user.total_reviews >= 10) award('reviewer');

        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        if (new Date(user.created_at) < sixMonthsAgo) award('loyal_learner');

        const ogDate = new Date('2025-12-31');
        if (new Date(user.created_at) < ogDate) award('og_member');

        if (user.midnight_uploads > 0) award('midnight_scholar');
        if (user.early_uploads > 0) award('early_bird');

        if (newBadges.length > 0) {
            const allUserBadges = Array.from(currentBadges);
            await client.query('UPDATE users SET badges = $1 WHERE id = $2', [allUserBadges, userId]);
            console.log(`Awarded ${newBadges.length} new badges to user ${userId}: ${newBadges.join(', ')}`);
        }

    } catch (error) {
        console.error(`Error checking badges for user ${userId}:`, error);
    } finally {
        client.release();
    }
}

async function checkAllUsers() {
    console.log("Starting periodic badge check for all users...");
    const { rows } = await pool.query('SELECT id FROM users');
    for (const user of rows) {
        await checkAndAwardBadges(user.id);
    }
    console.log("Periodic badge check completed.");
}

module.exports = {
    allBadges,
    checkAndAwardBadges,
    checkAllUsers,
};
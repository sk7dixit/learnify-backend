const pool = require('../config/db');
const { allBadges } = require('../utils/badgeService');

// --- Your existing controller functions ---

async function getDashboardData(req, res) {
    try {
        const [
            usersResult,
            activeSubscriptionsResult,
            totalRevenueResult,
            popularNotesResult,
            totalViewsResult,
            allSubscriptionsResult,
            planDistributionResult,
        ] = await Promise.all([
            pool.query("SELECT COUNT(*) FROM users WHERE role = 'user'"),
            pool.query("SELECT COUNT(*) FROM subscriptions WHERE end_date > NOW() AND status = 'active'"),
            pool.query(`
                SELECT COALESCE(SUM(
                    CASE plan
                        WHEN 'weekly' THEN 5
                        WHEN 'monthly' THEN 15
                        WHEN 'semester' THEN 60
                        ELSE 0
                    END
                ), 0) AS total_revenue
                FROM subscriptions
                WHERE status = 'active'
            `),
            pool.query("SELECT title, view_count FROM notes WHERE approval_status = 'approved' ORDER BY view_count DESC LIMIT 5"),
            pool.query("SELECT COALESCE(SUM(view_count), 0) AS total_views FROM notes"),
            pool.query(`
                SELECT u.name, u.email, s.plan, s.end_date as subscription_expiry, s.status
                FROM subscriptions s
                JOIN users u ON s.user_id = u.id
                ORDER BY s.start_date DESC
            `),
            pool.query(`
                SELECT plan, COUNT(*) AS value
                FROM subscriptions
                WHERE status = 'active'
                GROUP BY plan
            `)
        ]);

        const planDistribution = planDistributionResult.rows.map(item => ({
            name: item.plan.charAt(0).toUpperCase() + item.plan.slice(1),
            value: parseInt(item.value)
        }));

        res.json({
            totalUsers: parseInt(usersResult.rows[0].count) || 0,
            activeSubscriptions: parseInt(activeSubscriptionsResult.rows[0].count) || 0,
            totalRevenue: parseFloat(totalRevenueResult.rows[0].total_revenue) || 0,
            totalNotesViews: parseInt(totalViewsResult.rows[0].total_views) || 0,
            popularNotes: popularNotesResult.rows || [],
            allSubscriptions: allSubscriptionsResult.rows || [],
            planDistribution: planDistribution || [],
        });
    } catch (error) {
        console.error('❌ Error fetching admin dashboard data:', error);
        res.status(500).json({ error: 'Failed to fetch admin dashboard data' });
    }
}

async function getActiveUsers(req, res) {
  try {
    const result = await pool.query(
      "SELECT id, name, email, created_at, last_login FROM users WHERE role = 'user' ORDER BY last_login DESC NULLS LAST"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching active users:", err.message);
    res.status(500).json({ error: "Failed to fetch user data." });
  }
}

async function getAppSettings(req, res) {
  try {
    const result = await pool.query("SELECT setting_key, setting_value FROM app_settings");
    const settings = result.rows.reduce((acc, setting) => {
      acc[setting.setting_key] = setting.setting_value;
      return acc;
    }, {});
    res.json(settings);
  } catch (err) {
    console.error("❌ Error fetching app settings:", err.message);
    res.status(500).json({ error: "Failed to fetch settings." });
  }
}

async function updateAppSetting(req, res) {
  try {
    const { settingKey, settingValue } = req.body;
    if (typeof settingValue !== 'boolean') {
      return res.status(400).json({ error: 'Setting value must be a boolean.' });
    }
    const result = await pool.query(
      "UPDATE app_settings SET setting_value = $1 WHERE setting_key = $2 RETURNING *",
      [settingValue, settingKey]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Setting not found." });
    }
    res.json({ message: "✅ Setting updated successfully!", setting: result.rows[0] });
  } catch (err) {
    console.error("❌ Error updating app setting:", err.message);
    res.status(500).json({ error: "Failed to update setting." });
  }
}

async function getUserSubmissions(req, res) {
    try {
        const result = await pool.query(
            `SELECT n.id, n.title, n.approval_status, n.created_at, u.username
             FROM notes n
             JOIN users u ON n.user_id = u.id
             WHERE n.material_type = 'user_material'
             ORDER BY n.created_at DESC`
        );
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Error fetching user submissions:", err.message);
        res.status(500).json({ error: "Failed to fetch user submissions." });
    }
}

async function getBadgeData(req, res) {
    try {
        const result = await pool.query("SELECT id, username, badges FROM users WHERE badges IS NOT NULL AND array_length(badges, 1) > 0");
        const usersByBadge = {};
        for (const badgeKey in allBadges) {
            usersByBadge[badgeKey] = {
                ...allBadges[badgeKey],
                users: [],
            };
        }
        result.rows.forEach(user => {
            if (user.badges) {
                user.badges.forEach(badgeKey => {
                    if (usersByBadge[badgeKey]) {
                        usersByBadge[badgeKey].users.push(user.username);
                    }
                });
            }
        });
        res.json(Object.values(usersByBadge));
    } catch (error) {
        console.error('❌ Error fetching badge data for admin:', error);
        res.status(500).json({ error: 'Failed to fetch badge data' });
    }
}

async function getAllNotes(req, res) {
    try {
        const result = await pool.query(
            `SELECT n.id, n.title, n.approval_status, n.created_at, u.username
             FROM notes n
             JOIN users u ON n.user_id = u.id
             ORDER BY n.created_at DESC`
        );
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Error fetching all notes for admin:", err.message);
        res.status(500).json({ error: "Failed to fetch all notes." });
    }
}

// --- NEW FUNCTION: deleteUser (Using PostgreSQL Logic) ---
async function deleteUser(req, res, next) {
    try {
        const userId = req.params.id;

        // Use PostgreSQL's DELETE command via pool.query
        const result = await pool.query(
            "DELETE FROM users WHERE id = $1",
            [userId]
        );

        if (result.rowCount === 0) {
            // No row was deleted, meaning the user ID was not found.
            return res.status(404).json({
                status: 'fail',
                message: `No user found with ID ${userId}`
            });
        }

        // 204 No Content is the standard response for successful DELETE
        res.status(204).json({
            status: 'success',
            data: null
        });

    } catch (error) {
        console.error("Error deleting user:", error);
        // Use next(error) to send the error to the global Express handler
        next(error);
    }
}

module.exports = {
  getDashboardData,
  getActiveUsers,
  getAppSettings,
  updateAppSetting,
  getUserSubmissions,
  getBadgeData,
  getAllNotes,
  deleteUser, // <--- Now correctly defined and exported
};
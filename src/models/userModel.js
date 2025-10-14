const pool = require("../config/db");

async function createUser(name, age, email, hashedPassword, role, verificationToken, mobileNumber, username) {
  const result = await pool.query(
    `INSERT INTO users (name, age, email, password, role, is_verified, verification_token, mobile_number, username)
     VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7, $8)
     RETURNING id, name, email, role, is_verified, mobile_number, free_views, created_at, username`,
    [name, age, email, hashedPassword, role, verificationToken, mobileNumber, username]
  );
  return result.rows[0];
}

async function findUserByEmail(email) {
  const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  return result.rows[0];
}

async function findUserByUsername(username) {
  const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
  return result.rows[0];
}

async function findUserByEmailOrUsername(identifier) {
  const result = await pool.query("SELECT * FROM users WHERE email = $1 OR username = $1", [identifier]);
  return result.rows[0];
}

async function findUserByMobile(mobileNumber) {
    const result = await pool.query("SELECT * FROM users WHERE mobile_number = $1", [mobileNumber]);
    return result.rows[0];
}

async function findUserById(id) {
  const result = await pool.query( "SELECT * FROM users WHERE id = $1", [id] );
  return result.rows[0];
}

async function updateUserPassword(userId, hashedPassword) {
  await pool.query( "UPDATE users SET password = $1 WHERE id = $2", [hashedPassword, userId] );
}

async function updateUserLastLogin(userId) {
  await pool.query( "UPDATE users SET last_login = NOW() WHERE id = $1", [userId] );
}

async function verifyUser(userId) {
  await pool.query( "UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = $1", [userId] );
}

async function findUserByVerificationToken(token) {
  const result = await pool.query("SELECT * FROM users WHERE verification_token = $1", [token]);
  return result.rows[0];
}

async function updateUserProfile(userId, fields) {
    const queryParts = [];
    const queryValues = [];
    let index = 1;

    // Map frontend camelCase names to backend snake_case column names
    const fieldMap = {
        name: fields.name,
        age: fields.age,
        mobile_number: fields.mobileNumber,
        school_college: fields.schoolCollege,
        bio: fields.bio
    };

    for (const [key, value] of Object.entries(fieldMap)) {
        // Only add fields to the query that were actually provided
        if (value !== undefined && value !== null) {
            queryParts.push(`${key} = $${index++}`);
            queryValues.push(value);
        }
    }

    if (queryParts.length === 0) {
        // Find the existing user and return it if there's nothing to update
        const currentUser = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
        return currentUser.rows[0];
    }

    queryValues.push(userId);
    const query = `UPDATE users SET ${queryParts.join(', ')} WHERE id = $${index} RETURNING *`;

    const result = await pool.query(query, queryValues);
    return result.rows[0];
}

// **THIS IS THE MISSING FUNCTION**
async function updateUserFreeViews(userId, newViews) {
  await pool.query("UPDATE users SET free_views = $1 WHERE id = $2", [newViews, userId]);
}


module.exports = {
  createUser,
  findUserByEmail,
  findUserByUsername,
  findUserByEmailOrUsername,
  findUserByMobile,
  findUserById,
  updateUserPassword,
  updateUserLastLogin,
  verifyUser,
  findUserByVerificationToken,
  updateUserProfile,
  updateUserFreeViews,
};
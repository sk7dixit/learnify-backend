// hash_temp.js - RUN THIS LOCALLY ONLY
const bcrypt = require('bcrypt');

// ⚠️ IMPORTANT: CHANGE THIS to a secure password you will use for your Admin account.
const newPassword = 'Khushboo@19';

bcrypt.hash(newPassword, 10)
  .then(hash => {
    console.log("---------------------------------------");
    console.log("1. New Password: " + newPassword);
    console.log("2. NEW HASH TO COPY (Paste into SQL UPDATE):");
    console.log(hash);
    console.log("---------------------------------------");
  })
  .catch(err => console.error(err));
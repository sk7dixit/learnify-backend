const fs = require('fs');
const path = require('path');

const envContent = `PORT=5000
DB_USER=postgres
DB_HOST=localhost
DB_NAME=smart_notes
DB_PASS=8585
DB_PORT=5432
# DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
MULTI_UPLOAD_MAX_FILES=10
MULTI_UPLOAD_MAX_FILESIZE=20971520
CLOUDINARY_CLOUD_NAME=demo
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=abcdefghijklmnopqrstuvwxyz
SENDGRID_API_KEY=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
`;

fs.writeFileSync(path.join(__dirname, '.env'), envContent);
console.log('.env fixed');

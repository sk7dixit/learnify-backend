const axios = require('axios');

const verify = async () => {
    try {
        const res = await axios.post('http://localhost:5000/api/users/verify-email-otp', {
            email: "testuser3@example.com",
            otp: "913480"
        });
        console.log("Verification successful:", res.data);
    } catch (error) {
        console.error("Verification failed:", error.response ? error.response.data : error.message);
    }
};

verify();

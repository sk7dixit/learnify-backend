const axios = require('axios');

const register = async () => {
    try {
        const res = await axios.post('http://localhost:5000/api/users/register', {
            name: "Test User 3",
            username: "testuser3",
            email: "testuser3@example.com",
            password: "Password123!",
            mobileNumber: "9876543210"
        });
        console.log("Registration successful:", res.data);
    } catch (error) {
        console.error("Registration failed:", error.response ? error.response.data : error.message);
    }
};

register();

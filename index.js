const express = require('express');
const cors = require('cors');
const pool = require('./db');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT;

app.use(cors());
app.use(express.json());

// Test endpoint
app.get('/api/health', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT 1 + 1 AS result');
        res.json({ status: 'OK', message: 'Database connected!', result: rows[0].result });
    } catch (error) {
        console.error('Database connection error:', error);
        res.status(500).json({ status: 'Error', message: 'Database connection failed', error: error.message });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ status: 'Error', message: 'Email and password are required' });
    }

    try {
        const [rows] = await pool.query('SELECT * FROM staff WHERE email = ?', [email]);

        if (rows.length === 0) {
            return res.status(401).json({ status: 'Error', message: 'Invalid email or password' });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ status: 'Error', message: 'Invalid email or password' });
        }

        // Return user data (excluding sensitive password)
        const { password: _, ...userData } = user;
        res.json({ status: 'OK', message: 'Login successful', user: userData });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ status: 'Error', message: 'An error occurred during login', error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

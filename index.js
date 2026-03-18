const express = require('express');
const cors = require('cors');
const pool = require('./db');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

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

// Save Exam Configuration
app.post('/api/exam-configurations', async (req, res) => {
    const { class_id, weights, remarks, gradingScale } = req.body;

    if (!class_id || !weights || !remarks || !gradingScale) {
        return res.status(400).json({ status: 'Error', message: 'Missing required configuration data' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Insert or update the master configuration
        const [configResult] = await connection.query(
            'INSERT INTO exam_configurations (class_id) VALUES (?) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP',
            [class_id]
        );
        
        let configId;
        if (configResult.insertId) {
            configId = configResult.insertId;
        } else {
            const [rows] = await connection.query('SELECT id FROM exam_configurations WHERE class_id = ?', [class_id]);
            configId = rows[0].id;
        }

        // 2. Clear old sub-data
        await connection.query('DELETE FROM assessment_weights WHERE config_id = ?', [configId]);
        await connection.query('DELETE FROM grade_remarks WHERE config_id = ?', [configId]);
        await connection.query('DELETE FROM grading_scales WHERE config_id = ?', [configId]);

        // 3. Insert new weights
        const weightValues = weights.map(w => [configId, w.name, w.value]);
        await connection.query('INSERT INTO assessment_weights (config_id, name, weight_percent) VALUES ?', [weightValues]);

        // 4. Insert new remarks
        const remarkValues = remarks.map(r => [configId, r.grade, r.text]);
        await connection.query('INSERT INTO grade_remarks (config_id, grade, remark_text) VALUES ?', [remarkValues]);

        // 5. Insert new grading scales
        const scaleValues = gradingScale.map(s => [configId, s.label, s.min, s.max]);
        await connection.query('INSERT INTO grading_scales (config_id, grade, min_score, max_score) VALUES ?', [scaleValues]);

        await connection.commit();
        res.json({ status: 'OK', message: 'Configuration saved successfully', configId });
    } catch (error) {
        await connection.rollback();
        console.error('Error saving configuration:', error);
        res.status(500).json({ status: 'Error', message: 'Failed to save configuration', error: error.message });
    } finally {
        connection.release();
    }
});

// Get all exam configurations with class names
app.get('/api/exam-configurations', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT ec.*, c.class as class_name 
            FROM exam_configurations ec
            JOIN classes c ON ec.class_id = c.id
            ORDER BY c.class ASC
        `);
        res.json({ status: 'OK', configurations: rows });
    } catch (error) {
        console.error('Error fetching configurations:', error);
        res.status(500).json({ status: 'Error', message: 'Failed to fetch configurations', error: error.message });
    }
});

// Get a single exam configuration with all its details
app.get('/api/exam-configurations/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [configs] = await pool.query(`
            SELECT ec.*, c.class as class_name 
            FROM exam_configurations ec
            JOIN classes c ON ec.class_id = c.id
            WHERE ec.id = ?
        `, [id]);

        if (configs.length === 0) {
            return res.status(404).json({ status: 'Error', message: 'Configuration not found' });
        }

        const config = configs[0];

        // Fetch associated details
        const [weights] = await pool.query('SELECT id, config_id, name, weight_percent as value FROM assessment_weights WHERE config_id = ?', [id]);
        const [remarks] = await pool.query('SELECT config_id, grade, remark_text as text FROM grade_remarks WHERE config_id = ?', [id]);
        const [scales] = await pool.query('SELECT config_id, grade as label, min_score as min, max_score as max FROM grading_scales WHERE config_id = ?', [id]);

        res.json({
            status: 'OK',
            configuration: {
                ...config,
                assessment_weights: weights,
                grade_remarks: remarks,
                grading_scales: scales
            }
        });
    } catch (error) {
        console.error('Error fetching configuration details:', error);
        res.status(500).json({ status: 'Error', message: 'Failed to fetch configuration details', error: error.message });
    }
});

// Get all subjects
app.get('/api/subjects', async (req, res) => {
    try {
        const { search } = req.query;
        let query = 'SELECT * FROM subjects WHERE 1=1';
        let params = [];

        if (search) {
            query += ' AND (name LIKE ? OR code LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY name ASC';
        
        const [rows] = await pool.query(query, params);
        res.json({ status: 'OK', subjects: rows });
    } catch (error) {
        console.error('Error fetching subjects:', error);
        res.status(500).json({ status: 'Error', message: 'Failed to fetch subjects', error: error.message });
    }
});

// Get subjects assigned to a configuration
app.get('/api/exam-config-subjects/:configId', async (req, res) => {
    const { configId } = req.params;
    try {
        const [rows] = await pool.query(`
            SELECT s.* 
            FROM subjects s
            JOIN exam_config_subjects ecs ON s.id = ecs.subject_id
            WHERE ecs.config_id = ?
            ORDER BY s.name ASC
        `, [configId]);
        res.json({ status: 'OK', subjects: rows });
    } catch (error) {
        console.error('Error fetching assigned subjects:', error);
        res.status(500).json({ status: 'Error', message: 'Failed to fetch assigned subjects', error: error.message });
    }
});

// Assign a subject to a configuration
app.post('/api/exam-config-subjects', async (req, res) => {
    const { configId, subjectId } = req.body;
    if (!configId || !subjectId) {
        return res.status(400).json({ status: 'Error', message: 'configId and subjectId are required' });
    }
    try {
        await pool.query('INSERT IGNORE INTO exam_config_subjects (config_id, subject_id) VALUES (?, ?)', [configId, subjectId]);
        res.json({ status: 'OK', message: 'Subject assigned successfully' });
    } catch (error) {
        console.error('Error assigning subject:', error);
        res.status(500).json({ status: 'Error', message: 'Failed to assign subject', error: error.message });
    }
});

// Unassign a subject from a configuration
app.delete('/api/exam-config-subjects/:configId/:subjectId', async (req, res) => {
    const { configId, subjectId } = req.params;
    try {
        await pool.query('DELETE FROM exam_config_subjects WHERE config_id = ? AND subject_id = ?', [configId, subjectId]);
        res.json({ status: 'OK', message: 'Subject unassigned successfully' });
    } catch (error) {
        console.error('Error unassigning subject:', error);
        res.status(500).json({ status: 'Error', message: 'Failed to unassign subject', error: error.message });
    }
});

// Get all classes
app.get('/api/classes', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM classes ORDER BY class ASC');
        res.json({ status: 'OK', classes: rows });
    } catch (error) {
        console.error('Error fetching classes:', error);
        res.status(500).json({ status: 'Error', message: 'Failed to fetch classes', error: error.message });
    }
});
// Get students in a class
app.get('/api/class-students/:classId', async (req, res) => {
    const { classId } = req.params;
    try {
        const [rows] = await pool.query(`
            SELECT 
                s.id, 
                s.firstname, 
                s.middlename, 
                s.lastname,
                CONCAT(s.firstname, ' ', IFNULL(s.middlename, ''), ' ', IFNULL(s.lastname, '')) as fullname,
                s.admission_no,
                ss.id as student_session_id
            FROM students s
            JOIN student_session ss ON s.id = ss.student_id
            WHERE ss.class_id = ? AND s.is_active = 'yes'
            ORDER BY s.firstname ASC
        `, [classId]);
        res.json({ status: 'OK', students: rows });
    } catch (error) {
        console.error('Error fetching class students:', error);
        res.status(500).json({ status: 'Error', message: 'Failed to fetch class students', error: error.message });
    }
});

// Get existing scores for a configuration and subject
app.get('/api/student-subject-scores/:configId/:subjectId', async (req, res) => {
    const { configId, subjectId } = req.params;
    try {
        const [rows] = await pool.query(`
            SELECT * FROM student_subject_scores 
            WHERE config_id = ? AND subject_id = ?
        `, [configId, subjectId]);
        res.json({ status: 'OK', scores: rows });
    } catch (error) {
        console.error('Error fetching student scores:', error);
        res.status(500).json({ status: 'Error', message: 'Failed to fetch student scores', error: error.message });
    }
});

// Batch save/update student scores
app.post('/api/student-subject-scores', async (req, res) => {
    const { scores } = req.body; // Array of { student_id, config_id, subject_id, weight_id, score }
    
    if (!Array.isArray(scores) || scores.length === 0) {
        return res.status(400).json({ status: 'Error', message: 'Scores array is required' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const query = `
            INSERT INTO student_subject_scores (student_id, config_id, subject_id, weight_id, score)
            VALUES ?
            ON DUPLICATE KEY UPDATE score = VALUES(score), updated_at = CURRENT_TIMESTAMP
        `;

        const values = scores.map(s => [s.student_id, s.config_id, s.subject_id, s.weight_id, s.score]);
        
        await connection.query(query, [values]);
        
        await connection.commit();
        res.json({ status: 'OK', message: 'Scores saved successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error saving student scores:', error);
        res.status(500).json({ status: 'Error', message: 'Failed to save student scores', error: error.message });
    } finally {
        connection.release();
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

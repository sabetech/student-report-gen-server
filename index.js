const express = require('express');
const cors = require('cors');
const pool = require('./db');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const ftp = require('basic-ftp');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT;

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// --- School Info & Logo Upload ---

// Get school info
app.get('/api/school-info', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM srg_school_info WHERE id = 1');
        if (rows.length === 0) {
            return res.status(404).json({ status: 'Error', message: 'School info not found' });
        }
        res.json({ status: 'OK', schoolInfo: rows[0] });
    } catch (error) {
        console.error('Error fetching school info:', error);
        res.status(500).json({ status: 'Error', message: 'Failed to fetch school info' });
    }
});

// Update school info
app.post('/api/school-info', async (req, res) => {
    const { name, contact_numbers, post_address, email, website, logo_url } = req.body;
    try {
        await pool.query(`
            UPDATE srg_school_info 
            SET name = ?, contact_numbers = ?, post_address = ?, email = ?, website = ?, logo_url = ?
            WHERE id = 1
        `, [name, contact_numbers, post_address, email, website, logo_url]);
        res.json({ status: 'OK', message: 'School information updated successfully' });
    } catch (error) {
        console.error('Error updating school info:', error);
        res.status(500).json({ status: 'Error', message: 'Failed to update school info' });
    }
});

// Upload logo to FTP
app.post('/api/upload-logo', upload.single('logo'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ status: 'Error', message: 'No file uploaded' });
    }

    const client = new ftp.Client();
    client.ftp.verbose = true;

    const fileName = `logo_${Date.now()}${path.extname(req.file.originalname)}`;

    try {
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASS,
            secure: false
        });

        console.log("FTP connected. Current directory:", await client.pwd());

        // Use a relative path starting from the FTP root.
        // Based on user request, it should go to uploads/resultgen
        const uploadDir = 'uploads/resultgen';
        await client.ensureDir(uploadDir);

        console.log("Directory ensured. Current directory:", await client.pwd());

        // Upload from buffer
        const bufferStream = new require('stream').PassThrough();
        bufferStream.end(req.file.buffer);

        await client.uploadFrom(bufferStream, fileName);

        const publicUrl = `${process.env.FTP_BASE_URL}/uploads/resultgen/${fileName}`;

        res.json({
            status: 'OK',
            message: 'Logo uploaded successfully',
            url: publicUrl
        });
    } catch (err) {
        console.error('FTP Upload Error:', err);
        res.status(500).json({
            status: 'Error',
            message: 'Failed to upload logo to server',
            error: err.message
        });
    } finally {
        client.close();
    }
});

// --- Result Generation Validation ---

// Validate if all students have all subject scores for a config
app.get('/api/exam-config-validation/:configId', async (req, res) => {
    const { configId } = req.params;
    try {
        // 1. Get the configuration (class_id)
        const [configs] = await pool.query('SELECT class_id FROM srg_exam_configurations WHERE id = ?', [configId]);
        if (configs.length === 0) {
            return res.status(404).json({ status: 'Error', message: 'Configuration not found' });
        }
        const classId = configs[0].class_id;

        // 2. Get all students in that class
        const [students] = await pool.query(`
            SELECT s.id, CONCAT(s.firstname, ' ', IFNULL(s.middlename, ''), ' ', IFNULL(s.lastname, '')) as fullname, s.admission_no
            FROM students s
            JOIN student_session ss ON s.id = ss.student_id
            WHERE ss.class_id = ? AND s.is_active = 'yes'
            ORDER BY s.firstname ASC
        `, [classId]);

        // 3. Get all subjects assigned to this config
        const [subjects] = await pool.query(`
            SELECT s.id, s.name 
            FROM subjects s
            JOIN srg_exam_config_subjects ecs ON s.id = ecs.subject_id
            WHERE ecs.config_id = ?
            ORDER BY s.name ASC
        `, [configId]);

        // 4. Get all scores for this config
        const [scores] = await pool.query('SELECT student_id, subject_id FROM srg_student_subject_scores WHERE config_id = ?', [configId]);
        
        // 5. Cross-reference to find missing data
        const validationResults = [];
        
        for (const student of students) {
            const missingSubjects = [];
            for (const subject of subjects) {
                const hasScore = scores.some(s => s.student_id === student.id && s.subject_id === subject.id);
                if (!hasScore) {
                    missingSubjects.push(subject.name);
                }
            }
            if (missingSubjects.length > 0) {
                validationResults.push({
                    studentId: student.id,
                    studentName: student.fullname,
                    admissionNo: student.admission_no,
                    missingSubjects: missingSubjects
                });
            }
        }

        res.json({ 
            status: 'OK', 
            totalStudents: students.length,
            missingCount: validationResults.length,
            validation: validationResults 
        });

    } catch (error) {
        console.error('Validation error:', error);
        res.status(500).json({ status: 'Error', message: 'Failed to perform validation', error: error.message });
    }
});

// --- Report Data Consolidation ---

// Get all data needed for report generation for a specific config
app.get('/api/report-data/:configId', async (req, res) => {
    const { configId } = req.params;
    try {
        // 1. Get school info
        const [schoolInfo] = await pool.query('SELECT * FROM srg_school_info LIMIT 1');

        // 2. Get full configuration
        const [configs] = await pool.query('SELECT * FROM srg_exam_configurations WHERE id = ?', [configId]);
        if (configs.length === 0) return res.status(404).json({ status: 'Error', message: 'Config not found' });
        const config = configs[0];

        // 3. Get assigned subjects
        const [subjects] = await pool.query(`
            SELECT s.id, s.name 
            FROM subjects s
            JOIN srg_exam_config_subjects ecs ON s.id = ecs.subject_id
            WHERE ecs.config_id = ?
            ORDER BY s.name ASC
        `, [configId]);

        // 4. Get students in the class
        const [students] = await pool.query(`
            SELECT s.id, s.firstname, s.middlename, s.lastname, s.admission_no
            FROM students s
            JOIN student_session ss ON s.id = ss.student_id
            WHERE ss.class_id = ? AND s.is_active = 'yes'
            ORDER BY s.firstname ASC
        `, [config.class_id]);

        // 5. Get all scores and weights
        const [weights] = await pool.query('SELECT * FROM srg_assessment_weights WHERE config_id = ?', [configId]);
        const [scores] = await pool.query('SELECT * FROM srg_student_subject_scores WHERE config_id = ?', [configId]);

        // 6. Process data per student
        if (students.length > 0) console.log('DEBUG Raw First Row Keys:', Object.keys(students[0]));
        
        const studentReports = students.map(student => {
            const studentScores = subjects.map(subject => {
                const subjectScores = scores.filter(s => s.student_id === student.id && s.subject_id === subject.id);
                
                // Calculate weighted total for this subject
                let totalScore = 0;
                const weightBreakdown = weights.map(w => {
                    const scoreEntry = subjectScores.find(s => s.weight_id === w.id);
                    const rawScore = scoreEntry ? scoreEntry.score : 0;
                    const weightedValue = (rawScore / (w.max_score || 100)) * w.weight_percent;
                    totalScore += weightedValue;
                    return { 
                        weightName: w.name, 
                        weightPercent: w.weight_percent,
                        rawScore: rawScore,
                        weightedValue: weightedValue.toFixed(2)
                    };
                });

                return {
                    id: subject.id,
                    name: subject.name,
                    weights: weightBreakdown,
                    total: parseFloat(totalScore.toFixed(2))
                };
            });

            const overallTotal = studentScores.reduce((sum, s) => sum + s.total, 0);
            const overallAverage = studentScores.length > 0 ? (overallTotal / studentScores.length).toFixed(2) : 0;

            const fullName = [student.firstname, student.middlename, student.lastname]
                .map(part => part ? part.toString().trim() : '')
                .filter(part => part !== '')
                .join(' ');
            
            return {
                id: student.id,
                name: fullName || 'Unknown Student',
                admissionNo: student.admission_no || 'N/A',
                subjects: studentScores,
                overallTotal: parseFloat(overallTotal.toFixed(2)),
                overallAverage: parseFloat(overallAverage)
            };
        });

        // 7. Calculate Ranks (Position in Class) based on overallTotal
        const sortedByTotal = [...studentReports].sort((a, b) => b.overallTotal - a.overallTotal);
        studentReports.forEach(report => {
            report.position = sortedByTotal.findIndex(s => s.id === report.id) + 1;
        });

        res.json({
            status: 'OK',
            school: schoolInfo[0] || {},
            config: config,
            students: studentReports,
            totalStudents: students.length,
            subjectsCount: subjects.length
        });

    } catch (error) {
        console.error('Report data error:', error);
        res.status(500).json({ status: 'Error', message: 'Failed to fetch report data', error: error.message });
    }
});

// --- Existing Endpoints ---

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
    const { class_id, weights, remarks, gradingScale, id: configId } = req.body;

    if (!class_id || !weights || !remarks || !gradingScale) {
        return res.status(400).json({ status: 'Error', message: 'Missing required configuration data' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        let finalConfigId = configId;
        let version = 1;

        if (!finalConfigId) {
            // Check for existing configs for this class to determine version
            const [existingConfigs] = await connection.query(
                'SELECT MAX(version) as maxVersion FROM srg_exam_configurations WHERE class_id = ?',
                [class_id]
            );
            if (existingConfigs[0].maxVersion) {
                version = existingConfigs[0].maxVersion + 1;
            }

            const [configResult] = await connection.query(
                'INSERT INTO srg_exam_configurations (class_id, version) VALUES (?, ?)',
                [class_id, version]
            );
            finalConfigId = configResult.insertId;
        } else {
            // Updating an existing specific version
            await connection.query(
                'UPDATE srg_exam_configurations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [finalConfigId]
            );
        }

        // 2. Clear old sub-data
        await connection.query('DELETE FROM srg_assessment_weights WHERE config_id = ?', [finalConfigId]);
        await connection.query('DELETE FROM srg_grade_remarks WHERE config_id = ?', [finalConfigId]);
        await connection.query('DELETE FROM srg_grading_scales WHERE config_id = ?', [finalConfigId]);

        // 3. Insert new weights
        const weightValues = weights.map(w => [finalConfigId, w.name, w.value]);
        await connection.query('INSERT INTO srg_assessment_weights (config_id, name, weight_percent) VALUES ?', [weightValues]);

        // 4. Insert new remarks
        const remarkValues = remarks.map(r => [finalConfigId, r.grade, r.text]);
        await connection.query('INSERT INTO srg_grade_remarks (config_id, grade, remark_text) VALUES ?', [remarkValues]);

        // 5. Insert new grading scales
        const scaleValues = gradingScale.map(s => [finalConfigId, s.label, s.min, s.max]);
        await connection.query('INSERT INTO srg_grading_scales (config_id, grade, min_score, max_score) VALUES ?', [scaleValues]);

        await connection.commit();
        res.json({ status: 'OK', message: 'Configuration saved successfully', configId: finalConfigId, version });
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
            FROM srg_exam_configurations ec
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
            FROM srg_exam_configurations ec
            JOIN classes c ON ec.class_id = c.id
            WHERE ec.id = ?
        `, [id]);

        if (configs.length === 0) {
            return res.status(404).json({ status: 'Error', message: 'Configuration not found' });
        }

        const config = configs[0];

        // Fetch associated details
        const [weights] = await pool.query('SELECT id, config_id, name, weight_percent as value FROM srg_assessment_weights WHERE config_id = ?', [id]);
        const [remarks] = await pool.query('SELECT config_id, grade, remark_text as text FROM srg_grade_remarks WHERE config_id = ?', [id]);
        const [scales] = await pool.query('SELECT config_id, grade as label, min_score as min, max_score as max FROM srg_grading_scales WHERE config_id = ?', [id]);

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
            JOIN srg_exam_config_subjects ecs ON s.id = ecs.subject_id
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
        await pool.query('INSERT IGNORE INTO srg_exam_config_subjects (config_id, subject_id) VALUES (?, ?)', [configId, subjectId]);
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
        await pool.query('DELETE FROM srg_exam_config_subjects WHERE config_id = ? AND subject_id = ?', [configId, subjectId]);
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
            SELECT * FROM srg_student_subject_scores 
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
            INSERT INTO srg_student_subject_scores (student_id, config_id, subject_id, weight_id, score)
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

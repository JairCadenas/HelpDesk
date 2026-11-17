require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// Configuración local de evidencias (reemplazable después por Amazon S3)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E5);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// 1. Inicio de sesión por perfil
app.post('/api/login', async (req, res) => {
    const { usuario, password } = req.body;
    try {
        const { rows } = await pool.query(
            'SELECT id, nombre, usuario, rol FROM usuarios WHERE usuario = $1 AND password = $2',
            [usuario, password]
        );
        if (rows.length === 0) return res.status(401).json({ error: 'Credenciales inválidas' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Consultar incidencias con filtros y restricción por rol
app.get('/api/incidencias', async (req, res) => {
    const { rol, userId, estado, categoria, prioridad } = req.query;
    try {
        let query = `
            SELECT i.*, u1.nombre AS solicitante_nombre, u2.nombre AS responsable_nombre
            FROM incidencias i
            JOIN usuarios u1 ON i.solicitante_id = u1.id
            LEFT JOIN usuarios u2 ON i.responsable_id = u2.id
            WHERE 1=1
        `;
        const params = [];
        let idx = 1;

        if (rol === 'solicitante') {
            query += ` AND i.solicitante_id = $${idx++}`;
            params.push(userId);
        }
        if (estado) {
            query += ` AND i.estado = $${idx++}`;
            params.push(estado);
        }
        if (categoria) {
            query += ` AND i.categoria = $${idx++}`;
            params.push(categoria);
        }
        if (prioridad) {
            query += ` AND i.prioridad = $${idx++}`;
            params.push(prioridad);
        }

        query += ' ORDER BY i.fecha_creacion DESC';
        const { rows: incidencias } = await pool.query(query, params);

        for (let inc of incidencias) {
            const { rows: segs } = await pool.query(
                `SELECT s.*, u.nombre AS autor FROM seguimientos s 
                 JOIN usuarios u ON s.usuario_id = u.id 
                 WHERE s.incidencia_id = $1 ORDER BY s.fecha_movimiento ASC`,
                [inc.id]
            );
            const { rows: evs } = await pool.query(
                'SELECT * FROM evidencias WHERE incidencia_id = $1',
                [inc.id]
            );
            inc.seguimientos = segs;
            inc.evidencias = evs;
        }

        res.json(incidencias);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Crear incidencia con folio único y evidencia opcional
app.post('/api/incidencias', upload.single('evidencia'), async (req, res) => {
    const { solicitante_id, asunto, descripcion, categoria, prioridad } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: countRows } = await client.query('SELECT COUNT(*)::int AS total FROM incidencias');
        const siguiente = String(countRows[0].total + 1).padStart(3, '0');
        const folio = `ESC-2026-${siguiente}`;

        const { rows: inserted } = await client.query(
            `INSERT INTO incidencias (folio, solicitante_id, asunto, descripcion, categoria, prioridad, estado) 
             VALUES ($1, $2, $3, $4, $5, $6, 'Abierto') RETURNING id`,
            [folio, solicitante_id, asunto, descripcion, categoria, prioridad]
        );
        const incidenciaId = inserted[0].id;

        await client.query(
            `INSERT INTO seguimientos (incidencia_id, usuario_id, comentario, estado_registrado) 
             VALUES ($1, $2, 'Incidencia registrada en el portal.', 'Abierto')`,
            [incidenciaId, solicitante_id]
        );

        if (req.file) {
            await client.query(
                'INSERT INTO evidencias (incidencia_id, nombre_archivo, ruta_archivo) VALUES ($1, $2, $3)',
                [incidenciaId, req.file.originalname, `/uploads/${req.file.filename}`]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ mensaje: 'Incidencia creada', folio });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// 4. Soporte: asignar responsable, cambiar estado y agregar seguimiento inmutable
app.post('/api/incidencias/:id/seguimiento', async (req, res) => {
    const { id } = req.params;
    const { responsable_id, estado, comentario } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            'UPDATE incidencias SET responsable_id = $1, estado = $2 WHERE id = $3',
            [responsable_id, estado, id]
        );

        await client.query(
            `INSERT INTO seguimientos (incidencia_id, usuario_id, comentario, estado_registrado) 
             VALUES ($1, $2, $3, $4)`,
            [id, responsable_id, comentario, estado]
        );

        await client.query('COMMIT');
        res.json({ mensaje: 'Seguimiento guardado correctamente' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Verificar conexión a BD al iniciar
pool.query('SELECT NOW()')
    .then(() => {
        console.log('Conexión exitosa a PostgreSQL.');
        app.listen(process.env.PORT || 3000, () => {
            console.log(`Servidor corriendo en http://localhost:${process.env.PORT || 3000}`);
        });
    })
    .catch(err => {
        console.error('Error conectando a PostgreSQL. Revisa tu archivo .env:', err.message);
    });
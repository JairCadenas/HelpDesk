require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

let S3Client, PutObjectCommand, GetObjectCommand;
try {
    ({ S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3'));
} catch (e) {
    // Si no está instalado en entorno local, continúa con almacenamiento en disco
}

const s3Client = (S3Client && process.env.S3_BUCKET_NAME)
    ? new S3Client({ region: process.env.AWS_REGION || 'us-east-1' })
    : null;

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Asegurar carpeta uploads local como respaldo si no hay S3
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads', { recursive: true });
}

// Servir evidencias (S3 o almacenamiento local como respaldo)
app.get('/uploads/:filename', async (req, res) => {
    const filename = path.basename(req.params.filename);
    if (s3Client && process.env.S3_BUCKET_NAME) {
        try {
            const command = new GetObjectCommand({
                Bucket: process.env.S3_BUCKET_NAME,
                Key: filename
            });
            const s3Response = await s3Client.send(command);
            if (s3Response.ContentType) {
                res.setHeader('Content-Type', s3Response.ContentType);
            }
            return s3Response.Body.pipe(res);
        } catch (err) {
            console.warn('Evidencia no disponible en S3, intentando en disco local:', err.message);
        }
    }
    
    const localPath = path.join(__dirname, 'uploads', filename);
    if (fs.existsSync(localPath)) {
        return res.sendFile(localPath);
    }
    res.status(404).send('Archivo no encontrado');
});

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: (process.env.DB_HOST && process.env.DB_HOST !== 'localhost' && process.env.DB_HOST !== '127.0.0.1')
        ? { rejectUnauthorized: false }
        : false
});

// Configuración de almacenamiento de evidencias (S3 o disco local)
const storage = (s3Client && process.env.S3_BUCKET_NAME)
    ? multer.memoryStorage()
    : multer.diskStorage({
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
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E5);
            const fileName = uniqueSuffix + path.extname(req.file.originalname);
            let rutaArchivo = `/uploads/${fileName}`;

            let s3Exitoso = false;
            if (s3Client && process.env.S3_BUCKET_NAME) {
                try {
                    await s3Client.send(new PutObjectCommand({
                        Bucket: process.env.S3_BUCKET_NAME,
                        Key: fileName,
                        Body: req.file.buffer,
                        ContentType: req.file.mimetype
                    }));
                    s3Exitoso = true;
                } catch (s3Err) {
                    console.warn(`Aviso: Error al subir evidencia a S3 (${s3Err.message}). Guardando en disco local como respaldo.`);
                }
            }

            // Si S3 no está configurado o falló (ej. bucket no creado en Learner Lab), guardar en disco local
            if (!s3Exitoso) {
                const localFilePath = path.join(__dirname, 'uploads', fileName);
                fs.writeFileSync(localFilePath, req.file.buffer);
            }

            await client.query(
                'INSERT INTO evidencias (incidencia_id, nombre_archivo, ruta_archivo) VALUES ($1, $2, $3)',
                [incidenciaId, req.file.originalname, rutaArchivo]
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

// Verificar conexión a BD e inicializar automáticamente esquema si es necesario
pool.query('SELECT NOW()')
    .then(async () => {
        console.log('Conexión exitosa a PostgreSQL con SSL.');

        try {
            const tableCheck = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'usuarios'");
            if (tableCheck.rows.length === 0) {
                console.log('Inicializando tablas de HelpDesk desde Tabla_Registros.sql...');
                const sqlPath = path.join(__dirname, 'Tabla_Registros.sql');
                if (fs.existsSync(sqlPath)) {
                    const sqlInit = fs.readFileSync(sqlPath, 'utf-8');
                    await pool.query(sqlInit);
                    console.log('Tablas y datos iniciales creados correctamente en la base de datos.');
                }
            } else {
                console.log('Las tablas de HelpDesk ya están presentes en la base de datos.');
            }
        } catch (dbInitErr) {
            console.warn('Aviso al verificar tablas:', dbInitErr.message);
        }

        // Verificar disponibilidad de bucket S3 si está configurado
        if (s3Client && process.env.S3_BUCKET_NAME) {
            const { HeadBucketCommand } = require('@aws-sdk/client-s3');
            s3Client.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET_NAME }))
                .then(() => console.log(`Bucket S3 '${process.env.S3_BUCKET_NAME}' verificado y disponible.`))
                .catch((err) => {
                    console.warn(`[AVISO S3] El bucket '${process.env.S3_BUCKET_NAME}' no está disponible (${err.message}). En AWS Learner Lab debes crearlo manualmente desde la consola S3 (us-east-1). Mientras tanto, el sistema utilizará almacenamiento local en disco como respaldo automático.`);
                });
        }

        app.listen(process.env.PORT || 3000, () => {
            console.log(`Servidor corriendo en http://localhost:${process.env.PORT || 3000}`);
        });
    })
    .catch(err => {
        console.error('Error conectando a PostgreSQL. Revisa tu archivo .env:', err.message);
    });
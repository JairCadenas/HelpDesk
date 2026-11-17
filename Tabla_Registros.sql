CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    usuario VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    rol VARCHAR(20) NOT NULL CHECK (rol IN ('solicitante', 'soporte'))
);

CREATE TABLE incidencias (
    id SERIAL PRIMARY KEY,
    folio VARCHAR(25) UNIQUE NOT NULL,
    solicitante_id INT NOT NULL REFERENCES usuarios(id),
    responsable_id INT NULL REFERENCES usuarios(id),
    asunto VARCHAR(150) NOT NULL,
    descripcion TEXT NOT NULL,
    categoria VARCHAR(50) NOT NULL,
    prioridad VARCHAR(20) NOT NULL CHECK (prioridad IN ('Baja', 'Media', 'Alta')),
    estado VARCHAR(20) DEFAULT 'Abierto' CHECK (estado IN ('Abierto', 'En atención', 'Resuelto')),
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE seguimientos (
    id SERIAL PRIMARY KEY,
    incidencia_id INT NOT NULL REFERENCES incidencias(id),
    usuario_id INT NOT NULL REFERENCES usuarios(id),
    comentario TEXT NOT NULL,
    estado_registrado VARCHAR(20) NOT NULL CHECK (estado_registrado IN ('Abierto', 'En atención', 'Resuelto')),
    fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE evidencias (
    id SERIAL PRIMARY KEY,
    incidencia_id INT NOT NULL REFERENCES incidencias(id),
    nombre_archivo VARCHAR(255) NOT NULL,
    ruta_archivo VARCHAR(255) NOT NULL,
    fecha_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Usuarios mínimos de prueba
INSERT INTO usuarios (nombre, usuario, password, rol) VALUES
('Prof. Ana López (Solicitante A)', 'solicitante1', '1234', 'solicitante'),
('Prof. Carlos Ruiz (Solicitante B)', 'solicitante2', '1234', 'solicitante'),
('Ing. Luis Mendoza (Soporte)', 'soporte1', '1234', 'soporte');

-- 5 incidencias de categorías distintas
INSERT INTO incidencias (folio, solicitante_id, responsable_id, asunto, descripcion, categoria, prioridad, estado) VALUES
('ESC-2026-001', 1, NULL, 'Proyector sin imagen en Aula 104', 'Enciende el foco pero no proyecta señal de video.', 'Proyectores', 'Alta', 'Abierto'),
('ESC-2026-002', 2, 3, 'Cable HDMI dañado en Lab. Cómputo', 'El conector está doblado y hace falso contacto.', 'Cables', 'Media', 'En atención'),
('ESC-2026-003', 1, NULL, 'Cámara de pasillo Edificio B desconectada', 'No aparece imagen en el monitor de vigilancia.', 'Cámaras', 'Alta', 'Abierto'),
('ESC-2026-004', 2, 3, 'Dos mesas en mal estado en Salón 201', 'Tienen las patas sueltas y riesgo de caerse.', 'Mobiliario', 'Baja', 'Resuelto'),
('ESC-2026-005', 1, NULL, 'Contacto eléctrico sin corriente en Sala Maestros', 'No encienden las laptops conectadas a la pared.', 'Eléctrico', 'Media', 'Abierto');

-- Historial inicial inmutable
INSERT INTO seguimientos (incidencia_id, usuario_id, comentario, estado_registrado) VALUES
(1, 1, 'Reporte levantado por el solicitante.', 'Abierto'),
(2, 2, 'Reporte levantado por el solicitante.', 'Abierto'),
(2, 3, 'Se revisa puerto y se solicita repuesto de cable HDMI de 3m.', 'En atención'),
(3, 1, 'Reporte levantado por el solicitante.', 'Abierto'),
(4, 2, 'Reporte levantado por el solicitante.', 'Abierto'),
(4, 3, 'Se apretaron tornillos y se reforzó estructura de ambas mesas.', 'Resuelto'),
(5, 1, 'Reporte levantado por el solicitante.', 'Abierto');

-- 2 evidencias ficticias
INSERT INTO evidencias (incidencia_id, nombre_archivo, ruta_archivo) VALUES
(1, 'falla_proyector.jpg', '/uploads/falla_proyector.jpg'),
(2, 'cable_hdmi_roto.jpg', '/uploads/cable_hdmi_roto.jpg');
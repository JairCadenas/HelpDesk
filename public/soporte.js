const user = protegerRuta('soporte');

if (user) {
    cargarBandeja();
}

async function cargarBandeja() {
    const params = new URLSearchParams({
        rol: 'soporte',
        userId: user.id,
        estado: document.getElementById('filtro-estado').value,
        categoria: document.getElementById('filtro-categoria').value,
        prioridad: document.getElementById('filtro-prioridad').value
    });

    const res = await fetch(`/api/incidencias?${params.toString()}`);
    const incidencias = await res.json();

    // Actualizar contadores
    document.getElementById('count-abierto').innerText = incidencias.filter(i => i.estado === 'Abierto').length;
    document.getElementById('count-atencion').innerText = incidencias.filter(i => i.estado === 'En atención').length;
    document.getElementById('count-resuelto').innerText = incidencias.filter(i => i.estado === 'Resuelto').length;

    const container = document.getElementById('bandeja-tickets');
    container.innerHTML = '';

    if (incidencias.length === 0) {
        container.innerHTML = '<p style="color: var(--muted);">No se encontraron incidencias con esos filtros.</p>';
        return;
    }

    incidencias.forEach(inc => {
        const evidencias = inc.evidencias.length > 0
            ? inc.evidencias.map(ev => `<a href="${ev.ruta_archivo}" target="_blank">📎 ${ev.nombre_archivo}</a>`).join(' | ')
            : 'Sin archivos adjuntos';

        const historial = inc.seguimientos.map(s => `
            <div class="timeline-item">
                <b>[${new Date(s.fecha_movimiento).toLocaleString()}]</b> (${s.estado_registrado}) — <i>${s.autor}:</i> ${s.comentario}
            </div>
        `).join('');

        container.innerHTML += `
            <div class="ticket">
                <div class="ticket-header">
                    <strong>${inc.folio} — ${inc.asunto}</strong>
                    <span class="badge ${inc.estado.split(' ')[0]}">${inc.estado}</span>
                </div>
                <p>${inc.descripcion}</p>
                <div class="ticket-meta">
                    <b>Categoría:</b> ${inc.categoria} | <b>Prioridad:</b> ${inc.prioridad} | 
                    <b>Reportó:</b> ${inc.solicitante_nombre} | 
                    <b>Responsable:</b> ${inc.responsable_nombre || 'Sin asignar'} | 
                    <b>Fecha:</b> ${new Date(inc.fecha_creacion).toLocaleString()}
                </div>
                <div style="font-size: 0.88rem;"><strong>Evidencia:</strong> ${evidencias}</div>
                
                <div class="timeline">
                    <strong>Bitácora inmutable de movimientos:</strong>
                    ${historial}
                </div>

                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border); display: flex; gap: 8px; flex-wrap: wrap;">
                    <select id="estado-${inc.id}" style="width: auto;">
                        <option value="Abierto" ${inc.estado === 'Abierto' ? 'selected' : ''}>Abierto</option>
                        <option value="En atención" ${inc.estado === 'En atención' ? 'selected' : ''}>En atención</option>
                        <option value="Resuelto" ${inc.estado === 'Resuelto' ? 'selected' : ''}>Resuelto</option>
                    </select>
                    <input type="text" id="comentario-${inc.id}" placeholder="Escribe diagnóstico o seguimiento..." style="flex: 1; min-width: 220px;">
                    <button onclick="actualizarFolio(${inc.id})" class="btn btn-sm">Asignarme y Guardar</button>
                </div>
            </div>
        `;
    });
}

async function actualizarFolio(id) {
    const estado = document.getElementById(`estado-${id}`).value;
    const comentario = document.getElementById(`comentario-${id}`).value;
    if (!comentario.trim()) return alert('Debes escribir un comentario de seguimiento.');

    const res = await fetch(`/api/incidencias/${id}/seguimiento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            responsable_id: user.id,
            estado,
            comentario
        })
    });

    if (res.ok) cargarBandeja();
}
const user = protegerRuta('solicitante');

if (user) {
    cargarMisFolios();

    document.getElementById('ticket-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append('solicitante_id', user.id);
        formData.append('asunto', document.getElementById('asunto').value);
        formData.append('categoria', document.getElementById('categoria').value);
        formData.append('prioridad', document.getElementById('prioridad').value);
        formData.append('descripcion', document.getElementById('descripcion').value);

        const archivo = document.getElementById('evidencia').files[0];
        if (archivo) formData.append('evidencia', archivo);

        const res = await fetch('/api/incidencias', { method: 'POST', body: formData });
        const data = await res.json();

        if (res.ok) {
            alert(`¡Reporte registrado! Tu folio único es: ${data.folio}`);
            document.getElementById('ticket-form').reset();
            cargarMisFolios();
        } else {
            alert('Error: ' + data.error);
        }
    });
}

async function cargarMisFolios() {
    const params = new URLSearchParams({
        rol: 'solicitante',
        userId: user.id,
        estado: document.getElementById('filtro-estado').value
    });

    const res = await fetch(`/api/incidencias?${params.toString()}`);
    const folios = await res.json();
    const container = document.getElementById('mis-tickets');
    container.innerHTML = '';

    if (folios.length === 0) {
        container.innerHTML = '<p style="color: var(--muted);">Aún no tienes reportes en esta categoría.</p>';
        return;
    }

    folios.forEach(inc => {
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
                    <b>Técnico asignado:</b> ${inc.responsable_nombre || 'Pendiente de asignación'} | 
                    <b>Fecha:</b> ${new Date(inc.fecha_creacion).toLocaleString()}
                </div>
                <div style="font-size: 0.88rem;"><strong>Evidencia:</strong> ${evidencias}</div>
                <div class="timeline">
                    <strong>Historial de atención:</strong>
                    ${historial}
                </div>
            </div>
        `;
    });
}
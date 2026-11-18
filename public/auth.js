function obtenerUsuario() {
    return JSON.parse(localStorage.getItem('helpdesk_user'));
}

function protegerRuta(rolRequerido) {
    const user = obtenerUsuario();
    if (!user) {
        window.location.href = 'login.html';
        return null;
    }
    if (user.rol !== rolRequerido) {
        window.location.href = user.rol === 'soporte' ? 'soporte.html' : 'solicitante.html';
        return null;
    }
    const infoEl = document.getElementById('user-info');
    if (infoEl) infoEl.innerHTML = `<strong>${user.nombre}</strong> (${user.rol})`;
    return user;
}

function cerrarSesion() {
    localStorage.removeItem('helpdesk_user');
    window.location.href = 'index.html';
}

// Lógica exclusiva de login.html
const loginForm = document.getElementById('login-form');
if (loginForm) {
    const yaLogueado = obtenerUsuario();
    if (yaLogueado) {
        window.location.href = yaLogueado.rol === 'soporte' ? 'soporte.html' : 'solicitante.html';
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const usuario = document.getElementById('usuario').value.trim();
        const password = document.getElementById('password').value;

        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario, password })
        });

        if (!res.ok) return alert('Usuario o contraseña incorrectos.');

        const user = await res.json();
        localStorage.setItem('helpdesk_user', JSON.stringify(user));
        window.location.href = user.rol === 'soporte' ? 'soporte.html' : 'solicitante.html';
    });
}
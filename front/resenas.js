/* =====================================================
   MÓDULO RESEÑAS (frontend).
   Parte pública (sitio): carrusel de reseñas aprobadas y formulario de
   alta en 2 pasos (verifica CL-XXXX/teléfono y luego pide la reseña).
   Parte admin (/admin): badge de pendientes y moderación.
   Cada parte se inicializa según la ruta.
   ===================================================== */
(() => {
    const API_BASE = "";
    const EN_ADMIN = window.location.pathname === "/admin";

    /* ---------- Helpers ---------- */
    function $(id) { return document.getElementById(id); }

    function esc(s) {
        return String(s == null ? "" : s)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    function iniciales(nombre) {
        const partes = String(nombre || "").trim().split(/\s+/).filter(Boolean);
        if (!partes.length) return "?";
        return partes.slice(0, 2).map((p) => p[0].toUpperCase()).join("");
    }

    function fmtFecha(f) {
        if (!f) return "—";
        const d = new Date(f);
        if (isNaN(d.getTime())) return String(f);
        return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
    }

    function toast(msg, kind) {
        const t = document.getElementById("toast");
        if (!t) return;
        const m = t.querySelector(".toast-msg");
        if (m) m.textContent = msg;
        t.classList.remove("success", "error");
        t.classList.add("show", kind === "error" ? "error" : "success");
        clearTimeout(toast._t);
        toast._t = setTimeout(() => t.classList.remove("show"), 3500);
    }

    function mostrarMsg(el, msg) {
        if (!el) return;
        el.textContent = msg;
        el.hidden = false;
    }

    // Meta legible de una reseña: usa el campo precomputado (fallback) o
    // arma colonia · tipo a partir de los campos de la DB.
    function metaDe(r) {
        if (r.meta) return r.meta;
        const m = [];
        if (r.colonia) m.push(r.colonia);
        if (r.tipo_servicio_label) m.push(r.tipo_servicio_label);
        return m.join(" · ");
    }

    // Card de reseña (mismo markup que las testimoniales del sitio).
    function cardResena(r) {
        const metaTxt = metaDe(r);
        return `
            <article class="testimonial">
                <div class="quote-mark">&ldquo;</div>
                <p class="testimonial-text">${esc(r.texto)}</p>
                <div class="testimonial-author">
                    <div class="author-avatar">${esc(r.iniciales || iniciales(r.nombre_display))}</div>
                    <div>
                        <div class="author-name">${esc(r.nombre_display)}</div>
                        ${metaTxt ? `<div class="author-meta">${esc(metaTxt)}</div>` : ""}
                    </div>
                </div>
            </article>
        `;
    }

    /* =================================================
       PARTE PÚBLICA: carrusel y formulario de alta
       ================================================= */

    // ----- Estado del carrusel -----
    const mq = window.matchMedia("(min-width: 768px)");
    let carItems = [];        // reseñas mostradas
    let carIndex = 0;         // posición actual
    let carVisible = 3;       // slides visibles (3 desktop / 1 mobile)
    let carMax = 0;           // índice máximo
    let carActivo = false;    // controles activos (solo si hay > 3 reseñas)
    let autoTimer = null;     // intervalo de auto-avance
    let resumeTimer = null;   // timeout para reanudar tras interacción

    function initPublico() {
        if (!$("carruselTrack")) return;

        cargarResenas();

        const prev = $("carruselPrev");
        const next = $("carruselNext");
        if (prev) prev.addEventListener("click", () => { anterior(); pausarAuto(); });
        if (next) next.addEventListener("click", () => { siguiente(); pausarAuto(); });
        // Al cruzar el breakpoint cambia cuántas reseñas se ven a la vez.
        mq.addEventListener("change", recalcular);

        wireFormulario();
    }

    async function cargarResenas() {
        let items = [];
        try {
            const res = await fetch(API_BASE + "/api/resenas/publicas");
            const body = await res.json().catch(() => ({}));
            items = (body && body.data) || [];
        } catch (err) {
            console.warn("[RESENAS] no se pudieron cargar:", err);
        }
        construirCarrusel(items);
    }

    function construirCarrusel(items) {
        carItems = items || [];
        const track = $("carruselTrack");
        const carrusel = $("resenasCarrusel");
        if (!track || !carrusel) return;

        // Sin reseñas aprobadas → estado vacío (sin flechas ni dots).
        if (!carItems.length) {
            track.innerHTML = '<p class="carrusel-vacio">Aún no hay reseñas publicadas. ¡Sé el primero en compartir tu experiencia!</p>';
            track.style.transform = "";
            detenerAuto();
            carActivo = false;
            carrusel.classList.add("is-static");
            const dots = $("carruselDots");
            if (dots) dots.innerHTML = "";
            return;
        }

        track.innerHTML = carItems
            .map((r) => `<div class="carrusel-slide">${cardResena(r)}</div>`)
            .join("");
        track.style.transform = "";

        detenerAuto();
        carIndex = 0;

        // 3 reseñas o menos → modo estático: sin flechas, sin dots, sin auto.
        carActivo = carItems.length > 3;
        carrusel.classList.toggle("is-static", !carActivo);

        if (!carActivo) {
            const dots = $("carruselDots");
            if (dots) dots.innerHTML = "";
            return;
        }
        recalcular();
        iniciarAuto();
    }

    function visiblesAhora() {
        return mq.matches ? 3 : 1;
    }

    function recalcular() {
        if (!carActivo) return;
        carVisible = visiblesAhora();
        carMax = Math.max(0, carItems.length - carVisible);
        if (carIndex > carMax) carIndex = carMax;
        renderDots();
        aplicarTransform();
    }

    function aplicarTransform() {
        const track = $("carruselTrack");
        if (!track) return;
        track.style.transform = `translateX(-${carIndex * (100 / carVisible)}%)`;
        actualizarDots();
    }

    function renderDots() {
        const cont = $("carruselDots");
        if (!cont) return;
        let html = "";
        for (let i = 0; i <= carMax; i++) {
            html += `<button type="button" class="carrusel-dot" data-dot="${i}" aria-label="Ir a reseña ${i + 1}"></button>`;
        }
        cont.innerHTML = html;
        cont.querySelectorAll("[data-dot]").forEach((d) => {
            d.addEventListener("click", () => {
                irA(parseInt(d.dataset.dot, 10));
                pausarAuto();
            });
        });
        actualizarDots();
    }

    function actualizarDots() {
        const cont = $("carruselDots");
        if (!cont) return;
        cont.querySelectorAll("[data-dot]").forEach((d) => {
            d.classList.toggle("is-active", parseInt(d.dataset.dot, 10) === carIndex);
        });
    }

    // Loop infinito: al pasar el final vuelve al inicio y viceversa.
    function irA(i) {
        if (i < 0) i = carMax;
        if (i > carMax) i = 0;
        carIndex = i;
        aplicarTransform();
    }
    function siguiente() { irA(carIndex >= carMax ? 0 : carIndex + 1); }
    function anterior() { irA(carIndex <= 0 ? carMax : carIndex - 1); }

    function iniciarAuto() {
        detenerAuto();
        if (!carActivo) return;
        autoTimer = setInterval(siguiente, 5000);
    }
    function detenerAuto() {
        if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    }
    // Pausa el auto-avance y lo reanuda 8s después de la última interacción.
    function pausarAuto() {
        detenerAuto();
        clearTimeout(resumeTimer);
        resumeTimer = setTimeout(iniciarAuto, 8000);
    }

    // ----- Formulario de alta de reseña (2 pasos) -----
    function wireFormulario() {
        const toggleBtn = $("resenaToggleBtn");
        const closeBtn = $("resenaCloseBtn");
        const wrap = $("resenaFormWrap");
        const verifyForm = $("resenaVerifyForm");
        const submitForm = $("resenaSubmitForm");
        const verifyMsg = $("resenaVerifyMsg");
        const submitMsg = $("resenaSubmitMsg");
        const successMsg = $("resenaSuccessMsg");
        const texto = $("resenaTexto");
        const counter = $("resenaCounter");
        if (!toggleBtn || !wrap || !verifyForm || !submitForm) return;

        // Datos confirmados en el paso 1, reutilizados al enviar el paso 2.
        let verificado = null;

        // Devuelve el formulario a su estado original (paso 1 limpio).
        function resetForm() {
            verifyForm.hidden = false;
            submitForm.hidden = true;
            successMsg.hidden = true;
            verifyMsg.hidden = true;
            submitMsg.hidden = true;
            verifyForm.reset();
            submitForm.reset();
            verificado = null;
            if (counter) counter.textContent = "0 / 1000";
        }

        toggleBtn.addEventListener("click", () => {
            wrap.hidden = !wrap.hidden;
            if (!wrap.hidden) {
                resetForm();
                $("resenaCliente").focus();
            }
        });

        // FIX 0: botón X. Cierra el formulario y deja la sección como estaba.
        if (closeBtn) {
            closeBtn.addEventListener("click", () => {
                resetForm();
                wrap.hidden = true;
            });
        }

        // Contador de caracteres de la reseña.
        if (texto && counter) {
            const sync = () => { counter.textContent = `${texto.value.length} / 1000`; };
            texto.addEventListener("input", sync);
            sync();
        }

        // ----- Paso 1: verificación CL-XXXX + teléfono contra el backend -----
        verifyForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            verifyMsg.hidden = true;

            const numero_cliente = $("resenaCliente").value.trim().toUpperCase();
            const telefono = $("resenaTelefono").value.replace(/\D+/g, "");

            // Capa 1 de validación: formato en el cliente antes de tocar la red.
            if (!/^CL-\d{4}$/.test(numero_cliente)) {
                mostrarMsg(verifyMsg, "Número de cliente inválido. Ejemplo: CL-0001.");
                return;
            }
            if (!/^\d{10}$/.test(telefono)) {
                mostrarMsg(verifyMsg, "El teléfono debe tener 10 dígitos.");
                return;
            }

            const btn = $("resenaVerifyBtn");
            const original = btn.textContent;
            btn.disabled = true;
            btn.textContent = "Verificando…";
            try {
                const res = await fetch(API_BASE + "/api/resenas/verificar", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ numero_cliente, telefono }),
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok || !body.ok) {
                    mostrarMsg(verifyMsg, (body && body.error) || "No pudimos verificar tus datos.");
                    return;
                }
                // Verificado: avanza al paso 2.
                verificado = { numero_cliente, telefono };
                verifyForm.hidden = true;
                submitForm.hidden = false;
                $("resenaNombre").focus();
            } catch (err) {
                mostrarMsg(verifyMsg, "No se pudo conectar. Intenta de nuevo.");
            } finally {
                btn.disabled = false;
                btn.textContent = original;
            }
        });

        // ----- Paso 2: envío de la reseña -----
        submitForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            submitMsg.hidden = true;

            if (!verificado) {
                verifyForm.hidden = false;
                submitForm.hidden = true;
                return;
            }

            const nombre_display = $("resenaNombre").value.trim();
            const colonia = $("resenaColonia").value.trim();
            const tipo_servicio = $("resenaTipo").value;
            const txt = $("resenaTexto").value.trim();

            if (nombre_display.length < 2) {
                mostrarMsg(submitMsg, "Escribe tu nombre.");
                return;
            }
            if (txt.length < 20) {
                mostrarMsg(submitMsg, "La reseña debe tener al menos 20 caracteres.");
                return;
            }
            if (txt.length > 1000) {
                mostrarMsg(submitMsg, "La reseña no puede exceder 1000 caracteres.");
                return;
            }

            const payload = {
                numero_cliente: verificado.numero_cliente,
                telefono: verificado.telefono,
                nombre_display,
                texto: txt,
            };
            // Opcionales: solo se envían con valor (el backend rechaza
            // tipo_servicio vacío por el enum de Zod).
            if (colonia) payload.colonia = colonia;
            if (tipo_servicio) payload.tipo_servicio = tipo_servicio;

            const btn = $("resenaSubmitBtn");
            const original = btn.textContent;
            btn.disabled = true;
            btn.textContent = "Enviando…";
            try {
                const res = await fetch(API_BASE + "/api/resenas/publico", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok || !body.ok) {
                    mostrarMsg(submitMsg, (body && body.error) || "No se pudo enviar tu reseña.");
                    return;
                }
                // Éxito: oculta los formularios y muestra el agradecimiento.
                verifyForm.hidden = true;
                submitForm.hidden = true;
                successMsg.hidden = false;
                verifyForm.reset();
                submitForm.reset();
                verificado = null;
            } catch (err) {
                mostrarMsg(submitMsg, "No se pudo conectar. Intenta de nuevo.");
            } finally {
                btn.disabled = false;
                btn.textContent = original;
            }
        });
    }

    /* =================================================
       PARTE ADMIN: moderación
       ================================================= */
    let adminResenas = [];   // último listado cargado (para expandir texto)

    function initAdmin() {
        const section = $("resenasSection");
        if (!section) return;

        const refreshBtn = $("resenasRefresh");
        if (refreshBtn) refreshBtn.addEventListener("click", cargarAdmin);

        // Mismo patrón que presupuestos.js: arranca con el evento de sesión.
        document.addEventListener("alas:session-ready", (e) => {
            const sesion = e.detail;
            const esAdmin = !!(sesion && sesion.rol === "admin");
            section.hidden = !esAdmin;
            if (esAdmin) cargarAdmin();
        });
    }

    async function cargarAdmin() {
        const cont = $("resenasAdminList");
        if (!cont) return;
        cont.innerHTML = '<div class="resena-admin-empty">Cargando…</div>';
        try {
            const res = await fetch(API_BASE + "/api/admin/resenas", { credentials: "include" });
            if (res.status === 401) {
                cont.innerHTML = '<div class="resena-admin-empty">Sesión expirada.</div>';
                return;
            }
            const body = await res.json().catch(() => ({}));
            if (!res.ok || !body.ok) {
                cont.innerHTML = `<div class="resena-admin-empty">${esc((body && body.error) || "Error al cargar.")}</div>`;
                return;
            }
            const data = body.data || { resenas: [], pendientes: 0 };
            adminResenas = data.resenas || [];
            renderBadge(data.pendientes || 0);
            renderAdminList(cont, adminResenas);
        } catch (err) {
            cont.innerHTML = '<div class="resena-admin-empty">No se pudo conectar.</div>';
        }
    }

    function renderBadge(n) {
        const tag = $("resenaPendTag");
        const count = $("resenaPendCount");
        if (!tag || !count) return;
        if (n > 0) {
            count.textContent = n;
            tag.hidden = false;
        } else {
            tag.hidden = true;
        }
    }

    function renderAdminList(cont, resenas) {
        if (!resenas.length) {
            cont.innerHTML = '<div class="resena-admin-empty">Aún no hay reseñas.</div>';
            return;
        }
        cont.innerHTML = resenas.map(cardAdmin).join("");

        cont.querySelectorAll("[data-aprobar]").forEach((b) => {
            b.addEventListener("click", () => moderar(b.dataset.aprobar, "aprobada"));
        });
        cont.querySelectorAll("[data-rechazar]").forEach((b) => {
            b.addEventListener("click", () => moderar(b.dataset.rechazar, "rechazada"));
        });
        // Texto truncado expandible con click.
        cont.querySelectorAll(".resena-admin-texto.is-collapsible").forEach((el) => {
            el.addEventListener("click", () => {
                const r = adminResenas.find((x) => String(x.id) === el.dataset.rid);
                if (!r) return;
                const expandido = el.classList.toggle("is-expanded");
                el.textContent = expandido ? r.texto : r.texto.slice(0, 150) + "…";
            });
        });
    }

    function cardAdmin(r) {
        const metaTxt = metaDe(r);
        const esLargo = r.texto.length > 150;
        const corto = esLargo ? r.texto.slice(0, 150) + "…" : r.texto;
        const textoCls = esLargo ? "resena-admin-texto is-collapsible" : "resena-admin-texto";
        const acciones = r.estado === "pendiente"
            ? `<div class="resena-admin-actions">
                   <button type="button" class="btn btn-primary" data-aprobar="${r.id}">✅ Aprobar</button>
                   <button type="button" class="btn btn-ghost" data-rechazar="${r.id}">❌ Rechazar</button>
               </div>`
            : "";
        return `
            <article class="resena-admin-card">
                <div class="resena-admin-head">
                    <span class="resena-estado ${esc(r.estado)}">${esc(r.estado)}</span>
                    <span class="resena-admin-fecha">${esc(fmtFecha(r.fecha_creacion))}</span>
                </div>
                <p class="resena-admin-nombre">
                    ${esc(r.nombre_display)}${metaTxt ? ` · <span class="resena-admin-meta">${esc(metaTxt)}</span>` : ""}
                </p>
                <p class="${textoCls}" data-rid="${r.id}">${esc(corto)}</p>
                ${acciones}
            </article>
        `;
    }

    async function moderar(id, estado) {
        try {
            const res = await fetch(API_BASE + "/api/admin/resenas/" + encodeURIComponent(id), {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ estado }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || !body.ok) {
                toast((body && body.error) || "No se pudo moderar la reseña.", "error");
                return;
            }
            toast(body.mensaje || "Reseña actualizada.", "success");
            // Re-carga la lista: actualiza cards + badge sin recargar la página.
            cargarAdmin();
        } catch (err) {
            toast("No se pudo conectar.", "error");
        }
    }

    /* ---------- Arranque ---------- */
    if (EN_ADMIN) {
        initAdmin();
    } else {
        initPublico();
    }
})();

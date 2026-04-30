(() => {
    /* =====================================================
       SITIO PÚBLICO — WhatsApp + nav + cotización
       ===================================================== */
    const WHATSAPP_NUMBER = "525531675824";
    const DEFAULT_MESSAGE = "Hola ALAS, me gustaría solicitar una cotización.";

    const waLink = (text) =>
        `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

    const ctaWhatsApp = document.getElementById("ctaWhatsApp");
    const footerWhatsApp = document.getElementById("footerWhatsApp");
    const waFloat = document.getElementById("waFloat");
    const defaultHref = waLink(DEFAULT_MESSAGE);

    if (ctaWhatsApp) ctaWhatsApp.href = defaultHref;
    if (footerWhatsApp) footerWhatsApp.href = defaultHref;
    if (waFloat) waFloat.href = defaultHref;

    const quoteForm = document.getElementById("quoteForm");
    if (quoteForm) {
        quoteForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const data = new FormData(quoteForm);
            const name = data.get("name").trim();
            const phone = data.get("phone").trim();
            const service = data.get("service");
            const address = (data.get("address") || "").trim();
            const lat = (data.get("lat") || "").trim();
            const lng = (data.get("lng") || "").trim();
            const message = data.get("message").trim();
            const mapsLink = lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : "";
            const text =
                `Hola ALAS, soy ${name}.\n` +
                `Teléfono: ${phone}\n` +
                `Servicio: ${service}\n` +
                (address ? `Dirección: ${address}\n` : "") +
                (mapsLink ? `Ubicación: ${mapsLink}\n` : "") +
                `\n${message}`;
            window.open(waLink(text), "_blank", "noopener");
        });
    }

    const navToggle = document.getElementById("navToggle");
    const navLinks = document.getElementById("navLinks");
    if (navToggle && navLinks) {
        navToggle.addEventListener("click", () => {
            navLinks.classList.toggle("open");
        });
        navLinks.querySelectorAll("a").forEach((a) => {
            a.addEventListener("click", () => navLinks.classList.remove("open"));
        });
    }

    const yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    /* =====================================================
       GOOGLE MAPS PLACES AUTOCOMPLETE (público + admin)
       Carga dinámica de script: SOLO tras obtener la key.
       ===================================================== */
    const _ORIGIN = window.location.origin;
    let mapsReady = false;
    let mapsApiKey = "";

    function attachAutocomplete(input, latEl, lngEl) {
        if (!mapsReady || !input || input.dataset.acBound === "1" ||
            !window.google || !window.google.maps || !window.google.maps.places) return;
        try {
            const ac = new window.google.maps.places.Autocomplete(input, {
                componentRestrictions: { country: "mx" },
                fields: ["formatted_address", "geometry", "name"],
            });
            ac.addListener("place_changed", () => {
                const p = ac.getPlace();
                const addr = p.formatted_address || p.name || input.value;
                input.value = addr;
                if (latEl) latEl.value = p.geometry && p.geometry.location ? p.geometry.location.lat() : "";
                if (lngEl) lngEl.value = p.geometry && p.geometry.location ? p.geometry.location.lng() : "";
            });
            input.dataset.acBound = "1";
        } catch (e) {
            console.warn("[Maps] attach fail:", e);
        }
    }

    function initAutocomplete() {
        // Form público (sección Presupuesto en main.html)
        attachAutocomplete(
            document.getElementById("quoteAddress"),
            document.getElementById("quoteLat"),
            document.getElementById("quoteLng"),
        );
        // Form admin crear servicio
        attachAutocomplete(
            document.getElementById("direccionInput"),
            document.getElementById("latInput"),
            document.getElementById("lngInput"),
        );
        // Modal admin editar servicio
        attachAutocomplete(
            document.getElementById("editDireccion"),
            document.getElementById("editLat"),
            document.getElementById("editLng"),
        );
    }

    function loadMapsScript(apiKey) {
        if (!apiKey || mapsReady || window.__alasMapsLoading) return;
        window.__alasMapsLoading = true;
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
            mapsReady = true;
            console.log("[Maps] script cargado, iniciando autocomplete");
            initAutocomplete();
            // Re-render del dashboard admin para inyectar mini mapas
            if (document.body.classList.contains("admin-mode")) {
                const dash = document.getElementById("adminDash");
                if (dash && !dash.hidden && typeof listar === "function") listar();
            }
        };
        script.onerror = (e) => {
            window.__alasMapsLoading = false;
            console.warn("[Maps] error cargando script:", e);
        };
        document.head.appendChild(script);
    }

    // 1. Pedir config al backend
    // 2. Si hay key → cargar script de Maps
    // 3. Si script carga → bind autocomplete a inputs existentes
    fetch(`${_ORIGIN}/api/config`)
        .then((r) => r.json())
        .then((b) => {
            const k = b && b.data && b.data.mapsApiKey;
            if (!k) {
                console.warn("[Maps] sin API key configurada en /api/config");
                return;
            }
            mapsApiKey = k;
            console.log("[Maps] key recibida (len=" + k.length + "), cargando script…");
            loadMapsScript(k);
        })
        .catch((e) => console.warn("[Maps] config fetch falló:", e));

    /* =====================================================
       PANEL ADMIN — solo se inicializa en /admin
       ===================================================== */
    if (window.location.pathname !== "/admin") return;

    document.body.classList.add("admin-mode");

    const API_BASE = window.location.origin;

    // Login
    const loginSection = document.getElementById("adminLogin");
    const dashSection = document.getElementById("adminDash");
    const loginForm = document.getElementById("loginForm");
    const loginUser = document.getElementById("loginUser");
    const loginPass = document.getElementById("loginPass");
    const loginSubmit = document.getElementById("loginSubmit");
    const loginError = document.getElementById("loginError");
    const logoutBtn = document.getElementById("logoutBtn");

    // Servicios
    const svcForm = document.getElementById("svcForm");
    const svcSubmit = document.getElementById("svcSubmit");
    const svcList = document.getElementById("svcList");
    const svcRefresh = document.getElementById("svcRefresh");
    const filterRow = document.getElementById("filterRow");
    const scopeWrap = document.getElementById("scopeWrap");
    const estadoBtns = document.querySelectorAll(".filter-btn[data-estado]");
    const scopeBtns = document.querySelectorAll(".filter-btn[data-scope]");

    // Cache lista de técnicos para selects de reasignación
    let tecnicosCache = [];
    let scope = "all"; // "all" | "mine"
    let estadoFiltro = "ACTIVOS"; // "ACTIVOS" | "TERMINADO"

    // Tabs
    const tabBtns = document.querySelectorAll(".dash-tab");
    const tabActive = document.getElementById("tabActive");
    const tabSearch = document.getElementById("tabSearch");

    // Search
    const clientSearch = document.getElementById("clientSearch");
    const clientResults = document.getElementById("clientResults");
    const clientHistory = document.getElementById("clientHistory");
    const historyList = document.getElementById("historyList");
    const historyName = document.getElementById("historyName");
    const historySub = document.getElementById("historySub");
    const historyBack = document.getElementById("historyBack");

    // Modales
    const toastEl = document.getElementById("toast");
    const toastMsg = toastEl.querySelector(".toast-msg");
    const confirmBack = document.getElementById("confirmBack");
    const confirmMsg = document.getElementById("confirmMsg");
    const confirmOk = document.getElementById("confirmOk");
    const confirmCancel = document.getElementById("confirmCancel");
    const ajusteBack = document.getElementById("ajusteBack");
    const ajusteForm = document.getElementById("ajusteForm");
    const ajusteText = document.getElementById("ajusteText");
    const ajusteCancel = document.getElementById("ajusteCancel");

    /* ===== Helpers ===== */
    const escape = (s) =>
        String(s ?? "").replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
        }[c]));

    const money = (n) => {
        const num = Number(n) || 0;
        const isWhole = Math.abs(num - Math.round(num)) < 0.005;
        return "$" + num.toLocaleString("es-MX", {
            minimumFractionDigits: isWhole ? 0 : 2,
            maximumFractionDigits: 2,
        });
    };

    const fechaCorta = (f) => {
        if (!f) return "—";
        const d = new Date(f);
        if (isNaN(d.getTime())) return String(f);
        return d.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
    };

    const badge = (estado) => {
        const k = String(estado || "").toUpperCase();
        const cls = k === "PENDIENTE" ? "PEND" : k === "EN_PROCESO" ? "PROC" : "TERM";
        return `<span class="badge ${cls}">${escape(k)}</span>`;
    };

    /* ===== Modal helpers (scroll lock global) ===== */
    function openModal(el) {
        el.classList.add("show");
        document.body.classList.add("modal-open");
    }
    function closeModal(el) {
        el.classList.remove("show");
        // Si no queda ningún modal abierto, suelta el scroll
        if (!document.querySelector(".modal-back.show")) {
            document.body.classList.remove("modal-open");
        }
    }

    let toastTimer = null;
    function toast(msg, kind = "success") {
        toastMsg.textContent = msg;
        toastEl.classList.remove("success", "error");
        toastEl.classList.add(kind === "error" ? "error" : "success");
        toastEl.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove("show"), 4200);
    }

    function confirmDialog(message) {
        confirmMsg.textContent = message;
        openModal(confirmBack);
        return new Promise((resolve) => {
            const cleanup = (val) => {
                closeModal(confirmBack);
                confirmOk.removeEventListener("click", onOk);
                confirmCancel.removeEventListener("click", onCancel);
                confirmBack.removeEventListener("click", onBack);
                document.removeEventListener("keydown", onKey);
                resolve(val);
            };
            const onOk = () => cleanup(true);
            const onCancel = () => cleanup(false);
            const onBack = (e) => { if (e.target === confirmBack) cleanup(false); };
            const onKey = (e) => { if (e.key === "Escape") cleanup(false); };
            confirmOk.addEventListener("click", onOk);
            confirmCancel.addEventListener("click", onCancel);
            confirmBack.addEventListener("click", onBack);
            document.addEventListener("keydown", onKey);
        });
    }

    /* ===== Sesión ===== */
    let currentUser = null; // { usuario, rol, uid? }

    const userPill = document.getElementById("userPill");
    const userPillName = document.getElementById("userPillName");
    const userPillRol = document.getElementById("userPillRol");
    const usuariosSection = document.getElementById("usuariosSection");
    // Adelantado desde el bloque "MÓDULO USUARIOS" para evitar TDZ:
    // applyUserContext (más abajo) puede llamar a loadUsuarios antes de que el bloque de usuarios
    // se inicialice si algún addEventListener intermedio falla por elemento ausente en el DOM.
    const userList = document.getElementById("userList");

    function applyUserContext(sess) {
        currentUser = sess || null;
        if (currentUser && currentUser.usuario) {
            userPillName.textContent = currentUser.usuario;
            userPillRol.textContent = currentUser.rol || "admin";
            userPill.hidden = false;
        } else {
            userPill.hidden = true;
        }
        const isAdmin = !!(currentUser && currentUser.rol === "admin");
        usuariosSection.hidden = !isAdmin;

        // Filtro Estado SIEMPRE visible (Activos/Finalizados). Reset a Activos.
        filterRow.hidden = false;
        estadoFiltro = "ACTIVOS";
        estadoBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.estado === "ACTIVOS"));
        // Filtro Scope (Todos/Mis) solo para admin
        if (isAdmin) {
            scopeWrap.hidden = false;
            scope = "all";
            scopeBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.scope === "all"));
        } else {
            scopeWrap.hidden = true;
            scope = "mine";
        }

        if (isAdmin) loadUsuarios();
    }

    function showLogin() {
        loginSection.hidden = false;
        dashSection.hidden = true;
        currentUser = null;
        userPill.hidden = true;
        usuariosSection.hidden = true;
        if (typeof stopPolling === "function") stopPolling();
        setTimeout(() => {
            const target = loginUser && !loginUser.value ? loginUser : loginPass;
            target && target.focus();
        }, 50);
    }
    function showDash() {
        loginSection.hidden = true;
        dashSection.hidden = false;
        listar();
        if (typeof startPolling === "function") startPolling();
    }

    async function checkSession() {
        try {
            const res = await fetch(`${API_BASE}/api/admin/check`, { credentials: "include" });
            const body = await res.json();
            if (body.authed) {
                applyUserContext({ usuario: body.usuario, rol: body.rol });
                showDash();
            } else {
                showLogin();
            }
        } catch {
            showLogin();
        }
    }

    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        loginError.textContent = "";
        loginSubmit.disabled = true;
        const original = loginSubmit.textContent;
        loginSubmit.textContent = "Validando…";
        try {
            const res = await fetch(`${API_BASE}/api/admin/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    usuario: loginUser.value.trim(),
                    password: loginPass.value,
                }),
            });
            const body = await res.json();
            if (!res.ok || !body.ok) throw new Error(body.error || "Acceso denegado");
            loginPass.value = "";
            applyUserContext(body.data || null);
            showDash();
            toast(`Bienvenido, ${body.data && body.data.usuario ? body.data.usuario : "admin"}.`, "success");
        } catch (err) {
            loginError.textContent = err.message;
        } finally {
            loginSubmit.disabled = false;
            loginSubmit.textContent = original;
        }
    });

    logoutBtn.addEventListener("click", async () => {
        try {
            await fetch(`${API_BASE}/api/admin/logout`, { method: "POST", credentials: "include" });
        } catch {}
        showLogin();
        toast("Sesión cerrada.", "success");
    });

    /* ===== Tabs ===== */
    function clearSearchResults() {
        clientResults.innerHTML = '<div class="svc-empty">Escribe nombre, número o teléfono para buscar.</div>';
        clientHistory.hidden = true;
        clientResults.hidden = false;
    }

    tabBtns.forEach((b) => {
        b.addEventListener("click", () => {
            tabBtns.forEach((x) => {
                x.classList.toggle("is-active", x === b);
                x.setAttribute("aria-selected", x === b ? "true" : "false");
            });
            const target = b.dataset.tab;
            tabActive.hidden = target !== "active";
            tabSearch.hidden = target !== "search";
            if (target === "search") {
                // No carga automática; estado vacío hasta que el usuario escriba
                if (!clientSearch.value.trim() && clientHistory.hidden) {
                    clearSearchResults();
                }
                clientSearch.focus();
            }
        });
    });

    /* ===== Render servicios ===== */
    function tecnicoChip(r) {
        if (!r.tecnico_asignado) {
            return `<span class="svc-tec unassigned">Sin asignar</span>`;
        }
        return `<span class="svc-tec">${escape(r.tecnico_asignado)}</span>`;
    }

    function tecnicoTelefono(usuario) {
        const t = tecnicosCache.find((x) => x.usuario === usuario);
        return t && t.telefono ? String(t.telefono).trim() : "";
    }

    function buildWhatsAppMessage(r) {
        const lines = [
            "*Nuevo servicio asignado · ALAS*",
            "",
            `*Cliente:* ${r.nombre_cliente || "—"}`,
            `*Teléfono:* ${r.telefono || "—"}`,
            `*Dirección:* ${r.direccion || "—"}`,
            `*Trabajo:* ${r.conceptos || "—"}`,
            `*Total:* $${(Number(r.total) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            `*N° cliente:* ${r.numero_cliente || "—"}`,
        ];
        return lines.join("\n");
    }

    function whatsappUrl(telefono, message) {
        const t = String(telefono || "").replace(/\D/g, "");
        const num = t.startsWith("52") ? t : `52${t}`;
        return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
    }

    function tecnicoSelectHTML(r) {
        // Solo admin reasigna. Si el caché aún no llegó, muestra chip estático.
        const isAdmin = currentUser && currentUser.rol === "admin";
        if (!isAdmin || !tecnicosCache.length) return "";
        const opts = tecnicosCache
            .filter((t) => t.activo)
            .map((t) => {
                const sel = t.usuario === r.tecnico_asignado ? "selected" : "";
                const carga = typeof t.carga === "number" ? ` (${t.carga})` : "";
                return `<option value="${escape(t.usuario)}" ${sel}>${escape(t.usuario)}${carga}</option>`;
            }).join("");
        return `
            <div class="svc-tec-row">
                <span class="label">Reasignar</span>
                <select class="svc-tec-select svc-asignar" data-id="${r.id}">
                    ${r.tecnico_asignado ? "" : `<option value="" selected disabled>— elegir —</option>`}
                    ${opts}
                </select>
            </div>
        `;
    }

    function renderServicios(rows, container, opts = {}) {
        const showCount = opts.showCount !== false;
        const allowAjuste = opts.allowAjuste !== false;
        const allowFinalizar = opts.allowFinalizar !== false;

        if (!rows.length) {
            container.innerHTML = `<div class="svc-empty">${escape(opts.emptyMsg || "Sin servicios.")}</div>`;
            return;
        }
        container.innerHTML = `
            ${showCount ? `<div class="svc-toolbar" style="margin-bottom:1rem;">
                <span class="svc-count">${rows.length} ${rows.length === 1 ? "servicio" : "servicios"}</span>
            </div>` : ""}
            <div class="svc-list">
                ${rows.map((r) => {
                    const terminado = String(r.estado).toUpperCase() === "TERMINADO";
                    return `
                    <article class="svc-item">
                        <div class="svc-row-top">
                            <div class="svc-client">
                                <span class="svc-name">${escape(r.nombre_cliente)}</span>
                                <span class="svc-meta">N° ${escape(r.numero_cliente)} · ${escape(r.telefono || "Sin teléfono")}</span>
                            </div>
                            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                                ${tecnicoChip(r)}
                                ${badge(r.estado)}
                            </div>
                        </div>
                        ${r.direccion ? (() => {
                            const hasCoords = r.lat != null && r.lng != null;
                            const mapsHref = hasCoords
                                ? `https://maps.google.com/?q=${r.lat},${r.lng}`
                                : `https://maps.google.com/?q=${encodeURIComponent(r.direccion)}`;
                            return `<div class="svc-direccion"><strong>📍 Dirección</strong>${escape(r.direccion)} · <a class="svc-map-link" href="${mapsHref}" target="_blank" rel="noopener">Abrir en Maps ↗</a></div>`;
                        })() : ""}
                        ${mapsApiKey && r.direccion ? (() => {
                            const q = (r.lat != null && r.lng != null)
                                ? `${r.lat},${r.lng}`
                                : r.direccion;
                            return `<div class="svc-mapwrap">
                                <iframe class="svc-map"
                                    loading="lazy"
                                    referrerpolicy="no-referrer-when-downgrade"
                                    src="https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(mapsApiKey)}&q=${encodeURIComponent(q)}&zoom=16"
                                    allowfullscreen></iframe>
                            </div>`;
                        })() : ""}
                        <div class="svc-desc">${escape(r.conceptos)}</div>
                        ${r.ajuste ? `<div class="svc-ajuste"><strong>Ajuste</strong>${escape(r.ajuste)}</div>` : ""}
                        ${!terminado ? tecnicoSelectHTML(r) : ""}
                        ${terminado && r.atendido_por ? `<div class="svc-attended">Atendido por <strong>${escape(r.atendido_por)}</strong></div>` : ""}
                        ${terminado && r.resolucion ? `<div class="svc-resolucion"><strong>🛠 Resolución del servicio</strong>${escape(r.resolucion)}</div>` : ""}
                        <div class="svc-row-bot">
                            <div class="svc-info">
                                <span class="svc-total">${money(r.total)}</span>
                                <span class="svc-date">${terminado && r.fecha_fin
                                    ? `Finalizado: ${escape(fechaCorta(r.fecha_fin))}`
                                    : escape(fechaCorta(r.fecha_inicio))}</span>
                                ${terminado && r.numero_nota ? `<span class="svc-nota-id">${escape(r.numero_nota)}</span>` : ""}
                            </div>
                            <div class="svc-actions">
                                ${terminado ? `
                                    ${r.numero_nota ? `<button class="btn-edit svc-vernota" data-id="${r.id}">📄 Ver nota</button>` : ""}
                                    ${r.numero_nota ? `<button class="btn btn-primary svc-pdf" data-id="${r.id}">⬇️ Descargar PDF</button>` : ""}
                                    <button class="btn-edit svc-reporte" data-id="${r.id}">📋 Reporte técnico</button>
                                    ${currentUser && currentUser.rol === "admin" ? `<button class="btn-reopen svc-reopen" data-id="${r.id}">🔓 Reabrir</button>` : ""}
                                    ${currentUser && currentUser.rol === "admin" ? `<button class="btn-del svc-del" data-id="${r.id}">Eliminar</button>` : ""}
                                ` : `
                                    ${currentUser && currentUser.rol === "admin" && r.tecnico_asignado
                                        ? `<button class="btn-wa svc-wa" data-id="${r.id}" title="Avisar al técnico por WhatsApp">📱 Avisar técnico</button>`
                                        : ""}
                                    ${currentUser && currentUser.rol === "admin"
                                        ? `<button class="btn-edit svc-edit" data-id="${r.id}">Editar</button>`
                                        : ""}
                                    ${allowAjuste
                                        ? `<button class="btn-ajuste svc-ajuste-btn" data-id="${r.id}">${r.ajuste ? "Editar ajuste" : "Agregar ajuste"}</button>`
                                        : ""}
                                    ${currentUser && currentUser.rol === "admin"
                                        ? `<button class="btn-del svc-del" data-id="${r.id}">Eliminar</button>`
                                        : ""}
                                    ${allowFinalizar
                                        ? `<button class="btn btn-primary btn-finalize svc-fin" data-id="${r.id}">Finalizar y generar nota</button>`
                                        : ""}
                                `}
                            </div>
                        </div>
                    </article>
                `; }).join("")}
            </div>
        `;
        container.querySelectorAll(".svc-fin").forEach((b) =>
            b.addEventListener("click", () => finalizar(parseInt(b.dataset.id, 10), b))
        );
        container.querySelectorAll(".svc-ajuste-btn").forEach((b) =>
            b.addEventListener("click", () => abrirAjuste(parseInt(b.dataset.id, 10), rows.find((r) => r.id === parseInt(b.dataset.id, 10))))
        );
        container.querySelectorAll(".svc-asignar").forEach((sel) =>
            sel.addEventListener("change", (e) => reasignar(parseInt(sel.dataset.id, 10), e.target.value))
        );
        container.querySelectorAll(".svc-wa").forEach((b) =>
            b.addEventListener("click", () => avisarWhatsApp(parseInt(b.dataset.id, 10), rows.find((r) => r.id === parseInt(b.dataset.id, 10))))
        );
        container.querySelectorAll(".svc-edit").forEach((b) =>
            b.addEventListener("click", () => abrirEditServicio(rows.find((r) => r.id === parseInt(b.dataset.id, 10))))
        );
        container.querySelectorAll(".svc-del").forEach((b) =>
            b.addEventListener("click", () => eliminarServicio(parseInt(b.dataset.id, 10), rows.find((r) => r.id === parseInt(b.dataset.id, 10))))
        );
        container.querySelectorAll(".svc-vernota").forEach((b) =>
            b.addEventListener("click", () => abrirNota(parseInt(b.dataset.id, 10)))
        );
        container.querySelectorAll(".svc-pdf").forEach((b) =>
            b.addEventListener("click", () => descargarNotaPdf(parseInt(b.dataset.id, 10)))
        );
        container.querySelectorAll(".svc-reopen").forEach((b) =>
            b.addEventListener("click", () => reabrirServicio(parseInt(b.dataset.id, 10), rows.find((r) => r.id === parseInt(b.dataset.id, 10))))
        );
        container.querySelectorAll(".svc-reporte").forEach((b) =>
            b.addEventListener("click", () => window.open(`${API_BASE}/api/servicios/${b.dataset.id}/reporte`, "_blank", "noopener"))
        );
    }

    function avisarWhatsApp(id, r) {
        if (!r) return;
        const tel = tecnicoTelefono(r.tecnico_asignado);
        if (!tel) {
            toast(`El técnico ${r.tecnico_asignado || "asignado"} no tiene teléfono configurado.`, "error");
            return;
        }
        const url = whatsappUrl(tel, buildWhatsAppMessage(r));
        window.open(url, "_blank", "noopener");
    }

    /* ===== Cargar técnicos (solo admin) para reasignación ===== */
    async function loadTecnicos() {
        if (!currentUser || currentUser.rol !== "admin") {
            tecnicosCache = [];
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/api/admin/usuarios/tecnicos`, { credentials: "include" });
            if (!res.ok) { tecnicosCache = []; return; }
            const body = await res.json();
            tecnicosCache = (body && body.data) || [];
        } catch {
            tecnicosCache = [];
        }
    }

    /* ===== Listar servicios (activos o finalizados) ===== */
    function listarUrl() {
        const params = new URLSearchParams();
        if (estadoFiltro === "TERMINADO") params.set("estado", "TERMINADO");
        // ACTIVOS = default backend (PENDIENTE,EN_PROCESO)
        if (scope === "mine") params.set("mine", "1");
        const qs = params.toString();
        return `${API_BASE}/api/servicios${qs ? "?" + qs : ""}`;
    }

    async function listar() {
        svcList.innerHTML = '<div class="svc-empty"><span class="svc-loader"></span>Cargando servicios…</div>';
        try {
            await loadTecnicos();
            const res = await fetch(listarUrl(), { credentials: "include" });
            if (res.status === 401) { showLogin(); return; }
            const body = await res.json();
            if (!res.ok || !body.ok) throw new Error(body.error || "Error");
            const empty = estadoFiltro === "TERMINADO"
                ? (scope === "mine" ? "No tienes servicios finalizados." : "Sin servicios finalizados.")
                : (scope === "mine" ? "No tienes servicios asignados." : "Sin servicios activos por el momento.");
            renderServicios(body.data, svcList, { emptyMsg: empty });
        } catch (err) {
            svcList.innerHTML = `<div class="svc-empty error">Error: ${escape(err.message)}</div>`;
        }
    }

    /* ===== Crear servicio ===== */
    svcForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(svcForm).entries());
        // FormData incluye lat/lng (hidden inputs) — vacíos si no se usó autocomplete
        svcSubmit.disabled = true;
        const original = svcSubmit.textContent;
        svcSubmit.textContent = "Creando…";
        try {
            const res = await fetch(`${API_BASE}/api/servicios`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(data),
            });
            if (res.status === 401) { showLogin(); return; }
            const body = await res.json();
            if (!res.ok || !body.ok) throw new Error(body.error || "Error");
            const numCli = body.generated_numero_cliente || (body.data && body.data.numero_cliente) || "";
            const tec = body.tecnico_asignado || (body.data && body.data.tecnico_asignado) || "sin técnico";
            toast(`Servicio creado · ${numCli} · asignado a ${tec}`, "success");
            svcForm.reset();
            const lat = document.getElementById("latInput");
            const lng = document.getElementById("lngInput");
            if (lat) lat.value = "";
            if (lng) lng.value = "";
            const tp = document.getElementById("totalPreview");
            if (tp) tp.textContent = money(0);
            listar();
        } catch (err) {
            toast(err.message, "error");
        } finally {
            svcSubmit.disabled = false;
            svcSubmit.textContent = original;
        }
    });

    /* ===== Filtros Estado y Scope ===== */
    estadoBtns.forEach((b) => {
        b.addEventListener("click", () => {
            estadoFiltro = b.dataset.estado;
            estadoBtns.forEach((x) => x.classList.toggle("is-active", x === b));
            listar();
        });
    });
    scopeBtns.forEach((b) => {
        b.addEventListener("click", () => {
            scope = b.dataset.scope;
            scopeBtns.forEach((x) => x.classList.toggle("is-active", x === b));
            listar();
        });
    });

    /* ===== Reasignar ===== */
    async function reasignar(id, tecnico) {
        if (!tecnico) return;
        try {
            const res = await fetch(`${API_BASE}/api/servicios/${id}/asignar`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ tecnico }),
            });
            if (res.status === 401) { showLogin(); return; }
            const body = await res.json();
            if (!res.ok || !body.ok) throw new Error(body.error || "Error");
            toast(`Servicio reasignado a ${tecnico}.`, "success");
            listar();
        } catch (err) {
            toast(err.message, "error");
            listar();
        }
    }

    /* ===== Live preview formato dinero ===== */
    function wireMoneyPreview(inputId, previewId) {
        const inp = document.getElementById(inputId);
        const out = document.getElementById(previewId);
        if (!inp || !out) return;
        const update = () => { out.textContent = money(inp.value); };
        inp.addEventListener("input", update);
        inp.addEventListener("change", update);
        update();
    }
    wireMoneyPreview("totalInput", "totalPreview");
    wireMoneyPreview("editTotal", "editTotalPreview");

    svcRefresh.addEventListener("click", () => {
        if (!tabActive.hidden) listar();
        else if (!clientHistory.hidden && clientHistory.dataset.cliente) {
            cargarHistorial(clientHistory.dataset.cliente, clientHistory.dataset.nombre);
        } else {
            buscarClientes(clientSearch.value);
        }
    });

    /* ===== Finalizar ===== */
    /* ===== Finalizar con modal de resolución ===== */
    const finalizeBack = document.getElementById("finalizeBack");
    const finalizeForm = document.getElementById("finalizeForm");
    const finalizeSvcId = document.getElementById("finalizeSvcId");
    const finalizeResolucion = document.getElementById("finalizeResolucion");
    const finalizeSubmit = document.getElementById("finalizeSubmit");
    const finalizeCancel = document.getElementById("finalizeCancel");
    const finalizeError = document.getElementById("finalizeError");

    function finalizar(id) {
        finalizeSvcId.value = id;
        finalizeResolucion.value = "";
        finalizeError.textContent = "";
        openModal(finalizeBack);
        setTimeout(() => finalizeResolucion.focus(), 50);
    }
    function cerrarFinalize() {
        closeModal(finalizeBack);
        finalizeError.textContent = "";
    }
    finalizeCancel.addEventListener("click", cerrarFinalize);
    finalizeBack.addEventListener("click", (e) => { if (e.target === finalizeBack) cerrarFinalize(); });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && finalizeBack.classList.contains("show")) cerrarFinalize();
    });
    finalizeForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        finalizeError.textContent = "";
        const id = parseInt(finalizeSvcId.value, 10);
        const resolucion = finalizeResolucion.value.trim();
        if (!resolucion) { finalizeError.textContent = "La resolución es obligatoria."; return; }
        finalizeSubmit.disabled = true;
        const original = finalizeSubmit.textContent;
        finalizeSubmit.textContent = "Finalizando…";
        try {
            const res = await fetch(`${API_BASE}/api/servicios/${id}/finalizar`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ resolucion }),
            });
            if (res.status === 401) { showLogin(); return; }
            const body = await res.json();
            if (!res.ok || !body.ok) throw new Error(body.error || "Error");
            cerrarFinalize();
            toast(`Nota generada: ${body.data.numero_nota}`, "success");
            listar();
            if (clientHistory.dataset.cliente) {
                cargarHistorial(clientHistory.dataset.cliente, clientHistory.dataset.nombre);
            }
        } catch (err) {
            finalizeError.textContent = err.message;
        } finally {
            finalizeSubmit.disabled = false;
            finalizeSubmit.textContent = original;
        }
    });

    /* ===== Ajuste ===== */
    let ajusteCurrentId = null;
    function abrirAjuste(id, row) {
        ajusteCurrentId = id;
        ajusteText.value = (row && row.ajuste) || "";
        openModal(ajusteBack);
        setTimeout(() => ajusteText.focus(), 50);
    }
    function cerrarAjuste() {
        closeModal(ajusteBack);
        ajusteCurrentId = null;
        ajusteText.value = "";
    }
    ajusteCancel.addEventListener("click", cerrarAjuste);
    ajusteBack.addEventListener("click", (e) => { if (e.target === ajusteBack) cerrarAjuste(); });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && ajusteBack.classList.contains("show")) cerrarAjuste();
    });
    ajusteForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!ajusteCurrentId) return;
        const valor = ajusteText.value.trim();
        if (!valor) return;
        try {
            const res = await fetch(`${API_BASE}/api/servicios/${ajusteCurrentId}/ajuste`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ ajuste: valor }),
            });
            if (res.status === 401) { showLogin(); return; }
            const body = await res.json();
            if (!res.ok || !body.ok) throw new Error(body.error || "Error");
            cerrarAjuste();
            toast("Ajuste guardado.", "success");
            if (!tabActive.hidden) listar();
            if (clientHistory.dataset.cliente) {
                cargarHistorial(clientHistory.dataset.cliente, clientHistory.dataset.nombre);
            }
        } catch (err) {
            toast(err.message, "error");
        }
    });

    /* ===== Búsqueda clientes (solo cuando el usuario escribe) ===== */
    let searchTimer = null;
    function buscarClientesDebounced(q) {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => buscarClientes(q), 250);
    }
    async function buscarClientes(q) {
        const query = String(q || "").trim();
        if (!query) {
            clearSearchResults();
            return;
        }
        clientResults.innerHTML = '<div class="svc-empty"><span class="svc-loader"></span>Buscando…</div>';
        clientHistory.hidden = true;
        clientResults.hidden = false;
        try {
            const url = `${API_BASE}/api/clientes?q=${encodeURIComponent(query)}`;
            const res = await fetch(url, { credentials: "include" });
            if (res.status === 401) { showLogin(); return; }
            const body = await res.json();
            if (!res.ok || !body.ok) throw new Error(body.error || "Error");
            renderClientes(body.data);
        } catch (err) {
            clientResults.innerHTML = `<div class="svc-empty error">Error: ${escape(err.message)}</div>`;
        }
    }
    function renderClientes(rows) {
        if (!rows.length) {
            clientResults.innerHTML = '<div class="svc-empty">Sin coincidencias.</div>';
            return;
        }
        clientResults.innerHTML = rows.map((c) => `
            <button type="button" class="client-card" data-num="${escape(c.numero_cliente)}" data-name="${escape(c.nombre_cliente || "")}">
                <span class="client-name">${escape(c.nombre_cliente || "Sin nombre")}</span>
                <span class="client-meta">${escape(c.telefono || "Sin teléfono")}${c.total_servicios != null ? ` · ${c.total_servicios} ${c.total_servicios === 1 ? "servicio" : "servicios"}` : ""}</span>
                <span class="client-num">${escape(c.numero_cliente)}</span>
            </button>
        `).join("");
        clientResults.querySelectorAll(".client-card").forEach((el) =>
            el.addEventListener("click", () => cargarHistorial(el.dataset.num, el.dataset.name))
        );
    }
    clientSearch.addEventListener("input", (e) => {
        const v = e.target.value.trim();
        if (!v) {
            clearTimeout(searchTimer);
            clearSearchResults();
            return;
        }
        buscarClientesDebounced(v);
    });

    /* ===== Historial ===== */
    async function cargarHistorial(numero, nombre) {
        clientHistory.dataset.cliente = numero;
        clientHistory.dataset.nombre = nombre || "";
        historyName.textContent = nombre || "Cliente";
        historySub.textContent = `N° ${numero}`;
        clientResults.hidden = true;
        clientHistory.hidden = false;
        historyList.innerHTML = '<div class="svc-empty"><span class="svc-loader"></span>Cargando historial…</div>';
        try {
            await loadTecnicos();
            const res = await fetch(`${API_BASE}/api/servicios/cliente/${encodeURIComponent(numero)}`, { credentials: "include" });
            if (res.status === 401) { showLogin(); return; }
            const body = await res.json();
            if (!res.ok || !body.ok) throw new Error(body.error || "Error");
            renderServicios(body.data, historyList, {
                showCount: true,
                allowAjuste: true,
                allowFinalizar: true,
                emptyMsg: "Sin servicios registrados.",
            });
        } catch (err) {
            historyList.innerHTML = `<div class="svc-empty error">Error: ${escape(err.message)}</div>`;
        }
    }
    historyBack.addEventListener("click", () => {
        clientHistory.hidden = true;
        clientResults.hidden = false;
        delete clientHistory.dataset.cliente;
        delete clientHistory.dataset.nombre;
    });

    /* ===== Editar servicio (admin) ===== */
    const editSvcBack = document.getElementById("editSvcBack");
    const editSvcForm = document.getElementById("editSvcForm");
    const editSvcId = document.getElementById("editSvcId");
    const editNombre = document.getElementById("editNombre");
    const editTelefono = document.getElementById("editTelefono");
    const editDireccion = document.getElementById("editDireccion");
    const editLat = document.getElementById("editLat");
    const editLng = document.getElementById("editLng");
    const editConceptos = document.getElementById("editConceptos");
    const editTotal = document.getElementById("editTotal");
    const editTecnico = document.getElementById("editTecnico");
    const editSvcCancel = document.getElementById("editSvcCancel");
    const editSvcError = document.getElementById("editSvcError");

    function abrirEditServicio(r) {
        if (!r) return;
        editSvcError.textContent = "";
        editSvcId.value = r.id;
        editNombre.value = r.nombre_cliente || "";
        editTelefono.value = r.telefono || "";
        editDireccion.value = r.direccion || "";
        editLat.value = r.lat != null ? r.lat : "";
        editLng.value = r.lng != null ? r.lng : "";
        editConceptos.value = r.conceptos || "";
        editTotal.value = Number(r.total) || 0;
        const ep = document.getElementById("editTotalPreview");
        if (ep) ep.textContent = money(editTotal.value);

        // Poblar select técnicos
        editTecnico.innerHTML = tecnicosCache
            .filter((t) => t.activo)
            .map((t) => `<option value="${escape(t.usuario)}" ${t.usuario === r.tecnico_asignado ? "selected" : ""}>${escape(t.usuario)}${typeof t.carga === "number" ? ` (${t.carga})` : ""}</option>`)
            .join("");

        openModal(editSvcBack);
        setTimeout(() => editNombre.focus(), 50);
    }
    function cerrarEditServicio() {
        closeModal(editSvcBack);
        editSvcError.textContent = "";
    }
    editSvcCancel.addEventListener("click", cerrarEditServicio);
    editSvcBack.addEventListener("click", (e) => { if (e.target === editSvcBack) cerrarEditServicio(); });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && editSvcBack.classList.contains("show")) cerrarEditServicio();
    });
    editSvcForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        editSvcError.textContent = "";
        const id = parseInt(editSvcId.value, 10);
        const payload = {
            nombre_cliente: editNombre.value.trim(),
            telefono: editTelefono.value.trim() || null,
            direccion: editDireccion.value.trim() || null,
            lat: editLat.value || null,
            lng: editLng.value || null,
            conceptos: editConceptos.value.trim(),
            total: editTotal.value,
            tecnico_asignado: editTecnico.value || null,
        };
        try {
            const res = await fetch(`${API_BASE}/api/servicios/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(payload),
            });
            if (res.status === 401) { showLogin(); return; }
            const body = await res.json();
            if (!res.ok || !body.ok) throw new Error(body.error || "Error");
            cerrarEditServicio();
            toast("Servicio actualizado.", "success");
            listar();
        } catch (err) {
            editSvcError.textContent = err.message;
        }
    });

    async function eliminarServicio(id, r) {
        const nombre = r ? r.nombre_cliente : "este servicio";
        const esTerminado = r && String(r.estado).toUpperCase() === "TERMINADO";
        const msg = esTerminado
            ? `¿Eliminar el servicio TERMINADO de "${nombre}"? La nota generada (${r.numero_nota || "—"}) NO se borra y queda disponible para el cliente. El servicio dejará de aparecer en el panel.`
            : `¿Seguro que deseas eliminar el servicio de "${nombre}"?`;
        const ok = await confirmDialog(msg);
        if (!ok) return;
        try {
            const res = await fetch(`${API_BASE}/api/servicios/${id}`, {
                method: "DELETE",
                credentials: "include",
            });
            if (res.status === 401) { showLogin(); return; }
            const body = await res.json();
            if (!res.ok || !body.ok) throw new Error(body.error || "Error");
            toast("Servicio eliminado.", "success");
            listar();
        } catch (err) {
            toast(err.message, "error");
        }
    }

    /* ===== Ver nota / Descargar PDF / Reabrir ===== */
    const notaBack = document.getElementById("notaBack");
    const notaBody = document.getElementById("notaBody");
    const notaClose = document.getElementById("notaClose");
    const notaDownload = document.getElementById("notaDownload");
    let notaCurrent = null; // datos de la última nota cargada

    async function fetchNota(servicioId) {
        const res = await fetch(`${API_BASE}/api/servicios/${servicioId}/nota`, { credentials: "include" });
        if (res.status === 401) { showLogin(); throw new Error("No autorizado"); }
        const body = await res.json();
        if (!res.ok || !body.ok) throw new Error(body.error || "Error");
        return body.data;
    }

    function notaToPdf(d) {
        const id = String(d.numero_nota || d.id);
        const fechaStr = (() => {
            if (!d.fecha) return "—";
            const dt = new Date(d.fecha);
            if (isNaN(dt.getTime())) return String(d.fecha);
            return dt.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
        })();
        const conceptosTxt = String(d.conceptos || "");
        const items = [{ concept: conceptosTxt || "Servicio", amount: Number(d.total) || 0 }];
        return {
            id,
            filename: `${id}.pdf`,
            customerId: String(d.numero_cliente || ""),
            date: fechaStr,
            name: d.nombre_cliente || "Cliente",
            phone: d.telefono || "—",
            service: "Nota de servicio",
            message: conceptosTxt,
            items,
        };
    }

    async function abrirNota(servicioId) {
        notaBody.innerHTML = '<div class="svc-empty"><span class="svc-loader"></span>Cargando…</div>';
        openModal(notaBack);
        try {
            const d = await fetchNota(servicioId);
            notaCurrent = d;
            notaBody.innerHTML = `
                <div class="row"><span class="lbl">Nota</span><span class="val">${escape(d.numero_nota || d.id)}</span></div>
                <div class="row"><span class="lbl">Cliente</span><span class="val">${escape(d.nombre_cliente || "—")}</span></div>
                <div class="row"><span class="lbl">N° cliente</span><span class="val">${escape(d.numero_cliente || "—")}</span></div>
                <div class="row"><span class="lbl">Teléfono</span><span class="val">${escape(d.telefono || "—")}</span></div>
                <div class="row"><span class="lbl">Fecha</span><span class="val">${escape(fechaCorta(d.fecha))}</span></div>
                <div class="row"><span class="lbl">Estado</span><span class="val">${escape(d.estado || "—")}</span></div>
                <div class="conceptos-block">${escape(d.conceptos || "—")}</div>
                <div class="row"><span class="lbl">Total</span><span class="val total-big">${money(d.total)}</span></div>
            `;
        } catch (err) {
            notaBody.innerHTML = `<div class="svc-empty error">${escape(err.message)}</div>`;
            notaCurrent = null;
        }
    }
    notaClose.addEventListener("click", () => closeModal(notaBack));
    notaBack.addEventListener("click", (e) => { if (e.target === notaBack) closeModal(notaBack); });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && notaBack.classList.contains("show")) closeModal(notaBack);
    });
    notaDownload.addEventListener("click", () => {
        if (!notaCurrent) { toast("Carga la nota primero.", "error"); return; }
        if (window.AlasPDF) window.AlasPDF.generate(notaToPdf(notaCurrent));
        else toast("Generador de PDF no disponible.", "error");
    });

    async function descargarNotaPdf(servicioId) {
        try {
            const d = await fetchNota(servicioId);
            if (window.AlasPDF) {
                window.AlasPDF.generate(notaToPdf(d));
            } else {
                toast("Generador de PDF no disponible.", "error");
            }
        } catch (err) {
            toast(err.message, "error");
        }
    }

    async function reabrirServicio(id, r) {
        const nombre = r ? r.nombre_cliente : "este servicio";
        const ok = await confirmDialog(`¿Reabrir el servicio de "${nombre}"? Volverá al estado PENDIENTE. La nota generada se conserva.`);
        if (!ok) return;
        try {
            const res = await fetch(`${API_BASE}/api/servicios/${id}/reabrir`, {
                method: "POST",
                credentials: "include",
            });
            if (res.status === 401) { showLogin(); return; }
            const body = await res.json();
            if (!res.ok || !body.ok) throw new Error(body.error || "Error");
            toast("Servicio reabierto.", "success");
            // Cambia al tab Activos automáticamente
            estadoFiltro = "ACTIVOS";
            estadoBtns.forEach((x) => x.classList.toggle("is-active", x.dataset.estado === "ACTIVOS"));
            listar();
        } catch (err) {
            toast(err.message, "error");
        }
    }

    /* ===== Polling lista activos (auto-refresh sin recargar) ===== */
    const POLL_INTERVAL_MS = 20000;
    let pollTimer = null;
    function isAnyModalOpen() {
        return (confirmBack && confirmBack.classList.contains("show")) ||
               (ajusteBack && ajusteBack.classList.contains("show")) ||
               (passBack && passBack.classList.contains("show")) ||
               (editSvcBack && editSvcBack.classList.contains("show")) ||
               (editUserBack && editUserBack.classList.contains("show")) ||
               (notaBack && notaBack.classList.contains("show")) ||
               (finalizeBack && finalizeBack.classList.contains("show"));
    }
    function shouldPoll() {
        return !document.hidden &&
               !dashSection.hidden &&
               !tabActive.hidden &&
               !isAnyModalOpen();
    }
    async function pollTick() {
        if (!shouldPoll()) return;
        try {
            await loadTecnicos();
            const url = `${API_BASE}/api/servicios${scope === "mine" ? "?mine=1" : ""}`;
            const res = await fetch(url, { credentials: "include" });
            if (res.status === 401) return;
            const body = await res.json();
            if (!res.ok || !body.ok) return;
            renderServicios(body.data, svcList, {
                emptyMsg: scope === "mine" ? "No tienes servicios asignados." : "Sin servicios activos por el momento.",
            });
        } catch {}
    }
    function startPolling() {
        if (pollTimer) return;
        pollTimer = setInterval(pollTick, POLL_INTERVAL_MS);
    }
    function stopPolling() {
        if (!pollTimer) return;
        clearInterval(pollTimer);
        pollTimer = null;
    }
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) return;
        if (!dashSection.hidden) pollTick();
    });

    /* =====================================================
       MÓDULO USUARIOS (solo admin)
       ===================================================== */
    const userForm = document.getElementById("userForm");
    const userNew = document.getElementById("userNew");
    const passNew = document.getElementById("passNew");
    const rolNew = document.getElementById("rolNew");
    const telNew = document.getElementById("telNew");
    const userSubmit = document.getElementById("userSubmit");
    const userError = document.getElementById("userError");
    const usuariosRefresh = document.getElementById("usuariosRefresh");

    const passBack = document.getElementById("passBack");
    const passForm = document.getElementById("passForm");
    const passInput = document.getElementById("passInput");
    const passSubtitle = document.getElementById("passSubtitle");
    const passCancel = document.getElementById("passCancel");
    const passError = document.getElementById("passError");

    let usuariosCache = [];
    let passUserId = null;

    function fechaCortaCalc(f) { return fechaCorta(f); }

    function isSelf(u) {
        return currentUser && currentUser.usuario && u.usuario === currentUser.usuario;
    }

    async function loadUsuarios() {
        userList.innerHTML = '<div class="svc-empty"><span class="svc-loader"></span>Cargando usuarios…</div>';
        try {
            const res = await fetch(`${API_BASE}/api/admin/usuarios`, { credentials: "include" });
            if (res.status === 401) { showLogin(); return; }
            if (res.status === 403) {
                userList.innerHTML = '<div class="svc-empty">Requiere rol admin.</div>';
                return;
            }
            const body = await res.json();
            if (!res.ok || !body.ok) throw new Error(body.error || "Error");
            usuariosCache = body.data || [];
            renderUsuarios(usuariosCache);
        } catch (err) {
            userList.innerHTML = `<div class="svc-empty error">Error: ${escape(err.message)}</div>`;
        }
    }

    function renderUsuarios(rows) {
        if (!rows.length) {
            userList.innerHTML = '<div class="svc-empty">Sin usuarios registrados.</div>';
            return;
        }
        userList.innerHTML = `<div class="user-list">${rows.map((u) => {
            const self = isSelf(u);
            const activo = !!u.activo;
            return `
                <div class="user-row ${self ? "is-self" : ""} ${!activo ? "is-inactive" : ""}" data-id="${u.id}" data-usuario="${escape(u.usuario)}">
                    <div class="user-main">
                        <span class="user-name">${escape(u.usuario)}</span>
                        ${self ? '<span class="user-self-tag">tú</span>' : ""}
                        <span class="rol-badge ${u.rol === "admin" ? "admin" : "tecnico"}">${escape(u.rol || "tecnico")}</span>
                        <span class="estado-badge ${activo ? "on" : "off"}">${activo ? "activo" : "inactivo"}</span>
                    </div>
                    <div class="user-meta">
                        📱 ${u.telefono ? escape(u.telefono) : '<span style="color:var(--color-silver-3)">sin teléfono</span>'}
                        · Creado: ${escape(fechaCortaCalc(u.fecha_creacion))}
                    </div>
                    <div class="user-controls">
                        <button type="button" class="user-btn" data-action="edit">Editar</button>
                        <button type="button" class="user-btn" data-action="password">Contraseña</button>
                        <button type="button" class="user-btn ${activo ? "danger" : ""}" data-action="toggle" ${self ? "disabled" : ""}>
                            ${activo ? "Desactivar" : "Activar"}
                        </button>
                    </div>
                </div>
            `;
        }).join("")}</div>`;

        userList.querySelectorAll(".user-row").forEach((row) => {
            const id = parseInt(row.dataset.id, 10);
            const usuario = row.dataset.usuario;
            row.querySelector('button[data-action="edit"]').addEventListener("click", () => {
                const u = usuariosCache.find((x) => x.id === id);
                if (u) abrirEditUsuario(u);
            });
            row.querySelector('button[data-action="password"]').addEventListener("click", () => {
                abrirPasswordModal(id, usuario);
            });
            row.querySelector('button[data-action="toggle"]').addEventListener("click", () => {
                const u = usuariosCache.find((x) => x.id === id);
                if (u) toggleActivo(id, usuario, !u.activo);
            });
        });
    }

    async function cambiarRol(id, usuario, rol) {
        try {
            const res = await fetch(`${API_BASE}/api/admin/usuarios/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ rol }),
            });
            if (res.status === 401) { showLogin(); return; }
            const body = await res.json();
            if (!res.ok || !body.ok) throw new Error(body.error || "Error");
            toast(`Rol de ${usuario} actualizado a ${rol}.`, "success");
            loadUsuarios();
        } catch (err) {
            toast(err.message, "error");
            loadUsuarios();
        }
    }

    /* ===== Modal editar usuario completo ===== */
    const editUserBack = document.getElementById("editUserBack");
    const editUserForm = document.getElementById("editUserForm");
    const editUserId = document.getElementById("editUserId");
    const editUserName = document.getElementById("editUserName");
    const editUserRol = document.getElementById("editUserRol");
    const editUserTel = document.getElementById("editUserTel");
    const editUserActivo = document.getElementById("editUserActivo");
    const editUserCancel = document.getElementById("editUserCancel");
    const editUserError = document.getElementById("editUserError");
    let editUserOriginalUsuario = "";

    function abrirEditUsuario(u) {
        editUserError.textContent = "";
        editUserId.value = u.id;
        editUserName.value = u.usuario || "";
        editUserRol.value = u.rol === "admin" ? "admin" : "tecnico";
        editUserTel.value = u.telefono || "";
        editUserActivo.checked = !!u.activo;
        editUserOriginalUsuario = u.usuario || "";

        // Auto-protección: si es la sesión actual, deshabilita rol y activo
        const self = currentUser && currentUser.usuario === u.usuario;
        editUserRol.disabled = !!self;
        editUserActivo.disabled = !!self;

        openModal(editUserBack);
        setTimeout(() => editUserName.focus(), 50);
    }
    function cerrarEditUsuario() {
        closeModal(editUserBack);
        editUserError.textContent = "";
    }
    editUserCancel.addEventListener("click", cerrarEditUsuario);
    editUserBack.addEventListener("click", (e) => { if (e.target === editUserBack) cerrarEditUsuario(); });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && editUserBack.classList.contains("show")) cerrarEditUsuario();
    });
    editUserForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        editUserError.textContent = "";
        const id = parseInt(editUserId.value, 10);
        const payload = {
            usuario: editUserName.value.trim(),
            rol: editUserRol.value,
            telefono: editUserTel.value.trim() || null,
            activo: editUserActivo.checked,
        };
        if (!payload.usuario) { editUserError.textContent = "Usuario requerido."; return; }
        try {
            const res = await fetch(`${API_BASE}/api/admin/usuarios/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(payload),
            });
            if (res.status === 401) { showLogin(); return; }
            const body = await res.json();
            if (!res.ok || !body.ok) throw new Error(body.error || "Error");
            cerrarEditUsuario();
            const renamed = payload.usuario !== editUserOriginalUsuario;
            toast(renamed ? `Usuario renombrado a "${payload.usuario}".` : "Usuario actualizado.", "success");
            // Si me renombré a mí mismo, refresco sesión
            if (currentUser && currentUser.usuario === editUserOriginalUsuario && renamed) {
                currentUser.usuario = payload.usuario;
                applyUserContext(currentUser);
            }
            loadUsuarios();
            loadTecnicos();
            listar();
        } catch (err) {
            editUserError.textContent = err.message;
        }
    });

    async function editarTelefono(id, usuario, telActual) {
        const valor = window.prompt(`Teléfono WhatsApp para "${usuario}" (10 dígitos sin lada):`, telActual || "");
        if (valor === null) return;
        const limpio = String(valor).trim();
        try {
            const res = await fetch(`${API_BASE}/api/admin/usuarios/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ telefono: limpio }),
            });
            if (res.status === 401) { showLogin(); return; }
            const body = await res.json();
            if (!res.ok || !body.ok) throw new Error(body.error || "Error");
            toast(`Teléfono de ${usuario} actualizado.`, "success");
            loadUsuarios();
            loadTecnicos();
        } catch (err) {
            toast(err.message, "error");
        }
    }

    async function toggleActivo(id, usuario, nuevoEstado) {
        const accion = nuevoEstado ? "activar" : "desactivar";
        const ok = await confirmDialog(`¿${accion[0].toUpperCase() + accion.slice(1)} al usuario "${usuario}"?`);
        if (!ok) return;
        try {
            const res = await fetch(`${API_BASE}/api/admin/usuarios/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ activo: nuevoEstado }),
            });
            if (res.status === 401) { showLogin(); return; }
            const body = await res.json();
            if (!res.ok || !body.ok) throw new Error(body.error || "Error");
            toast(`Usuario ${usuario} ${nuevoEstado ? "activado" : "desactivado"}.`, "success");
            loadUsuarios();
        } catch (err) {
            toast(err.message, "error");
        }
    }

    function abrirPasswordModal(id, usuario) {
        passUserId = id;
        passSubtitle.textContent = `Establece una nueva contraseña para "${usuario}".`;
        passInput.value = "";
        passError.textContent = "";
        openModal(passBack);
        setTimeout(() => passInput.focus(), 50);
    }
    function cerrarPasswordModal() {
        closeModal(passBack);
        passUserId = null;
        passInput.value = "";
        passError.textContent = "";
    }
    passCancel.addEventListener("click", cerrarPasswordModal);
    passBack.addEventListener("click", (e) => { if (e.target === passBack) cerrarPasswordModal(); });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && passBack.classList.contains("show")) cerrarPasswordModal();
    });
    passForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        passError.textContent = "";
        if (!passUserId) return;
        const value = passInput.value;
        if (value.length < 6) {
            passError.textContent = "Mínimo 6 caracteres.";
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/api/admin/usuarios/${passUserId}/password`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ password: value }),
            });
            if (res.status === 401) { showLogin(); return; }
            const body = await res.json();
            if (!res.ok || !body.ok) throw new Error(body.error || "Error");
            cerrarPasswordModal();
            toast("Contraseña actualizada.", "success");
        } catch (err) {
            passError.textContent = err.message;
        }
    });

    // Crear usuario
    userForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        userError.textContent = "";
        const u = userNew.value.trim();
        const p = passNew.value;
        const r = rolNew.value;
        if (!u) { userError.textContent = "Usuario requerido."; return; }
        if (p.length < 6) { userError.textContent = "Contraseña mínimo 6 caracteres."; return; }

        userSubmit.disabled = true;
        const original = userSubmit.textContent;
        userSubmit.textContent = "Creando…";
        try {
            const res = await fetch(`${API_BASE}/api/admin/usuarios`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    usuario: u,
                    password: p,
                    rol: r,
                    telefono: telNew.value.trim() || null,
                }),
            });
            if (res.status === 401) { showLogin(); return; }
            const body = await res.json();
            if (!res.ok || !body.ok) throw new Error(body.error || "Error");
            toast(`Usuario "${u}" creado.`, "success");
            userForm.reset();
            rolNew.value = "tecnico";
            loadUsuarios();
        } catch (err) {
            userError.textContent = err.message;
        } finally {
            userSubmit.disabled = false;
            userSubmit.textContent = original;
        }
    });

    usuariosRefresh.addEventListener("click", loadUsuarios);

    checkSession();
})();

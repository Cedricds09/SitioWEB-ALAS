/* =====================================================
   MÓDULO PRESUPUESTOS — Frontend del panel admin.
   Hereda estilos/patrones de main.js (modales, toast, fetch con cookies).
   Se inicializa al recibir el evento `alas:session-ready` desde main.js.
   ===================================================== */
(() => {
    const API_BASE = "";

    // Activo solo en /admin (igual que el resto del panel).
    if (window.location.pathname !== "/admin") return;

    /* ---------- Helpers ---------- */
    function $(id) { return document.getElementById(id); }
    function escape(s) {
        return String(s == null ? "" : s)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\"", "&quot;");
    }
    function fmtMoney(n) {
        const num = Number(n) || 0;
        const isWhole = Math.abs(num - Math.round(num)) < 0.005;
        return "$" + num.toLocaleString("es-MX", {
            minimumFractionDigits: isWhole ? 0 : 2,
            maximumFractionDigits: 2,
        });
    }
    function fmtFecha(f) {
        if (!f) return "—";
        const d = new Date(f);
        if (isNaN(d.getTime())) return String(f);
        return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
    }
    function toast(msg, kind) {
        const t = document.getElementById("toast");
        if (!t) { console.log("[TOAST]", msg); return; }
        t.querySelector(".toast-msg").textContent = msg;
        t.classList.remove("ok", "error");
        t.classList.add("show", kind === "error" ? "error" : "ok");
        clearTimeout(toast._t);
        toast._t = setTimeout(() => t.classList.remove("show"), 3500);
    }
    function openModal(back) { back && back.classList.add("show"); }
    function closeModal(back) { back && back.classList.remove("show"); }
    async function api(path, opts) {
        const res = await fetch(API_BASE + path, {
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            ...opts,
        });
        if (res.status === 401) {
            toast("Sesión expirada. Vuelve a iniciar sesión.", "error");
            throw new Error("No autorizado");
        }
        let body = null;
        try { body = await res.json(); } catch { /* puede ser PDF u otro */ }
        if (!res.ok || (body && body.ok === false)) {
            throw new Error((body && body.error) || `HTTP ${res.status}`);
        }
        return body;
    }

    /* ---------- State ---------- */
    const state = {
        sesion: null,
        items: [],
        filtroEstado: "activos", // activos | solicitud | aprobado | convertido | rechazado
        filtroScope: "all",      // all | mine
        searchTerm: "",
        currentPres: null,       // presupuesto en edición
        nextLocalKey: 1,
        tecnicosCache: null,     // cache de la lista de técnicos
        isDirty: false,          // hay cambios sin guardar en el editor
    };

    function markDirty() { state.isDirty = true; }
    function clearDirty() { state.isDirty = false; }
    function confirmDiscardIfDirty() {
        if (!state.isDirty) return true;
        return window.confirm(
            "Tienes cambios sin guardar. ¿Salir y descartarlos?"
        );
    }
    function tryCloseEditor() {
        if (!confirmDiscardIfDirty()) return;
        clearDirty();
        closeModal(presEditorBack);
    }

    // Devuelve técnicos activos (con id) — necesita /usuarios (admin only) porque
    // /usuarios/tecnicos no devuelve id.
    // Cachea solo cuando la lista tiene >=1 elemento (no cachear errores transientes).
    async function getTecnicos() {
        if (state.tecnicosCache && state.tecnicosCache.length) return state.tecnicosCache;
        try {
            const body = await api("/api/admin/usuarios");
            const tecnicos = (body.data || []).filter((u) => u.activo && u.rol === "tecnico");
            if (tecnicos.length) state.tecnicosCache = tecnicos;
            return tecnicos;
        } catch (err) {
            console.warn("[PRES] No se pudo cargar lista de técnicos:", err);
            return [];
        }
    }

    /* ---------- DOM refs ---------- */
    const presSection = $("presupuestosSection");
    const presList = $("presList");
    const presBandejaTag = $("presBandejaTag");
    const presBandejaCount = $("presBandejaCount");
    const presRefresh = $("presRefresh");
    const presNuevoBtn = $("presNuevo");
    const presSearch = $("presSearch");
    const presScopeWrap = $("presScopeWrap");

    // Editor
    const presEditorBack = $("presEditorBack");
    const presEditorClose = $("presEditorClose");
    const presEditorTitle = $("presEditorTitle");
    const presEditorFolio = $("presEditorFolio");
    const presEditorEstado = $("presEditorEstado");
    const presEditorReadonly = $("presEditorReadonly");
    const presEditorError = $("presEditorError");
    const presClienteForm = $("presClienteForm");
    const presClienteNombre = $("presClienteNombre");
    const presClienteTelefono = $("presClienteTelefono");
    const presClienteDireccion = $("presClienteDireccion");
    const presClienteDestinatario = $("presClienteDestinatario");
    const presTipoServicio = $("presTipoServicio");
    const presVigencia = $("presVigencia");
    const presAdelanto = $("presAdelanto");
    const presIntroduccion = $("presIntroduccion");
    const presNotasInternas = $("presNotasInternas");
    const presAsignadoLabel = $("presAsignadoLabel");
    const presAsignadoSelect = $("presAsignadoSelect");
    const presBloquesList = $("presBloquesList");
    const presAddBloqueBtn = $("presAddBloqueBtn");
    const presFootTotal = $("presFootTotal");
    const presFootActions = $("presFootActions");

    // Tipo bloque selector
    const presTipoBlBack = $("presTipoBlBack");
    const presTipoBlCancel = $("presTipoBlCancel");

    // Si los elementos no existen, salir silenciosamente.
    if (!presSection) return;

    /* ---------- Inicialización via evento de sesión ---------- */
    document.addEventListener("alas:session-ready", (e) => {
        state.sesion = e.detail;
        if (!state.sesion) {
            presSection.hidden = true;
            state.tecnicosCache = null;
            return;
        }
        presSection.hidden = false;
        // Scope filter solo visible para admin (técnicos siempre ven los suyos).
        const isAdmin = state.sesion.rol === "admin";
        presScopeWrap.hidden = !isAdmin;
        if (!isAdmin) {
            state.filtroScope = "mine";
        }
        // Precalentar cache de técnicos para que dropdown reasignación esté listo
        // cuando admin abra el primer editor.
        if (isAdmin) getTecnicos();
        loadList();
    });

    /* ---------- Listar presupuestos ---------- */

    async function loadList() {
        presList.innerHTML = '<div class="pres-empty">Cargando…</div>';
        try {
            const params = new URLSearchParams();

            // Filtro de estado:
            // 'activos' = todos menos terminales (solicitud/borrador/enviado/aprobado).
            // Otros valores = ese estado puntual.
            if (state.filtroEstado === "activos") {
                params.set("estado", "solicitud,borrador,enviado,aprobado");
            } else {
                params.set("estado", state.filtroEstado);
            }
            if (state.filtroScope === "mine") params.set("mine", "1");
            if (state.searchTerm) params.set("cliente", state.searchTerm);

            const body = await api("/api/presupuestos?" + params.toString());
            state.items = body.data || [];
            renderList();
        } catch (err) {
            presList.innerHTML = `<div class="pres-error">Error: ${escape(err.message)}</div>`;
        }
    }

    function renderList() {
        // Bandeja de solicitudes (count)
        const solicitudes = state.items.filter((p) => p.estado === "solicitud").length;
        if (solicitudes > 0) {
            presBandejaTag.hidden = false;
            presBandejaCount.textContent = solicitudes;
        } else {
            presBandejaTag.hidden = true;
        }

        if (!state.items.length) {
            presList.innerHTML = '<div class="pres-empty">Sin presupuestos para los filtros actuales.</div>';
            return;
        }

        const html = state.items.map((p) => {
            const isSol = p.estado === "solicitud";
            const asignadoTag = p.asignado_a_nombre
                ? `<span class="pres-asignado-tag">Asignado a: <strong>${escape(p.asignado_a_nombre)}</strong></span>`
                : `<span class="pres-asignado-tag is-empty">Sin asignar</span>`;
            return `
                <div class="pres-row ${isSol ? "is-solicitud" : ""}" data-id="${p.id}">
                    <span class="pres-row-folio">${escape(p.numero_presupuesto)}</span>
                    <span class="pres-row-cliente">${escape(p.cliente_nombre)}</span>
                    <span class="pres-row-total">${fmtMoney(p.total_general)}</span>
                    <div class="pres-row-meta">
                        <span class="estado-badge pres-estado-badge ${p.estado}">${p.estado}</span>
                        ${asignadoTag}
                        ${p.tipo_servicio ? `<span><strong>Servicio:</strong> ${escape(p.tipo_servicio)}</span>` : ""}
                        <span><strong>Fecha:</strong> ${escape(fmtFecha(p.fecha_documento || p.fecha_creacion))}</span>
                        ${p.fuente === "formulario_publico" ? '<span>📩 Solicitud web</span>' : ""}
                    </div>
                </div>
            `;
        }).join("");
        presList.innerHTML = html;

        presList.querySelectorAll(".pres-row").forEach((row) => {
            row.addEventListener("click", () => {
                openEditor(parseInt(row.dataset.id, 10));
            });
        });
    }

    presRefresh && presRefresh.addEventListener("click", loadList);

    presNuevoBtn && presNuevoBtn.addEventListener("click", () => openEditor(null));

    // Filtros estado
    presSection.querySelectorAll('[data-pres-estado]').forEach((btn) => {
        btn.addEventListener("click", () => {
            presSection.querySelectorAll('[data-pres-estado]').forEach((b) => b.classList.toggle("is-active", b === btn));
            state.filtroEstado = btn.dataset.presEstado;
            loadList();
        });
    });
    // Filtros scope
    presSection.querySelectorAll('[data-pres-scope]').forEach((btn) => {
        btn.addEventListener("click", () => {
            presSection.querySelectorAll('[data-pres-scope]').forEach((b) => b.classList.toggle("is-active", b === btn));
            state.filtroScope = btn.dataset.presScope;
            loadList();
        });
    });
    // Búsqueda con debounce
    let searchTimer = null;
    presSearch && presSearch.addEventListener("input", (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            state.searchTerm = e.target.value.trim();
            loadList();
        }, 300);
    });

    /* ---------- Editor ---------- */

    function nuevoPresupuestoLocal() {
        return {
            id: null,
            numero_presupuesto: "(nuevo)",
            estado: "borrador",
            fuente: "admin",
            cliente_nombre: "",
            cliente_telefono: "",
            cliente_direccion: "",
            cliente_destinatario: "",
            tipo_servicio: "",
            vigencia_dias: 7,
            adelanto_porcentaje: 0,
            introduccion: "",
            notas_internas: "",
            total_general: 0,
            bloques: [],
        };
    }

    async function openEditor(id) {
        presEditorError.textContent = "";
        if (id) {
            try {
                const body = await api("/api/presupuestos/" + id);
                state.currentPres = body.data;
                // Asegurar shape de bloques con local keys para el render
                state.currentPres.bloques = (state.currentPres.bloques || []).map((b) => normalizarBloqueDesdeBackend(b));
            } catch (err) {
                toast("No se pudo cargar el presupuesto: " + err.message, "error");
                return;
            }
        } else {
            state.currentPres = nuevoPresupuestoLocal();
        }
        renderEditor();
        openModal(presEditorBack);
    }

    function normalizarBloqueDesdeBackend(b) {
        // El backend guarda lista_vinetas/garantias como JSON en contenido_texto.
        const out = {
            _key: state.nextLocalKey++,
            id: b.id,
            tipo: b.tipo,
            titulo: b.titulo || "",
            contenido_texto: b.contenido_texto || "",
            subtotal: b.subtotal != null ? Number(b.subtotal) : 0,
            vinetas: [],
            garantias: [],
            items: (b.items || []).map((it) => ({
                id: it.id,
                descripcion: it.descripcion || "",
                cantidad: Number(it.cantidad) || 1,
                precio_unitario: Number(it.precio_unitario) || 0,
                es_opcional: !!it.es_opcional,
            })),
        };
        if (b.tipo === "lista_vinetas") {
            try { out.vinetas = JSON.parse(b.contenido_texto || "[]"); } catch { out.vinetas = []; }
        } else if (b.tipo === "garantias") {
            try { out.garantias = JSON.parse(b.contenido_texto || "[]"); } catch { out.garantias = []; }
        }
        return out;
    }

    // Banner contextual del editor según razón del read-only.
    // - solicitud sin atender: violeta info.
    // - estado terminal/enviado: amarillo warning.
    // - técnico viendo presupuesto ajeno: gris info.
    function renderBanner(p, editable) {
        if (editable && p.id != null && state.sesion && state.sesion.rol === "admin"
            && p.estado !== "borrador") {
            // Admin editando un presupuesto en estado sensible: warning no bloqueante.
            presEditorReadonly.hidden = false;
            presEditorReadonly.className = "pres-editor-banner is-warning";
            presEditorReadonly.textContent =
                `Este presupuesto ya está en estado "${p.estado}". Como admin puedes editarlo, pero ten cuidado: ya pudo haberse compartido con el cliente.`;
            return;
        }

        if (editable) {
            presEditorReadonly.hidden = true;
            return;
        }

        // No editable — calcular razón.
        presEditorReadonly.hidden = false;
        if (p.estado === "solicitud") {
            presEditorReadonly.className = "pres-editor-banner is-info";
            presEditorReadonly.textContent =
                "Esta solicitud aún no ha sido atendida. Click 'Atender' para convertirla en borrador y empezar a editarla.";
        } else if (state.sesion && state.sesion.rol === "tecnico"
                   && Number(p.asignado_a) !== Number(state.sesion.uid)) {
            const nombre = p.asignado_a_nombre || "otro técnico";
            presEditorReadonly.className = "pres-editor-banner is-muted";
            presEditorReadonly.textContent =
                `Este presupuesto está asignado a ${nombre}. Solo el admin o el técnico asignado pueden editarlo.`;
        } else {
            // Estado terminal/sensible (enviado, aprobado, convertido, rechazado).
            presEditorReadonly.className = "pres-editor-banner is-warning";
            presEditorReadonly.textContent =
                "Este presupuesto ya fue enviado al cliente. No se puede editar para mantener integridad.";
        }
    }

    // Calcula si el editor debe permitir edición.
    // - Nuevo (sin id) → editable.
    // - Admin → editable siempre (aunque estado != borrador, mostramos warning).
    // - Técnico → solo si asignado al uid de sesión Y estado === 'borrador'.
    // Coerción Number(...) en ambos lados: evita type mismatch (uid number vs
    // asignado_a string en algunas rutas de carga).
    function isEditable(p) {
        if (!state.sesion) return false;
        if (p.id == null) return true;
        if (state.sesion.rol === "admin") return true;
        const sameUser = Number(p.asignado_a) === Number(state.sesion.uid);
        return sameUser && p.estado === "borrador";
    }

    function renderEditor() {
        const p = state.currentPres;
        const editable = isEditable(p);

        presEditorTitle.textContent = p.id ? "Editar presupuesto" : "Nuevo presupuesto";
        presEditorFolio.textContent = p.id ? p.numero_presupuesto : "";
        presEditorEstado.textContent = p.estado;
        presEditorEstado.className = `estado-badge pres-estado-badge ${p.estado}`;
        renderBanner(p, editable);
        // Reset dirty state al cargar/refrescar el editor (datos nuevos del backend).
        clearDirty();

        // Cliente
        presClienteNombre.value = p.cliente_nombre || "";
        presClienteTelefono.value = p.cliente_telefono || "";
        presClienteDireccion.value = p.cliente_direccion || "";
        presClienteDestinatario.value = p.cliente_destinatario || "";
        presTipoServicio.value = p.tipo_servicio || "";
        presVigencia.value = p.vigencia_dias || 7;
        presAdelanto.value = p.adelanto_porcentaje || 0;
        presIntroduccion.value = p.introduccion || "";
        presNotasInternas.value = p.notas_internas || "";

        // Disable inputs si no editable
        const inputs = [
            presClienteNombre, presClienteTelefono, presClienteDireccion, presClienteDestinatario,
            presTipoServicio, presVigencia, presAdelanto, presIntroduccion, presNotasInternas,
        ];
        inputs.forEach((el) => { el.disabled = !editable; });
        presAddBloqueBtn.hidden = !editable;

        // Dropdown de reasignación (solo admin)
        renderAsignadoDropdown(p);

        renderBloques();
        renderFooter(editable);
    }

    async function renderAsignadoDropdown(p) {
        const isAdmin = state.sesion && state.sesion.rol === "admin";
        if (!isAdmin) {
            presAsignadoLabel.hidden = true;
            return;
        }
        presAsignadoLabel.hidden = false;
        const tecnicos = await getTecnicos();
        const opciones = ['<option value="">— Sin asignar —</option>']
            .concat(tecnicos.map((t) => {
                // /api/admin/usuarios/tecnicos no devuelve `id`; usamos `usuario` como key.
                // Para mapping a id real, hace falta ir por /api/admin/usuarios. Workaround:
                // pedimos lista completa cuando admin abre dropdown.
                return `<option value="${t.id ?? ''}">${escape(t.usuario)}</option>`;
            }));
        presAsignadoSelect.innerHTML = opciones.join("");
        presAsignadoSelect.value = p.asignado_a != null ? String(p.asignado_a) : "";

        // En modo nuevo (sin id), no se puede reasignar todavía: deshabilitar.
        presAsignadoSelect.disabled = p.id == null;

        presAsignadoSelect.onchange = async () => {
            if (p.id == null) return;
            const v = presAsignadoSelect.value;
            const newId = v === "" ? null : parseInt(v, 10);
            try {
                const body = await api(`/api/presupuestos/${p.id}/reasignar`, {
                    method: "POST",
                    body: JSON.stringify({ asignado_a: newId }),
                });
                state.currentPres.asignado_a = body.data.asignado_a;
                state.currentPres.asignado_a_nombre = body.data.asignado_a_nombre || null;
                toast(newId ? "Reasignado." : "Desasignado.", "ok");
                loadList();
            } catch (err) {
                toast("Error al reasignar: " + err.message, "error");
                presAsignadoSelect.value = p.asignado_a != null ? String(p.asignado_a) : "";
            }
        };
    }

    const TIPO_LABEL = {
        texto: "📝 Cuerpo",
        lista_vinetas: "• Lista",
        garantias: "✓ Garantías",
        apartado_cerrado: "💰 Apartado cerrado",
        seccion_items: "🔢 Sección con items",
    };

    // Auto-select on focus para inputs numéricos en TODO el modal editor
    // (issue 6: defaults 0/1 molestos en cantidad, precio_unitario, subtotal,
    // vigencia, adelanto). Listener delegado.
    if (presEditorBack && !presEditorBack.dataset.focusBound) {
        presEditorBack.dataset.focusBound = "1";
        presEditorBack.addEventListener("focusin", (e) => {
            const t = e.target;
            if (t.tagName === "INPUT" && t.type === "number" && !t.disabled && !t.readOnly) {
                // setTimeout 0 para que pase tras autoFocus del browser.
                setTimeout(() => { try { t.select(); } catch { /* noop */ } }, 0);
            }
        });
        // Dirty state tracking: cualquier input/change marca el editor sucio.
        // Excluimos el dropdown de reasignación (envía cambio inmediato a backend).
        const dirtyHandler = (e) => {
            const t = e.target;
            if (!t || !t.tagName) return;
            if (t.id === "presAsignadoSelect") return;
            if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") {
                markDirty();
            }
        };
        presEditorBack.addEventListener("input", dirtyHandler);
        presEditorBack.addEventListener("change", dirtyHandler);
    }

    function renderBloques() {
        const editable = isEditable(state.currentPres);
        const blocks = state.currentPres.bloques || [];
        if (!blocks.length) {
            presBloquesList.innerHTML = '<div class="pres-empty">Sin bloques. Agrega el primero.</div>';
            return;
        }
        presBloquesList.innerHTML = blocks.map((b, idx) => `
            <div class="pres-bloque-card" data-key="${b._key}">
                <header class="pres-bloque-head">
                    <span class="pres-bloque-tipo">${TIPO_LABEL[b.tipo] || b.tipo}</span>
                    <div class="pres-bloque-actions" ${editable ? "" : 'hidden'}>
                        <button type="button" data-act="up"   title="Subir" ${idx === 0 ? "disabled" : ""}>↑</button>
                        <button type="button" data-act="down" title="Bajar" ${idx === blocks.length - 1 ? "disabled" : ""}>↓</button>
                        <button type="button" data-act="del" class="is-danger" title="Eliminar">🗑️</button>
                    </div>
                </header>
                <div class="pres-bloque-body">
                    ${renderBloqueBody(b, editable)}
                </div>
            </div>
        `).join("");

        // Bind acciones
        presBloquesList.querySelectorAll(".pres-bloque-card").forEach((card) => {
            const key = parseInt(card.dataset.key, 10);
            const idx = blocks.findIndex((b) => b._key === key);
            if (idx === -1) return;
            const bloque = blocks[idx];

            const btnUp = card.querySelector('[data-act="up"]');
            const btnDown = card.querySelector('[data-act="down"]');
            const btnDel = card.querySelector('[data-act="del"]');
            btnUp && btnUp.addEventListener("click", () => moveBloqueByKey(bloque._key, -1));
            btnDown && btnDown.addEventListener("click", () => moveBloqueByKey(bloque._key, +1));
            btnDel && btnDel.addEventListener("click", () => removeBloqueByKey(bloque._key));

            bindBloqueInputs(card, bloque, editable);
        });
    }

    function renderBloqueBody(b, editable) {
        const ro = editable ? "" : "readonly";
        const dis = editable ? "" : "disabled";
        switch (b.tipo) {
            case "texto":
                return `
                    <span class="pres-field-label">Contenido</span>
                    <textarea data-field="contenido_texto" rows="4" ${ro} placeholder="Escribe el párrafo…">${escape(b.contenido_texto)}</textarea>
                `;
            case "lista_vinetas":
                return `
                    <span class="pres-field-label">Viñetas</span>
                    <div class="pres-vinetas-list" data-list="vinetas">
                        ${(b.vinetas.length ? b.vinetas : [""]).map((v, i) => `
                            <div class="pres-vineta-row">
                                <input type="text" data-idx="${i}" value="${escape(v)}" ${ro} placeholder="Viñeta ${i + 1}">
                                <button type="button" data-act="del-vineta" data-idx="${i}" ${dis}>×</button>
                            </div>
                        `).join("")}
                    </div>
                    <button type="button" class="pres-add-vineta" data-act="add-vineta" ${dis}>+ Agregar viñeta</button>
                `;
            case "garantias":
                return `
                    <span class="pres-field-label">Garantías</span>
                    <div class="pres-vinetas-list" data-list="garantias">
                        ${(b.garantias.length ? b.garantias : [""]).map((v, i) => `
                            <div class="pres-vineta-row">
                                <input type="text" data-idx="${i}" value="${escape(v)}" ${ro} placeholder="Garantía ${i + 1}">
                                <button type="button" data-act="del-garantia" data-idx="${i}" ${dis}>×</button>
                            </div>
                        `).join("")}
                    </div>
                    <button type="button" class="pres-add-vineta" data-act="add-garantia" ${dis}>+ Agregar garantía</button>
                `;
            case "apartado_cerrado":
                return `
                    <span class="pres-field-label">Título del apartado</span>
                    <input type="text" data-field="titulo" value="${escape(b.titulo)}" class="pres-titulo-input" ${ro} placeholder="Ej. Instalación de tubería conduit">
                    <span class="pres-field-label">Descripción del trabajo</span>
                    <textarea data-field="contenido_texto" rows="4" ${ro} placeholder="Detalle: alcance, materiales, condiciones…">${escape(b.contenido_texto)}</textarea>
                    <span class="pres-field-label">Subtotal cerrado (MXN)</span>
                    <input type="number" data-field="subtotal" value="${Number(b.subtotal) || 0}" min="0" step="0.01" ${ro}>
                `;
            case "seccion_items":
                return `
                    <span class="pres-field-label">Título de la sección</span>
                    <input type="text" data-field="titulo" value="${escape(b.titulo)}" class="pres-titulo-input" ${ro} placeholder="Ej. Departamento 1">
                    <span class="pres-field-label">Items</span>
                    <div class="pres-items-table">
                        <div class="pres-items-row head">
                            <span>Descripción</span><span>Cant.</span><span>P. Unit.</span><span title="Marcar si el item NO suma al total">Opcional</span><span></span>
                        </div>
                        ${b.items.map((it, i) => `
                            <div class="pres-items-row" data-item-idx="${i}">
                                <input type="text" data-field="descripcion" value="${escape(it.descripcion)}" ${ro} placeholder="Descripción">
                                <input type="number" data-field="cantidad" value="${it.cantidad}" min="1" step="1" ${ro}>
                                <input type="number" data-field="precio_unitario" value="${it.precio_unitario}" min="0" step="0.01" ${ro}>
                                <label class="opt-check" title="Marcar si NO suma al total"><input type="checkbox" data-field="es_opcional" ${it.es_opcional ? "checked" : ""} ${dis}></label>
                                <button type="button" data-act="del-item" ${dis} title="Eliminar item">🗑️</button>
                            </div>
                        `).join("")}
                    </div>
                    <button type="button" class="pres-add-vineta" data-act="add-item" ${dis}>+ Agregar item</button>
                `;
            default:
                return `<em>Tipo no reconocido: ${escape(b.tipo)}</em>`;
        }
    }

    function bindBloqueInputs(card, b, editable) {
        if (!editable) return;

        // Inputs simples (data-field directos en el card body)
        const directFields = card.querySelectorAll('.pres-bloque-body > input[data-field], .pres-bloque-body > textarea[data-field]');
        directFields.forEach((el) => {
            el.addEventListener("input", () => {
                const f = el.getAttribute("data-field");
                if (f === "subtotal") {
                    b.subtotal = Number(el.value) || 0;
                    recalcLocal();
                } else {
                    b[f] = el.value;
                }
            });
        });

        // Listas (vinetas/garantias)
        if (b.tipo === "lista_vinetas" || b.tipo === "garantias") {
            const key = b.tipo === "lista_vinetas" ? "vinetas" : "garantias";
            const list = card.querySelector(`[data-list="${key}"]`);
            list && list.querySelectorAll('input[type="text"]').forEach((inp) => {
                inp.addEventListener("input", () => {
                    const i = parseInt(inp.getAttribute("data-idx"), 10);
                    if (!b[key].length) b[key] = [""];
                    b[key][i] = inp.value;
                });
            });
            list && list.querySelectorAll('[data-act="del-vineta"], [data-act="del-garantia"]').forEach((btn) => {
                btn.addEventListener("click", () => {
                    const i = parseInt(btn.getAttribute("data-idx"), 10);
                    b[key].splice(i, 1);
                    if (!b[key].length) b[key] = [""];
                    renderBloques();
                });
            });
            const addBtn = card.querySelector('[data-act="add-vineta"], [data-act="add-garantia"]');
            addBtn && addBtn.addEventListener("click", () => {
                if (!b[key].length) b[key] = [];
                b[key].push("");
                renderBloques();
            });
        }

        // Items (seccion_items)
        if (b.tipo === "seccion_items") {
            card.querySelectorAll('.pres-items-row[data-item-idx]').forEach((row) => {
                const i = parseInt(row.getAttribute("data-item-idx"), 10);
                const it = b.items[i];
                if (!it) return;
                row.querySelectorAll('input[data-field]').forEach((inp) => {
                    inp.addEventListener("input", () => {
                        const f = inp.getAttribute("data-field");
                        if (inp.type === "checkbox") it[f] = inp.checked;
                        else if (f === "cantidad" || f === "precio_unitario") it[f] = Number(inp.value) || 0;
                        else it[f] = inp.value;
                        if (f === "cantidad" || f === "precio_unitario" || f === "es_opcional") {
                            recalcLocal();
                        }
                    });
                });
                row.querySelector('[data-act="del-item"]').addEventListener("click", () => {
                    b.items.splice(i, 1);
                    renderBloques();
                    recalcLocal();
                });
            });
            const addItemBtn = card.querySelector('[data-act="add-item"]');
            addItemBtn && addItemBtn.addEventListener("click", () => {
                b.items.push({ descripcion: "", cantidad: 1, precio_unitario: 0, es_opcional: false });
                renderBloques();
            });
        }
    }

    // Operan sobre _key (estable) en lugar de idx, para evitar bug de re-orden:
    // el closure captura un idx que puede quedar obsoleto si hay clicks rápidos
    // antes del re-render.
    function moveBloqueByKey(key, dir) {
        const arr = state.currentPres.bloques;
        const idx = arr.findIndex((b) => b._key === key);
        if (idx === -1) return;
        const j = idx + dir;
        if (j < 0 || j >= arr.length) return;
        [arr[idx], arr[j]] = [arr[j], arr[idx]];
        renderBloques();
    }
    function removeBloqueByKey(key) {
        const arr = state.currentPres.bloques;
        const idx = arr.findIndex((b) => b._key === key);
        if (idx === -1) return;
        arr.splice(idx, 1);
        renderBloques();
        recalcLocal();
    }

    function recalcLocal() {
        let total = 0;
        for (const b of state.currentPres.bloques) {
            if (b.tipo === "apartado_cerrado") {
                total += Number(b.subtotal) || 0;
            } else if (b.tipo === "seccion_items") {
                for (const it of b.items) {
                    if (it.es_opcional) continue;
                    total += (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0);
                }
            }
        }
        total = Math.round(total * 100) / 100;
        state.currentPres.total_general = total;
        presFootTotal.textContent = fmtMoney(total);
    }

    /* ---------- Footer (acciones por estado) ---------- */
    function renderFooter(editable) {
        const p = state.currentPres;
        recalcLocal();
        const isAdmin = state.sesion && state.sesion.rol === "admin";

        const buttons = [];

        if (p.id === null) {
            // Modo nuevo
            buttons.push({ label: "Guardar borrador", primary: true, action: () => save({ keepOpen: true }) });
        } else if (p.estado === "solicitud" && isAdmin) {
            buttons.push({ label: "Atender (pasar a borrador)", primary: true, action: () => cambiarEstado("borrador") });
            buttons.push({ label: "Rechazar", danger: true, action: () => cambiarEstado("rechazado") });
        } else if (p.estado === "borrador" && editable) {
            buttons.push({ label: "Guardar", primary: true, action: () => save({ keepOpen: true }) });
            buttons.push({ label: "Marcar enviado", action: () => cambiarEstado("enviado") });
            buttons.push({ label: "Eliminar", danger: true, action: () => eliminar() });
        } else if (p.estado === "enviado" && isAdmin) {
            buttons.push({ label: "Marcar aprobado", primary: true, action: () => cambiarEstado("aprobado") });
            buttons.push({ label: "Marcar rechazado", danger: true, action: () => cambiarEstado("rechazado") });
        } else if (p.estado === "aprobado" && isAdmin) {
            buttons.push({ label: "Convertir a servicio", primary: true, action: () => convertirAServicio() });
        }

        // Acciones disponibles en TODOS los estados con id (excepto solicitud sin contenido)
        if (p.id) {
            buttons.push({ label: "📨 Compartir WA", action: () => compartirWhatsApp() });
            buttons.push({ label: "⬇ Descargar PDF", action: () => descargarPDF() });
        }

        presFootActions.innerHTML = "";
        buttons.forEach((b) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "btn " + (b.primary ? "btn-primary" : (b.danger ? "btn-ghost" : "btn-ghost"));
            btn.textContent = b.label;
            btn.addEventListener("click", b.action);
            presFootActions.appendChild(btn);
        });
    }

    /* ---------- Persistencia ---------- */

    function recolectarHeader() {
        return {
            cliente_nombre: presClienteNombre.value.trim(),
            cliente_telefono: presClienteTelefono.value.trim() || null,
            cliente_direccion: presClienteDireccion.value.trim() || null,
            cliente_destinatario: presClienteDestinatario.value.trim() || null,
            tipo_servicio: presTipoServicio.value || null,
            vigencia_dias: parseInt(presVigencia.value, 10) || 7,
            adelanto_porcentaje: parseFloat(presAdelanto.value) || 0,
            introduccion: presIntroduccion.value.trim() || null,
            notas_internas: presNotasInternas.value.trim() || null,
        };
    }

    function bloquesParaBackend() {
        return state.currentPres.bloques.map((b) => {
            const base = { tipo: b.tipo };
            if (b.tipo === "texto") base.contenido_texto = b.contenido_texto;
            else if (b.tipo === "lista_vinetas") base.vinetas = (b.vinetas || []).filter((v) => v && v.trim());
            else if (b.tipo === "garantias") base.garantias = (b.garantias || []).filter((v) => v && v.trim());
            else if (b.tipo === "apartado_cerrado") {
                base.titulo = b.titulo;
                base.contenido_texto = b.contenido_texto;
                base.subtotal = Number(b.subtotal) || 0;
            } else if (b.tipo === "seccion_items") {
                base.titulo = b.titulo;
                base.items = (b.items || []).map((it) => ({
                    descripcion: it.descripcion,
                    cantidad: Number(it.cantidad) || 1,
                    precio_unitario: Number(it.precio_unitario) || 0,
                    es_opcional: !!it.es_opcional,
                }));
            }
            return base;
        });
    }

    async function save({ keepOpen } = {}) {
        const p = state.currentPres;
        const header = recolectarHeader();
        if (!header.cliente_nombre) {
            presEditorError.textContent = "El nombre del cliente es obligatorio.";
            return;
        }
        const payload = { ...header, bloques: bloquesParaBackend() };

        try {
            presEditorError.textContent = "";
            let body;
            if (p.id === null) {
                body = await api("/api/presupuestos", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast("Presupuesto creado.", "ok");
            } else {
                body = await api("/api/presupuestos/" + p.id, {
                    method: "PUT",
                    body: JSON.stringify(payload),
                });
                toast("Cambios guardados.", "ok");
            }
            state.currentPres = body.data;
            state.currentPres.bloques = (state.currentPres.bloques || []).map(normalizarBloqueDesdeBackend);
            renderEditor();
            loadList();
            if (!keepOpen) closeModal(presEditorBack);
        } catch (err) {
            presEditorError.textContent = err.message;
            toast("Error: " + err.message, "error");
        }
    }

    async function cambiarEstado(nuevoEstado) {
        const p = state.currentPres;
        if (!p.id) return;
        // Si hay cambios sin guardar en borrador, guardar primero.
        if (p.estado === "borrador") {
            await save({ keepOpen: true });
        }
        try {
            const body = await api("/api/presupuestos/" + p.id + "/estado", {
                method: "PUT",
                body: JSON.stringify({ estado: nuevoEstado }),
            });
            state.currentPres.estado = body.data.estado;
            toast(`Estado: ${body.data.estado}.`, "ok");
            renderEditor();
            loadList();
        } catch (err) {
            toast("Error: " + err.message, "error");
        }
    }

    async function convertirAServicio() {
        const p = state.currentPres;
        if (!p.id) return;
        try {
            const body = await api("/api/presupuestos/" + p.id + "/convertir", { method: "POST" });
            toast(body.mensaje || "Convertido.", "ok");
            state.currentPres.estado = "convertido";
            renderEditor();
            loadList();
        } catch (err) {
            toast("Error: " + err.message, "error");
        }
    }

    async function eliminar() {
        const p = state.currentPres;
        if (!p.id) return;
        if (!confirm(`¿Eliminar presupuesto ${p.numero_presupuesto}? No se puede deshacer desde aquí.`)) return;
        try {
            await api("/api/presupuestos/" + p.id, { method: "DELETE" });
            toast("Presupuesto eliminado.", "ok");
            closeModal(presEditorBack);
            loadList();
        } catch (err) {
            toast("Error: " + err.message, "error");
        }
    }

    /* ---------- Compartir WhatsApp ---------- */
    function compartirWhatsApp() {
        const p = state.currentPres;
        if (!p) return;
        const detalles = (p.bloques || [])
            .filter((b) => b.tipo === "apartado_cerrado" || b.tipo === "seccion_items")
            .map((b) => {
                if (b.tipo === "apartado_cerrado") {
                    return `• ${b.titulo}: ${fmtMoney(b.subtotal)}`;
                }
                const sub = (b.items || [])
                    .filter((it) => !it.es_opcional)
                    .reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0), 0);
                return `• ${b.titulo}: ${fmtMoney(sub)}`;
            })
            .join("\n");

        const lines = [
            `Hola ${p.cliente_nombre},`,
            "",
            "Le compartimos el presupuesto solicitado:",
            "",
            `📋 Presupuesto ${p.numero_presupuesto}`,
            `📅 ${fmtFecha(p.fecha_documento || p.fecha_creacion)}`,
            `💰 Total: ${fmtMoney(p.total_general)} ${p.moneda || "MXN"}`,
        ];
        if (detalles) {
            lines.push("", "Detalle:", detalles);
        }
        lines.push("", `Vigencia: ${p.vigencia_dias || 7} días.`);
        if (Number(p.adelanto_porcentaje) > 0) {
            lines.push(`Para iniciar: ${p.adelanto_porcentaje}% de adelanto.`);
        }
        lines.push("", "Quedamos atentos a cualquier duda.", "— ALAS, Mantenimiento Integral e Instalaciones");

        const text = encodeURIComponent(lines.join("\n"));
        const tel = String(p.cliente_telefono || "").replace(/\D/g, "");
        const url = tel ? `https://wa.me/52${tel}?text=${text}` : `https://wa.me/?text=${text}`;
        window.open(url, "_blank", "noopener");
    }

    function descargarPDF() {
        const p = state.currentPres;
        if (!p || !p.id) return;
        // El navegador hace la descarga; cookies se envían automáticamente.
        window.open(`/api/presupuestos/${p.id}/pdf`, "_blank", "noopener");
    }

    /* ---------- Modales: cerrar (con confirmación si hay cambios sucios) ---------- */
    presEditorClose && presEditorClose.addEventListener("click", tryCloseEditor);
    presEditorBack && presEditorBack.addEventListener("click", (e) => {
        if (e.target === presEditorBack) tryCloseEditor();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            if (presEditorBack && presEditorBack.classList.contains("show")) tryCloseEditor();
            else if (presTipoBlBack && presTipoBlBack.classList.contains("show")) closeModal(presTipoBlBack);
        }
    });

    /* ---------- Selector de tipo de bloque ---------- */
    presAddBloqueBtn && presAddBloqueBtn.addEventListener("click", () => {
        openModal(presTipoBlBack);
    });
    presTipoBlCancel && presTipoBlCancel.addEventListener("click", () => closeModal(presTipoBlBack));
    presTipoBlBack && presTipoBlBack.addEventListener("click", (e) => {
        if (e.target === presTipoBlBack) closeModal(presTipoBlBack);
    });
    document.querySelectorAll('.pres-tipo-card').forEach((card) => {
        card.addEventListener("click", () => {
            const tipo = card.dataset.tipo;
            agregarBloque(tipo);
            closeModal(presTipoBlBack);
        });
    });

    function agregarBloque(tipo) {
        const nuevo = {
            _key: state.nextLocalKey++,
            tipo,
            titulo: "",
            contenido_texto: "",
            subtotal: 0,
            vinetas: tipo === "lista_vinetas" ? [""] : [],
            garantias: tipo === "garantias" ? [""] : [],
            items: tipo === "seccion_items" ? [{ descripcion: "", cantidad: 1, precio_unitario: 0, es_opcional: false }] : [],
        };
        state.currentPres.bloques.push(nuevo);
        renderBloques();
        recalcLocal();
    }
})();

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
    // Issue 34: alinear con CSS (.toast.success / .toast.error). Antes usaba
    // clase "ok" que no existía en el stylesheet → toasts sin feedback visual.
    function toast(msg, kind) {
        const t = document.getElementById("toast");
        if (!t) { console.log("[TOAST]", msg); return; }
        t.querySelector(".toast-msg").textContent = msg;
        t.classList.remove("success", "error");
        t.classList.add("show", kind === "error" ? "error" : "success");
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

    // Bug 4: bandera que bloquea markDirty durante el render del editor.
    // Algunos browsers pueden disparar input/change al popular campos
    // programáticamente o por restauración de autofill. Sin esta guarda, el
    // banner "cambios sin guardar" aparecía sin que el usuario tocara nada.
    let _renderingEditor = false;
    function markDirty() {
        if (_renderingEditor) return;
        state.isDirty = true;
    }
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

    // Issue 32: ejecuta una acción que opera sobre la versión guardada del
    // presupuesto. Si hay cambios pendientes, ofrece guardar primero. Si user
    // cancela, aborta sin ejecutar. Si user acepta, guarda y luego ejecuta.
    async function ensureSavedThen(actionLabel, action) {
        if (!state.isDirty) {
            return action();
        }
        const ok = window.confirm(
            `Tienes cambios sin guardar. ¿Guardar antes de "${actionLabel}"?`
        );
        if (!ok) return;
        await save({ keepOpen: true });
        if (state.isDirty) return; // guardado falló — abortar
        return action();
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
    const presSolicitudOriginal = $("presSolicitudOriginal");
    const presSolicitudOriginalText = $("presSolicitudOriginalText");
    const presAsignadoLabel = $("presAsignadoLabel");
    const presAsignadoSelect = $("presAsignadoSelect");
    // Autocomplete cliente (admin only)
    const presClienteSearchLabel = $("presClienteSearchLabel");
    const presClienteSearchInput = $("presClienteSearchInput");
    const presClienteSearchResults = $("presClienteSearchResults");
    const presClienteTag = $("presClienteTag");
    const presClienteTagText = $("presClienteTagText");
    const presClienteTagClear = $("presClienteTagClear");
    const presBloquesList = $("presBloquesList");
    const presAddBloqueBtn = $("presAddBloqueBtn");
    const presFootTotal = $("presFootTotal");
    const presFootActions = $("presFootActions");

    // Tipo bloque selector
    const presTipoBlBack = $("presTipoBlBack");
    const presTipoBlCancel = $("presTipoBlCancel");

    // ===== Fase 3 — IA =====
    const aiSuggestBtn = $("aiSuggestBtn");
    // Modal selector de modo (cuando ya hay bloques)
    const aiModoBack = $("aiModoBack");
    const aiModoCancel = $("aiModoCancel");
    const aiModoContinue = $("aiModoContinue");
    // Modal preview de sugerencia
    const aiSuggestBack = $("aiSuggestBack");
    const aiSuggestLoading = $("aiSuggestLoading");
    const aiSuggestError = $("aiSuggestError");
    const aiSuggestResult = $("aiSuggestResult");
    const aiSuggestTipoServ = $("aiSuggestTipoServ");
    const aiSuggestCount = $("aiSuggestCount");
    const aiSuggestNotaAdmin = $("aiSuggestNotaAdmin");
    const aiSuggestPreview = $("aiSuggestPreview");
    const aiSuggestClose = $("aiSuggestClose");
    const aiSuggestCloseX = $("aiSuggestCloseX");
    const aiSuggestApply = $("aiSuggestApply");

    // Si los elementos no existen, salir silenciosamente.
    if (!presSection) return;

    /* ---------- Inicialización via evento de sesión ---------- */
    document.addEventListener("alas:session-ready", async (e) => {
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
        // Issue 38: await garantiza que la lista se popula antes de que cualquier
        // otro listener (filtros, búsqueda) pueda disparar otra request.
        console.log("[PRES] loadList inicial via alas:session-ready");
        await loadList();
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

    // Issue 30: divide notas_internas en (original, editable) cuando el
    // presupuesto vino del formulario público con prefijo "[Solicitud del cliente]".
    // El servicio de backend usa exactamente ese prefijo (presupuestos.service.js).
    function splitSolicitudOriginal(notas) {
        const PREFIX = "[Solicitud del cliente]\n";
        if (!notas || !notas.startsWith(PREFIX)) {
            return { original: "", editable: notas || "" };
        }
        const rest = notas.slice(PREFIX.length);
        // Permitimos que el técnico haya añadido notas DESPUÉS, separadas por línea en blanco.
        const sepIdx = rest.indexOf("\n\n");
        if (sepIdx === -1) {
            return { original: rest, editable: "" };
        }
        return {
            original: rest.slice(0, sepIdx),
            editable: rest.slice(sepIdx + 2),
        };
    }

    // Inverso de splitSolicitudOriginal: re-arma notas_internas para enviar al backend.
    function joinSolicitudOriginal(original, editable) {
        const ed = (editable || "").trim();
        if (!original) return ed || null;
        return ed
            ? `[Solicitud del cliente]\n${original}\n\n${ed}`
            : `[Solicitud del cliente]\n${original}`;
    }

    function nuevoPresupuestoLocal() {
        return {
            id: null,
            numero_presupuesto: "(nuevo)",
            estado: "borrador",
            fuente: "admin",
            numero_cliente: null,
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
        // Bug 6: el editor a veces abría con scroll al fondo cuando el contenido
        // anterior estaba scrolleado o por restauración del browser. Reset explícito.
        if (presEditorBack) {
            presEditorBack.scrollTop = 0;
            const inner = presEditorBack.querySelector(".modal, .modal-fullscreen");
            if (inner) inner.scrollTop = 0;
        }
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
    // 5 variantes:
    //   1. Solicitud asignada al user actual → info violeta + CTA "Atender".
    //   2. Solicitud genérica (no asignada al user) → info violeta.
    //   3. Estado sensible + admin → warning amarillo (admin override implícito).
    //   4. Estado sensible + técnico → warning amarillo bloqueante.
    //   5. Técnico viendo presupuesto de otro técnico → muted gris.
    function renderBanner(p, editable) {
        const sess = state.sesion || {};
        const isAdmin = sess.rol === "admin";
        const isOwnSolicitud = p.estado === "solicitud"
            && Number(p.asignado_a) === Number(sess.uid);

        // 1. Solicitud asignada al user actual.
        if (p.estado === "solicitud" && isOwnSolicitud) {
            presEditorReadonly.hidden = false;
            presEditorReadonly.className = "pres-editor-banner is-info";
            presEditorReadonly.textContent =
                "Esta solicitud está asignada a ti. Click 'Atender' para empezar a editarla.";
            return;
        }

        // 2. Solicitud genérica (no del user, o admin viendo).
        if (p.estado === "solicitud") {
            presEditorReadonly.hidden = false;
            presEditorReadonly.className = "pres-editor-banner is-info";
            presEditorReadonly.textContent =
                "Esta solicitud aún no ha sido atendida. Click 'Atender' para convertirla en borrador y empezar a editarla.";
            return;
        }

        // 3. Admin editando estado sensible (editable=true por override).
        if (editable && p.id != null && isAdmin && p.estado !== "borrador") {
            presEditorReadonly.hidden = false;
            presEditorReadonly.className = "pres-editor-banner is-warning";
            presEditorReadonly.textContent =
                "Este presupuesto ya fue enviado al cliente. Editar puede afectar integridad.";
            return;
        }

        // Editor editable normal (borrador o nuevo) → sin banner.
        if (editable) {
            presEditorReadonly.hidden = true;
            return;
        }

        // 5. Técnico viendo presupuesto ajeno.
        if (sess.rol === "tecnico"
            && Number(p.asignado_a) !== Number(sess.uid)) {
            const nombre = p.asignado_a_nombre || "otro técnico";
            presEditorReadonly.hidden = false;
            presEditorReadonly.className = "pres-editor-banner is-muted";
            presEditorReadonly.textContent =
                `Este presupuesto está asignado a ${nombre}.`;
            return;
        }

        // 4. Estado sensible + técnico (asignado al user pero estado != borrador).
        presEditorReadonly.hidden = false;
        presEditorReadonly.className = "pres-editor-banner is-warning";
        presEditorReadonly.textContent =
            "Este presupuesto ya fue enviado al cliente. No se puede editar.";
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

    // Reglas para mostrar el botón "✨ Generar con IA" — coinciden con las
    // validaciones del backend (ai.service.js):
    //   - presupuesto debe existir (id != null)
    //   - estado IN (solicitud, borrador)
    //   - admin O técnico asignado (NO admin override aquí: backend devolvería 409
    //     si estado no es solicitud/borrador, así que ni siquiera mostramos botón)
    function canUseAi(p) {
        if (!state.sesion || !p || p.id == null) return false;
        if (p.estado !== "solicitud" && p.estado !== "borrador") return false;
        if (state.sesion.rol === "admin") return true;
        return Number(p.asignado_a) === Number(state.sesion.uid);
    }

    function renderEditor() {
        // Bug 4: bandera para que markDirty NO se active por eventos que dispare
        // el browser al popular inputs programáticamente durante este render.
        _renderingEditor = true;
        const p = state.currentPres;
        const editable = isEditable(p);

        presEditorTitle.textContent = p.id ? "Editar presupuesto" : "Nuevo presupuesto";
        presEditorFolio.textContent = p.id ? p.numero_presupuesto : "";
        presEditorEstado.textContent = p.estado;
        presEditorEstado.className = `estado-badge pres-estado-badge ${p.estado}`;
        renderBanner(p, editable);
        // Reset dirty state al cargar/refrescar el editor (datos nuevos del backend).
        clearDirty();
        // Issue 37: limpiar cualquier .form-error remanente de un submit previo.
        presEditorBack.querySelectorAll(".form-error").forEach((el) => el.classList.remove("form-error"));

        // Cliente
        presClienteNombre.value = p.cliente_nombre || "";
        presClienteTelefono.value = p.cliente_telefono || "";
        presClienteDireccion.value = p.cliente_direccion || "";
        presClienteDestinatario.value = p.cliente_destinatario || "";
        presTipoServicio.value = p.tipo_servicio || "";
        presVigencia.value = p.vigencia_dias || 7;
        presAdelanto.value = p.adelanto_porcentaje || 0;
        presIntroduccion.value = p.introduccion || "";
        // Issue 30: si las notas_internas comienzan con "[Solicitud del cliente]"
        // (formato del formulario público), extraer ese bloque como read-only
        // arriba del textarea. El técnico solo edita SUS propias notas internas.
        const splitNotas = splitSolicitudOriginal(p.notas_internas || "");
        state.currentPres._solicitudOriginal = splitNotas.original;
        if (splitNotas.original) {
            presSolicitudOriginal.hidden = false;
            presSolicitudOriginalText.textContent = splitNotas.original;
        } else {
            presSolicitudOriginal.hidden = true;
            presSolicitudOriginalText.textContent = "";
        }
        presNotasInternas.value = splitNotas.editable;

        // Disable inputs si no editable
        const inputs = [
            presClienteNombre, presClienteTelefono, presClienteDireccion, presClienteDestinatario,
            presTipoServicio, presVigencia, presAdelanto, presIntroduccion, presNotasInternas,
        ];
        inputs.forEach((el) => { el.disabled = !editable; });
        presAddBloqueBtn.hidden = !editable;
        // Botón IA: visible solo si admin/asignado + estado solicitud/borrador.
        if (aiSuggestBtn) aiSuggestBtn.hidden = !canUseAi(p);

        // Dropdown de reasignación (solo admin)
        renderAsignadoDropdown(p);

        // Cliente autocomplete (solo admin)
        renderClienteSearch(p);

        // Google Places autocomplete sobre el input de dirección.
        // Si Maps aún no cargó, reintentamos en 500ms (suele cargar tras /api/config).
        bindMapsAutocompleteOnDireccion();

        renderBloques();
        renderFooter(editable);

        // Bug 4: libera la guarda tras un tick. Cualquier evento síncrono que
        // dispare el browser (autofill, restauración) ya pasó y NO marcó dirty.
        setTimeout(() => { _renderingEditor = false; }, 0);
    }

    function bindMapsAutocompleteOnDireccion() {
        if (!presClienteDireccion) return;
        if (presClienteDireccion.dataset.acBound === "1") return;
        if (window.AlasMaps && window.AlasMaps.isReady()) {
            window.AlasMaps.attach(presClienteDireccion);
            return;
        }
        // Reintento corto: Maps puede cargar tras /api/config. No hacemos polling
        // indefinido; un solo retry alcanza para 99% de los casos.
        setTimeout(() => {
            if (window.AlasMaps && window.AlasMaps.isReady()) {
                window.AlasMaps.attach(presClienteDireccion);
            }
        }, 800);
    }

    /* ---------- Cliente autocomplete (admin only) ---------- */

    function renderClienteSearch(p) {
        const isAdmin = state.sesion && state.sesion.rol === "admin";
        if (!isAdmin) {
            presClienteSearchLabel.hidden = true;
            return;
        }
        presClienteSearchLabel.hidden = false;
        presClienteSearchInput.value = "";
        presClienteSearchResults.hidden = true;
        presClienteSearchResults.innerHTML = "";
        renderClienteTag(p);
    }

    function renderClienteTag(p) {
        if (!presClienteTag) return;
        if (p && p.numero_cliente) {
            presClienteTag.hidden = false;
            presClienteTagText.textContent = `Cliente: ${p.numero_cliente}`;
        } else {
            presClienteTag.hidden = true;
            presClienteTagText.textContent = "";
        }
    }

    let clienteSearchTimer = null;
    presClienteSearchInput && presClienteSearchInput.addEventListener("input", (e) => {
        const q = e.target.value.trim();
        clearTimeout(clienteSearchTimer);
        if (!q) {
            presClienteSearchResults.hidden = true;
            return;
        }
        clienteSearchTimer = setTimeout(() => searchClientes(q), 300);
    });

    async function searchClientes(q) {
        try {
            const body = await api(`/api/clientes?q=${encodeURIComponent(q)}&limit=20`);
            const rows = body.data || [];
            if (!rows.length) {
                presClienteSearchResults.innerHTML =
                    '<div class="pres-cliente-results-empty">Sin coincidencias. Si es nuevo, deja vacío.</div>';
                presClienteSearchResults.hidden = false;
                return;
            }
            presClienteSearchResults.innerHTML = rows.map((c) => `
                <div class="pres-cliente-result" data-numero="${escape(c.numero_cliente)}"
                     data-nombre="${escape(c.nombre_cliente || '')}"
                     data-telefono="${escape(c.telefono || '')}"
                     data-direccion="${escape(c.direccion || '')}">
                    <span class="pres-cliente-result-folio">${escape(c.numero_cliente)}</span>
                    <span class="pres-cliente-result-name">${escape(c.nombre_cliente || '(sin nombre)')}</span>
                    <span class="pres-cliente-result-meta">${escape(c.telefono || '')} · ${c.total_servicios} svc</span>
                </div>
            `).join("");
            presClienteSearchResults.hidden = false;

            presClienteSearchResults.querySelectorAll(".pres-cliente-result").forEach((row) => {
                row.addEventListener("click", () => {
                    seleccionarCliente({
                        numero_cliente: row.dataset.numero,
                        nombre: row.dataset.nombre,
                        telefono: row.dataset.telefono,
                        direccion: row.dataset.direccion,
                    });
                });
            });
        } catch (err) {
            console.warn("[PRES] búsqueda cliente falló:", err);
            presClienteSearchResults.innerHTML =
                '<div class="pres-cliente-results-empty">Error en la búsqueda. Inténtalo de nuevo.</div>';
            presClienteSearchResults.hidden = false;
        }
    }

    function seleccionarCliente(sel) {
        const p = state.currentPres;
        if (!p) return;
        p.numero_cliente = sel.numero_cliente;
        // Click explícito en autocomplete = intent claro de usar ESE cliente.
        // Sobreescribimos los campos sin importar si tenían contenido previo.
        // (Antes había guards "if empty" pero rompían UX cuando admin cambiaba
        // de cliente en un presupuesto ya con datos.)
        if (sel.nombre) {
            presClienteNombre.value = sel.nombre;
            p.cliente_nombre = sel.nombre;
        }
        if (sel.telefono) {
            presClienteTelefono.value = sel.telefono;
            p.cliente_telefono = sel.telefono;
        }
        if (sel.direccion) {
            presClienteDireccion.value = sel.direccion;
            p.cliente_direccion = sel.direccion;
        }
        renderClienteTag(p);
        presClienteSearchInput.value = "";
        presClienteSearchResults.hidden = true;
        markDirty();
    }

    presClienteTagClear && presClienteTagClear.addEventListener("click", () => {
        if (!state.currentPres) return;
        state.currentPres.numero_cliente = null;
        renderClienteTag(state.currentPres);
        markDirty();
    });

    // Cierra dropdown al click fuera.
    document.addEventListener("click", (e) => {
        if (!presClienteSearchLabel) return;
        if (presClienteSearchLabel.contains(e.target)) return;
        presClienteSearchResults.hidden = true;
    });

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

        // Bug 2: antes el dropdown se deshabilitaba para presupuestos nuevos
        // (p.id == null) porque /reasignar requiere id. Ahora permitimos
        // selección: guardamos la elección localmente en state.currentPres.asignado_a
        // y al primer guardado (POST) hacemos /reasignar inmediato.
        presAsignadoSelect.disabled = false;

        presAsignadoSelect.onchange = async () => {
            const v = presAsignadoSelect.value;
            const newId = v === "" ? null : parseInt(v, 10);

            // Modo nuevo: solo guardar localmente, sin llamada al backend.
            if (p.id == null) {
                state.currentPres.asignado_a = newId;
                state.currentPres._asignadoPendiente = true; // bandera para post-save
                return;
            }

            // Modo existente: llamada inmediata a /reasignar.
            try {
                const body = await api(`/api/presupuestos/${p.id}/reasignar`, {
                    method: "POST",
                    body: JSON.stringify({ asignado_a: newId }),
                });
                state.currentPres.asignado_a = body.data.asignado_a;
                state.currentPres.asignado_a_nombre = body.data.asignado_a_nombre || null;
                toast(newId ? "Reasignado." : "Desasignado.", "success");
                loadList();
            } catch (err) {
                toast("Error al reasignar: " + err.message, "error");
                presAsignadoSelect.value = p.asignado_a != null ? String(p.asignado_a) : "";
            }
        };
    }

    const TIPO_LABEL = {
        texto: "📝 Cuerpo",
        lista_vinetas: "• Aclaraciones",
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
                    <span class="pres-field-label">Aclaraciones</span>
                    <div class="pres-vinetas-list" data-list="vinetas">
                        ${(b.vinetas.length ? b.vinetas : [""]).map((v, i) => `
                            <div class="pres-vineta-row">
                                <input type="text" data-idx="${i}" value="${escape(v)}" ${ro} placeholder="Ej: Incluye limpieza al finalizar">
                                <button type="button" data-act="del-vineta" data-idx="${i}" ${dis}>×</button>
                            </div>
                        `).join("")}
                    </div>
                    <button type="button" class="pres-add-vineta" data-act="add-vineta" ${dis}>+ Agregar aclaración</button>
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
        // Tras re-render, ubicar el bloque movido por _key y aplicar pulse + scroll.
        requestAnimationFrame(() => {
            const card = presBloquesList.querySelector(`.pres-bloque-card[data-key="${key}"]`);
            if (!card) return;
            card.classList.add("moved");
            card.scrollIntoView({ behavior: "smooth", block: "center" });
            setTimeout(() => card.classList.remove("moved"), 650);
        });
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
        const sess = state.sesion || {};
        const isAdmin = sess.rol === "admin";
        // Técnico asignado a la solicitud también puede atender/rechazar.
        const esResponsable = isAdmin
            || (sess.rol === "tecnico" && Number(p.asignado_a) === Number(sess.uid));

        const buttons = [];

        if (p.id === null) {
            // Modo nuevo
            buttons.push({ label: "Guardar borrador", primary: true, action: () => save({ keepOpen: true }) });
        } else if (p.estado === "solicitud" && esResponsable) {
            // Issue 23: admin O técnico asignado pueden atender/rechazar la solicitud.
            buttons.push({ label: "Atender (pasar a borrador)", primary: true, action: () => cambiarEstado("borrador") });
            buttons.push({ label: "Rechazar", danger: true, action: () => cambiarEstado("rechazado") });
        } else if (p.estado === "borrador" && editable) {
            buttons.push({ label: "Guardar", primary: true, action: () => save({ keepOpen: true }) });
            // Issue 32: "Marcar enviado" requiere version guardada — ofrecer save first.
            buttons.push({ label: "Marcar enviado", action: () => ensureSavedThen("Marcar enviado", () => cambiarEstado("enviado")) });
            buttons.push({ label: "Eliminar", danger: true, action: () => eliminar() });
        } else if (p.estado === "enviado" && esResponsable) {
            // Issue 36v2: técnico responsable también puede aprobar/rechazar.
            buttons.push({ label: "Marcar aprobado", primary: true, action: () => ensureSavedThen("Marcar aprobado", () => cambiarEstado("aprobado")) });
            buttons.push({ label: "Marcar rechazado", danger: true, action: () => cambiarEstado("rechazado") });
        } else if (p.estado === "aprobado" && esResponsable) {
            // Fase 4A: conversión real implementada. Crea servicio + asigna técnico
            // + linkea servicio_id al presupuesto + cambia estado a 'convertido',
            // todo dentro de una transacción.
            buttons.push({
                label: "Convertir a servicio",
                primary: true,
                title: "Crea el servicio en estado PENDIENTE con los datos del presupuesto y lo asigna al técnico responsable.",
                action: () => ensureSavedThen("Convertir a servicio", () => convertirAServicioConAviso()),
            });
        }

        // Acciones disponibles en TODOS los estados con id.
        // Issue 32: compartir y PDF dependen de la versión guardada → ensureSavedThen.
        if (p.id) {
            buttons.push({ label: "📨 Compartir WA", action: () => ensureSavedThen("Compartir por WhatsApp", () => compartirWhatsApp()) });
            buttons.push({ label: "⬇ Descargar PDF", action: () => ensureSavedThen("Descargar PDF", () => descargarPDF()) });
        }

        presFootActions.innerHTML = "";
        buttons.forEach((b) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "btn " + (b.primary ? "btn-primary" : (b.danger ? "btn-ghost" : "btn-ghost"));
            btn.textContent = b.label;
            if (b.title) btn.title = b.title;
            btn.addEventListener("click", b.action);
            presFootActions.appendChild(btn);
        });
    }

    // Fase 4A: confirm explicativo antes de convertir. La operación es
    // irreversible (no hay UI para "des-convertir") y crea trabajo facturable.
    async function convertirAServicioConAviso() {
        const ok = window.confirm(
            "Esto creará un servicio nuevo en estado PENDIENTE con los datos del " +
            "presupuesto y lo asignará al técnico responsable. El presupuesto " +
            "quedará en estado 'convertido' (no editable). ¿Continuar?"
        );
        if (!ok) return;
        return convertirAServicio();
    }

    /* ---------- Persistencia ---------- */

    function recolectarHeader() {
        return {
            numero_cliente: (state.currentPres && state.currentPres.numero_cliente) || null,
            cliente_nombre: presClienteNombre.value.trim(),
            cliente_telefono: presClienteTelefono.value.trim() || null,
            cliente_direccion: presClienteDireccion.value.trim() || null,
            cliente_destinatario: presClienteDestinatario.value.trim() || null,
            tipo_servicio: presTipoServicio.value || null,
            vigencia_dias: parseInt(presVigencia.value, 10) || 7,
            adelanto_porcentaje: parseFloat(presAdelanto.value) || 0,
            introduccion: presIntroduccion.value.trim() || null,
            // Issue 30: re-añade "[Solicitud del cliente]\n<original>\n\n" si aplica.
            notas_internas: joinSolicitudOriginal(
                state.currentPres && state.currentPres._solicitudOriginal,
                presNotasInternas.value,
            ),
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
        // Issue 34v2: si no hay cambios y el presupuesto YA existe, no spam al
        // backend. Avisar al user con toast neutro. Modo nuevo (p.id === null)
        // siempre intenta guardar aunque no haya marcado dirty (primer save).
        if (p && p.id !== null && !state.isDirty) {
            toast("No hay cambios para guardar.", "success");
            return;
        }
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
                toast("Presupuesto creado.", "success");

                // Bug 2: si admin eligió técnico mientras estaba en modo nuevo,
                // ahora que ya hay id real, persistir esa asignación.
                if (p._asignadoPendiente && p.asignado_a != null && body.data && body.data.id) {
                    try {
                        const r2 = await api(`/api/presupuestos/${body.data.id}/reasignar`, {
                            method: "POST",
                            body: JSON.stringify({ asignado_a: p.asignado_a }),
                        });
                        body.data.asignado_a = r2.data.asignado_a;
                        body.data.asignado_a_nombre = r2.data.asignado_a_nombre || null;
                    } catch (errR) {
                        toast("Creado, pero falló asignar técnico: " + errR.message, "error");
                    }
                }
            } else {
                body = await api("/api/presupuestos/" + p.id, {
                    method: "PUT",
                    body: JSON.stringify(payload),
                });
                toast("Cambios guardados.", "success");
            }
            state.currentPres = body.data;
            state.currentPres.bloques = (state.currentPres.bloques || []).map(normalizarBloqueDesdeBackend);
            renderEditor();
            loadList();
            if (!keepOpen) closeModal(presEditorBack);
        } catch (err) {
            const msg = traducirErrorZod(err.message);
            presEditorError.textContent = msg;
            toast(msg, "error");
            // Issue 33: marcar campos/bloques problemáticos.
            highlightErroresPresupuesto(err.message);
        }
    }

    // Issue 33: parsea paths del error de Zod del backend y aplica .form-error
    // a campos del header (cliente) o a bloques individuales del editor.
    // El listener delegado de main.js quita la clase al editar.
    function highlightErroresPresupuesto(msg) {
        if (!msg) return;
        const HEADER_FIELDS = {
            cliente_nombre: presClienteNombre,
            cliente_telefono: presClienteTelefono,
            cliente_direccion: presClienteDireccion,
            cliente_destinatario: presClienteDestinatario,
            tipo_servicio: presTipoServicio,
            vigencia_dias: presVigencia,
            adelanto_porcentaje: presAdelanto,
            introduccion: presIntroduccion,
            notas_internas: presNotasInternas,
        };
        const partes = String(msg).split("; ");
        let primero = null;
        for (const parte of partes) {
            const sep = parte.indexOf(": ");
            if (sep < 0) continue;
            const path = parte.slice(0, sep);
            // bloques.N... → marca la card N-ésima
            const mBloque = path.match(/^bloques\.(\d+)/);
            if (mBloque) {
                const idx = Number(mBloque[1]);
                const cards = presBloquesList.querySelectorAll(".pres-bloque-card");
                const card = cards[idx];
                if (card) {
                    card.classList.add("form-error");
                    if (!primero) primero = card;
                }
                continue;
            }
            const el = HEADER_FIELDS[path];
            if (el) {
                el.classList.add("form-error");
                if (!primero) primero = el;
            }
        }
        if (primero && primero.scrollIntoView) {
            primero.scrollIntoView({ behavior: "smooth", block: "center" });
            try { primero.focus({ preventScroll: true }); } catch { /* noop */ }
        }
    }

    // Issue 31: traduce paths técnicos de Zod (bloques.X.contenido_texto, etc.)
    // a mensajes legibles en español. Acepta múltiples errores separados por "; "
    // (formato del validate.middleware).
    function traducirErrorZod(msg) {
        if (!msg) return "Error.";
        const partes = String(msg).split("; ");
        const FIELD_LABELS = {
            cliente_nombre: "Nombre del cliente",
            cliente_telefono: "Teléfono del cliente",
            cliente_direccion: "Dirección del cliente",
            cliente_destinatario: "Destinatario",
            ciudad: "Ciudad",
            fecha_documento: "Fecha del documento",
            tipo_servicio: "Tipo de servicio",
            vigencia_dias: "Vigencia (días)",
            adelanto_porcentaje: "Adelanto (%)",
            moneda: "Moneda",
            introduccion: "Introducción",
            notas_internas: "Notas internas",
            numero_cliente: "Número de cliente",
            descripcion: "Descripción",
            cantidad: "Cantidad",
            precio_unitario: "Precio unitario",
            es_opcional: "Opcional",
            titulo: "Título",
            contenido_texto: "Contenido",
            subtotal: "Subtotal",
            vinetas: "Aclaraciones",
            garantias: "Garantías",
            estado: "Estado",
            asignado_a: "Asignado a",
        };
        const traducidas = partes.map((parte) => {
            const sep = parte.indexOf(": ");
            if (sep < 0) return parte;
            const path = parte.slice(0, sep);
            const detalle = parte.slice(sep + 2);
            // bloques.N.algo, bloques.N.items.M.algo
            const mBloqueItem = path.match(/^bloques\.(\d+)\.items\.(\d+)\.(\w+)/);
            if (mBloqueItem) {
                const b = Number(mBloqueItem[1]) + 1;
                const i = Number(mBloqueItem[2]) + 1;
                const f = FIELD_LABELS[mBloqueItem[3]] || mBloqueItem[3];
                return `Bloque #${b} → item #${i} (${f}): ${detalle}`;
            }
            const mBloque = path.match(/^bloques\.(\d+)\.(\w+)/);
            if (mBloque) {
                const b = Number(mBloque[1]) + 1;
                const f = FIELD_LABELS[mBloque[2]] || mBloque[2];
                return `Bloque #${b} (${f}): ${detalle}`;
            }
            const f = FIELD_LABELS[path] || path;
            return `${f}: ${detalle}`;
        });
        return traducidas.join("\n");
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
            toast(`Estado: ${body.data.estado}.`, "success");
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
            // Backend devuelve { ok, data: { servicio_id, numero_cliente, tecnico_asignado, mensaje } }
            const data = body.data || {};
            const msg = data.mensaje
                || (data.numero_cliente
                    ? `✅ Servicio ${data.numero_cliente} creado y asignado a ${data.tecnico_asignado || '—'}.`
                    : "Convertido.");
            toast(msg, "success");
            // Pedir al dashboard de servicios que refresque la lista — sigue
            // el patrón existente alas:session-ready (CustomEvent en document).
            document.dispatchEvent(new CustomEvent("alas:servicios-refresh"));
            // Cerrar editor (presupuesto convertido ya no es editable).
            closeModal(presEditorBack);
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
            toast("Presupuesto eliminado.", "success");
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
            // Emojis vía codepoint escapado para inmunizar contra cambios de encoding del archivo.
            // \u{1F4CB} = 📋 (clipboard) · \u{1F4C5} = 📅 (calendar) · \u{1F4B0} = 💰 (money bag)
            `\u{1F4CB} Presupuesto ${p.numero_presupuesto}`,
            `\u{1F4C5} ${fmtFecha(p.fecha_documento || p.fecha_creacion)}`,
            `\u{1F4B0} Total: ${fmtMoney(p.total_general)} ${p.moneda || "MXN"}`,
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

    /* =====================================================
       FASE 3 — Generador de bloques con IA (Feature B + C)
       ===================================================== */

    const TIPO_LABEL_AI = {
        texto: "Cuerpo",
        lista_vinetas: "Lista",
        garantias: "Garantías",
        apartado_cerrado: "Apartado cerrado",
        seccion_items: "Sección con items",
    };

    // Datos de la última sugerencia (para aplicar después de revisar).
    let _aiLast = { mode: null, data: null };

    // --- Estado del modal preview (loading | error | result) ---
    function setAiState(name) {
        if (aiSuggestLoading) aiSuggestLoading.hidden = name !== "loading";
        if (aiSuggestError)   aiSuggestError.hidden   = name !== "error";
        if (aiSuggestResult)  aiSuggestResult.hidden  = name !== "result";
        // Apply button visible solo en estado "result".
        if (aiSuggestApply)   aiSuggestApply.hidden   = name !== "result";
    }

    function showAiError(msg) {
        if (!aiSuggestError) return;
        const el = aiSuggestError.querySelector(".ai-suggest-error-msg");
        if (el) el.textContent = msg;
        setAiState("error");
    }

    function closeAiPreview() {
        closeModal(aiSuggestBack);
        setAiState(null);
        _aiLast = { mode: null, data: null };
        if (aiSuggestApply) {
            aiSuggestApply.disabled = false;
            aiSuggestApply.textContent = "Aplicar";
        }
    }

    // Tabla de mensajes por status/code (per spec).
    function mapAiErrorMsg(status, code) {
        if (status === 400) return "Falta descripción inicial. Escríbela en \"Notas internas\" y vuelve a intentar.";
        if (status === 403) return "No tienes permiso para usar IA en este presupuesto.";
        if (status === 404) return "Presupuesto no encontrado o sin acceso.";
        if (status === 409) return "Este presupuesto no puede editarse en su estado actual.";
        if (status === 429 && code === "AI_USER_RATE_LIMIT") return "Has alcanzado tu límite por hora de uso de IA. Intenta más tarde.";
        if (status === 429) return "Uso elevado detectado. Intenta en unos minutos.";
        if (status === 502) return "IA no disponible. Intenta de nuevo.";
        if (status >= 500)  return "Error interno al generar. Intenta de nuevo.";
        return "Error al contactar la IA. Intenta de nuevo.";
    }

    // Extrae viñetas/garantías de un bloque devuelto por la IA.
    // El bloque puede traer la lista en `vinetas`/`garantias` (array directo,
    // como lo devuelve el schema) o serializado en `contenido_texto`.
    function readArrayField(b, field) {
        if (Array.isArray(b[field])) return b[field];
        if (typeof b.contenido_texto === "string" && b.contenido_texto.startsWith("[")) {
            try {
                const parsed = JSON.parse(b.contenido_texto);
                return Array.isArray(parsed) ? parsed : [];
            } catch { return []; }
        }
        return [];
    }

    function renderAiBloqueCard(b) {
        const tipoBadge = `<span class="ai-preview-tipo-badge">${escape(TIPO_LABEL_AI[b.tipo] || b.tipo)}</span>`;
        const tit = b.titulo ? `<span class="ai-preview-titulo">${escape(b.titulo)}</span>` : "";
        let body = "";

        if (b.tipo === "texto" || b.tipo === "apartado_cerrado") {
            body = `<div class="ai-preview-body">${escape(b.contenido_texto || "")}</div>`;
        } else if (b.tipo === "lista_vinetas") {
            const arr = readArrayField(b, "vinetas");
            body = `<ul class="ai-preview-vinetas">${arr.map((v) => `<li>${escape(v)}</li>`).join("")}</ul>`;
        } else if (b.tipo === "garantias") {
            const arr = readArrayField(b, "garantias");
            body = `<ul class="ai-preview-vinetas">${arr.map((v) => `<li>${escape(v)}</li>`).join("")}</ul>`;
        } else if (b.tipo === "seccion_items") {
            const items = Array.isArray(b.items) ? b.items : [];
            body = `<div class="ai-preview-items">${items.map((it) => `
                <div class="ai-preview-item">
                    <span>${escape(it.descripcion || "")}</span>
                    ${it.es_opcional ? '<span class="ai-preview-item-opt">opcional</span>' : ""}
                </div>
            `).join("")}</div>`;
        }

        return `
            <div class="ai-preview-bloque">
                <div class="ai-preview-bloque-head">${tipoBadge}${tit}</div>
                ${body}
            </div>
        `;
    }

    // Render items_nuevos con checkbox (modo agregar/mejorar — opt-in).
    function renderAiItemsNuevos(items) {
        return items.map((it, idx) => `
            <label class="ai-preview-bloque ai-preview-selectable">
                <div class="ai-preview-bloque-head">
                    <input type="checkbox" class="ai-preview-check" data-kind="item_nuevo" data-idx="${idx}" />
                    <span class="ai-preview-tipo-badge">Item nuevo</span>
                    <span class="ai-preview-titulo">→ bloque ${it.bloque_id_destino}</span>
                </div>
                <div class="ai-preview-item">
                    <span>${escape(it.descripcion || "")}</span>
                    <span class="ai-preview-item-opt">opcional</span>
                </div>
            </label>
        `).join("");
    }

    // Render mejoras con checkbox.
    function renderAiMejoras(mejoras) {
        return mejoras.map((m, idx) => `
            <label class="ai-preview-bloque ai-preview-selectable">
                <div class="ai-preview-bloque-head">
                    <input type="checkbox" class="ai-preview-check" data-kind="mejora" data-idx="${idx}" />
                    <span class="ai-preview-tipo-badge">Mejora</span>
                    <span class="ai-preview-titulo">item #${m.item_id}</span>
                </div>
                <div class="ai-preview-body" style="color: var(--color-silver-3); text-decoration: line-through;">${escape(m.descripcion_original || "")}</div>
                <div class="ai-preview-body" style="margin-top: 0.4rem;">${escape(m.descripcion_mejorada || "")}</div>
            </label>
        `).join("");
    }

    function renderAiPreview(data, mode) {
        _aiLast = { mode, data };

        if (aiSuggestTipoServ) aiSuggestTipoServ.textContent = data.tipo_servicio_detectado || "—";

        const bloques = Array.isArray(data.bloques) ? data.bloques : [];
        const mejoras = Array.isArray(data.mejoras) ? data.mejoras : [];
        const itemsNuevos = Array.isArray(data.items_nuevos) ? data.items_nuevos : [];
        const totalPropuestas = bloques.length + mejoras.length + itemsNuevos.length;
        if (aiSuggestCount) aiSuggestCount.textContent = totalPropuestas;

        if (aiSuggestNotaAdmin) {
            if (data.notas_al_admin) {
                aiSuggestNotaAdmin.hidden = false;
                aiSuggestNotaAdmin.innerHTML = `
                    <strong>ℹ️ Nota de la IA para el administrador:</strong>
                    ${escape(data.notas_al_admin)}
                `;
            } else {
                aiSuggestNotaAdmin.hidden = true;
            }
        }

        let html = "";
        if (mode === "generar_inicial" && bloques.length) {
            html += bloques.map(renderAiBloqueCard).join("");
        }
        if (mejoras.length) html += renderAiMejoras(mejoras);
        if (itemsNuevos.length) html += renderAiItemsNuevos(itemsNuevos);

        if (!html) {
            html = `<div class="pres-empty">La IA no generó propuestas. Revisa la nota al admin arriba.</div>`;
        }
        if (aiSuggestPreview) aiSuggestPreview.innerHTML = html;

        // Configurar botón Aplicar según modo.
        // Issue 1: ocultar el botón completo si NO hay nada que aplicar.
        // Ej. modo mejorar sin mejoras/items_nuevos (sólo notas_al_admin).
        const hayPropuestas = mode === "generar_inicial"
            ? bloques.length > 0
            : (mejoras.length > 0 || itemsNuevos.length > 0);

        if (aiSuggestApply) {
            if (!hayPropuestas) {
                aiSuggestApply.hidden = true;
            } else {
                aiSuggestApply.hidden = false;
                if (mode === "generar_inicial") {
                    aiSuggestApply.textContent = "Aplicar bloques";
                    aiSuggestApply.disabled = false;
                } else {
                    aiSuggestApply.textContent = "Aplicar seleccionados";
                    // Inicia disabled — se habilita cuando hay al menos un check.
                    aiSuggestApply.disabled = true;
                }
            }
        }

        setAiState("result");

        // setAiState pone aiSuggestApply.hidden = false si state=result; lo re-ocultamos
        // si correspondía (Issue 1). Orden importa: este reset DESPUÉS de setAiState.
        if (aiSuggestApply && !hayPropuestas) aiSuggestApply.hidden = true;
    }

    // POST /api/ai/sugerir-bloques con timeout 15s.
    async function fetchAiSuggestion(modo) {
        const p = state.currentPres;
        if (!p || p.id == null) {
            showAiError("Guarda el presupuesto antes de usar IA.");
            return;
        }

        openModal(aiSuggestBack);
        setAiState("loading");

        const body = { presupuesto_id: p.id, modo };

        // Issue 3: en generar_inicial mandamos descripcion_inicial desde
        // notas_internas si tiene contenido. El backend hace su propio fallback,
        // pero mandarlo desde acá garantiza que la solicitud original del
        // cliente llegue al modelo aunque venga con prefijo "[Solicitud del cliente]".
        // Stripeamos el prefijo aquí también (mismo behavior que el backend).
        if (modo === "generar_inicial") {
            const SOLICITUD_PREFIX = "[Solicitud del cliente]\n";
            const raw = (p.notas_internas || "").trim();
            let desc = raw;
            if (desc.startsWith(SOLICITUD_PREFIX)) {
                desc = desc.slice(SOLICITUD_PREFIX.length).trim();
            }
            if (desc.length >= 10) body.descripcion_inicial = desc;
        }

        // Timeout 15s via AbortController.
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15000);

        try {
            const res = await fetch("/api/ai/sugerir-bloques", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: ctrl.signal,
            });
            clearTimeout(timer);

            let payload = null;
            try { payload = await res.json(); } catch { /* respuesta sin body */ }

            if (!res.ok) {
                const code = payload && payload.code;
                showAiError(mapAiErrorMsg(res.status, code));
                return;
            }
            if (!payload || !payload.ok || !payload.data) {
                showAiError("Respuesta inesperada del servidor.");
                return;
            }
            renderAiPreview(payload.data, modo);
        } catch (err) {
            clearTimeout(timer);
            if (err && err.name === "AbortError") {
                showAiError("La IA tardó demasiado. Intenta de nuevo.");
            } else {
                showAiError("Error al contactar la IA. Intenta de nuevo.");
                console.error("[AI] fetch error:", err);
            }
        }
    }

    /* ---------- Event handlers IA ---------- */

    // Click en "✨ Generar con IA":
    //   - Si presupuesto NO tiene bloques: ir directo a generar_inicial.
    //   - Si tiene bloques: abrir modal selector de modo.
    aiSuggestBtn && aiSuggestBtn.addEventListener("click", () => {
        if (!state.currentPres) return;
        const bloques = state.currentPres.bloques || [];
        if (bloques.length === 0) {
            fetchAiSuggestion("generar_inicial");
        } else {
            // Reset selección + estado del botón Continuar
            const radios = aiModoBack ? aiModoBack.querySelectorAll('input[name="ai-modo-choice"]') : [];
            radios.forEach((r) => { r.checked = false; });
            if (aiModoContinue) aiModoContinue.disabled = true;
            openModal(aiModoBack);
        }
    });

    // Enable Continue cuando se selecciona una opción.
    aiModoBack && aiModoBack.addEventListener("change", (e) => {
        if (e.target && e.target.name === "ai-modo-choice") {
            if (aiModoContinue) aiModoContinue.disabled = false;
        }
    });

    aiModoCancel && aiModoCancel.addEventListener("click", () => closeModal(aiModoBack));
    aiModoBack && aiModoBack.addEventListener("click", (e) => {
        if (e.target === aiModoBack) closeModal(aiModoBack);
    });

    aiModoContinue && aiModoContinue.addEventListener("click", () => {
        const sel = aiModoBack && aiModoBack.querySelector('input[name="ai-modo-choice"]:checked');
        if (!sel) return;
        closeModal(aiModoBack);
        fetchAiSuggestion(sel.value);
    });

    aiSuggestClose && aiSuggestClose.addEventListener("click", closeAiPreview);
    aiSuggestCloseX && aiSuggestCloseX.addEventListener("click", closeAiPreview);
    aiSuggestBack && aiSuggestBack.addEventListener("click", (e) => {
        if (e.target === aiSuggestBack) closeAiPreview();
    });

    // Habilita botón Aplicar cuando hay al menos un checkbox marcado (modo mejorar/agregar).
    aiSuggestPreview && aiSuggestPreview.addEventListener("change", (e) => {
        if (!e.target || !e.target.classList.contains("ai-preview-check")) return;
        if (!_aiLast.mode || _aiLast.mode === "generar_inicial") return;
        const anyChecked = !!aiSuggestPreview.querySelector(".ai-preview-check:checked");
        if (aiSuggestApply) aiSuggestApply.disabled = !anyChecked;
    });

    aiSuggestApply && aiSuggestApply.addEventListener("click", () => {
        if (!_aiLast.data || !_aiLast.mode) return;
        applySuggestion(_aiLast.mode, _aiLast.data);
    });

    // Escape cierra los modales IA.
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if (aiSuggestBack && aiSuggestBack.classList.contains("show")) closeAiPreview();
        else if (aiModoBack && aiModoBack.classList.contains("show")) closeModal(aiModoBack);
    });

    /* ---------- Aplicación de sugerencias al presupuesto (Feature C) ---------- */

    // Coerciona los nulls que la IA emite (cantidad/precio_unitario/subtotal)
    // a defaults aceptados por el backend (cantidad:1, precio_unitario:0, subtotal:0).
    function _aiBloqueToBackend(b) {
        const tipo = b.tipo;
        if (tipo === "texto") {
            return { tipo, contenido_texto: b.contenido_texto || "" };
        }
        if (tipo === "lista_vinetas") {
            return { tipo, vinetas: Array.isArray(b.vinetas) ? b.vinetas : [] };
        }
        if (tipo === "garantias") {
            return { tipo, garantias: Array.isArray(b.garantias) ? b.garantias : [] };
        }
        if (tipo === "apartado_cerrado") {
            return {
                tipo,
                titulo: b.titulo || "",
                contenido_texto: b.contenido_texto || "",
                subtotal: b.subtotal != null ? Number(b.subtotal) : 0,
            };
        }
        if (tipo === "seccion_items") {
            const items = Array.isArray(b.items) ? b.items : [];
            return {
                tipo,
                titulo: b.titulo || "",
                items: items.map((it) => ({
                    descripcion: it.descripcion || "",
                    cantidad: it.cantidad != null ? Number(it.cantidad) : 1,
                    precio_unitario: it.precio_unitario != null ? Number(it.precio_unitario) : 0,
                    es_opcional: !!it.es_opcional,
                })),
            };
        }
        return null;
    }

    // Busca a qué bloque pertenece un item_id en el presupuesto actual.
    function _findBloqueIdForItem(itemId) {
        const bloques = state.currentPres && state.currentPres.bloques || [];
        for (const b of bloques) {
            if (Array.isArray(b.items)) {
                for (const it of b.items) {
                    if (Number(it.id) === Number(itemId)) return b.id;
                }
            }
        }
        return null;
    }

    // Recarga el presupuesto actual desde el backend y re-renderiza el editor.
    async function _reloadCurrentEditor() {
        const id = state.currentPres && state.currentPres.id;
        if (!id) return;
        try {
            const body = await api("/api/presupuestos/" + id);
            state.currentPres = body.data;
            state.currentPres.bloques = (state.currentPres.bloques || []).map(normalizarBloqueDesdeBackend);
            renderEditor();
            loadList();
        } catch (err) {
            toast("Sugerencias aplicadas, pero falló recargar: " + err.message, "error");
        }
    }

    async function applySuggestion(mode, data) {
        const p = state.currentPres;
        if (!p || p.id == null) {
            toast("Guarda el presupuesto antes de aplicar.", "error");
            return;
        }
        if (!aiSuggestApply) return;

        // Estado visual de "aplicando".
        aiSuggestApply.disabled = true;
        aiSuggestApply.textContent = "Aplicando…";

        try {
            if (mode === "generar_inicial") {
                const bloques = (data.bloques || [])
                    .map(_aiBloqueToBackend)
                    .filter(Boolean);
                if (!bloques.length) {
                    toast("No hay bloques que aplicar.", "error");
                    aiSuggestApply.disabled = false;
                    aiSuggestApply.textContent = "Aplicar bloques";
                    return;
                }
                await api("/api/presupuestos/" + p.id, {
                    method: "PUT",
                    body: JSON.stringify({ bloques }),
                });
                closeAiPreview();
                await _reloadCurrentEditor();
                toast("✨ Bloques aplicados. Agrega los precios antes de enviar.", "success");
                return;
            }

            // mejorar / agregar — iterar selección
            const checks = aiSuggestPreview ? aiSuggestPreview.querySelectorAll(".ai-preview-check:checked") : [];
            const mejorasIdx = [];
            const itemsIdx = [];
            checks.forEach((c) => {
                const idx = Number(c.dataset.idx);
                if (c.dataset.kind === "mejora") mejorasIdx.push(idx);
                else if (c.dataset.kind === "item_nuevo") itemsIdx.push(idx);
            });

            const mejoras = mejorasIdx.map((i) => (data.mejoras || [])[i]).filter(Boolean);
            const itemsNuevos = itemsIdx.map((i) => (data.items_nuevos || [])[i]).filter(Boolean);

            let okMejoras = 0, failMejoras = 0;
            for (const m of mejoras) {
                const bloqueId = _findBloqueIdForItem(m.item_id);
                if (!bloqueId) { failMejoras++; continue; }
                try {
                    await api(`/api/presupuestos/${p.id}/bloques/${bloqueId}/items/${m.item_id}`, {
                        method: "PUT",
                        body: JSON.stringify({ descripcion: m.descripcion_mejorada }),
                    });
                    okMejoras++;
                } catch (errM) {
                    failMejoras++;
                    console.error("[AI][APPLY] mejora falló item=", m.item_id, errM);
                }
            }

            let okItems = 0, failItems = 0;
            for (const it of itemsNuevos) {
                try {
                    await api(`/api/presupuestos/${p.id}/bloques/${it.bloque_id_destino}/items`, {
                        method: "POST",
                        body: JSON.stringify({
                            descripcion: it.descripcion,
                            cantidad: 1,
                            precio_unitario: 0,
                            es_opcional: true,
                        }),
                    });
                    okItems++;
                } catch (errI) {
                    failItems++;
                    console.error("[AI][APPLY] item nuevo falló bloque=", it.bloque_id_destino, errI);
                }
            }

            const totalOk = okMejoras + okItems;
            const totalFail = failMejoras + failItems;
            if (totalFail === 0) {
                closeAiPreview();
                await _reloadCurrentEditor();
                toast(`✨ Aplicadas ${totalOk} sugerencia(s).`, "success");
            } else {
                aiSuggestApply.disabled = false;
                aiSuggestApply.textContent = "Reintentar";
                toast(`Aplicadas ${totalOk}, fallaron ${totalFail}. Revisa consola.`, "error");
                // Si al menos una pasó, refresca silenciosamente para sincronizar estado.
                if (totalOk > 0) await _reloadCurrentEditor();
            }
        } catch (err) {
            aiSuggestApply.disabled = false;
            aiSuggestApply.textContent = mode === "generar_inicial" ? "Aplicar bloques" : "Aplicar seleccionados";
            toast("Error al aplicar: " + (err.message || err), "error");
        }
    }
})();

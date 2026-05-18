/* =====================================================
   FASE 5 — Asistente conversacional ALAS (burbuja flotante).
   Solo se activa en /admin con sesión activa.
   Dos modos: navegación (keywords, sin API) y creación de
   presupuesto por chat (recopila → POST /api/ai/chat-presupuesto).
   ===================================================== */
(() => {
    if (window.location.pathname !== "/admin") return;

    /* ---------- Estado ---------- */
    const state = {
        abierto: false,
        iniciado: false,      // true tras la primera apertura: el historial vive
                              // en el DOM y persiste mientras dure la sesión.
        modo: null,           // null | 'presupuesto' | 'navegacion'
        paso: null,           // ver fasePresupuesto
        preguntaIdx: 0,
        preguntas: [],
        datos: {
            cliente_nombre: null,
            cliente_telefono: null,
            numero_cliente_existente: null,
            tipo_servicio: null,
            descripcion: null,
            respuestas_adicionales: {},
        },
        sesion: null,
    };

    const TIPOS = {
        plomeria: "🔧 Plomería",
        electrica: "⚡ Eléctrica",
        gas: "🔥 Gas",
        pintura: "🎨 Pintura",
        soldadura: "⚙️ Soldadura",
        mantenimiento_integral: "🏠 Mantenimiento integral",
    };

    const PREGUNTAS_POR_TIPO = {
        plomeria: [
            { pregunta: "¿Qué material se usará?", opciones: ["Cobre", "PVC", "Fierro negro", "Mixto"] },
            { pregunta: "¿Cuántos metros aproximados?", opciones: ["Menos de 10m", "10-30m", "Más de 30m"] },
            { pregunta: "¿Incluye retiro de tubería vieja?", opciones: ["Sí", "No"] },
        ],
        electrica: [
            { pregunta: "¿Es instalación interior o exterior?", opciones: ["Interior", "Exterior", "Ambas"] },
            { pregunta: "¿Qué calibre de cable?", opciones: ["Cal 12", "Cal 10", "Cal 8", "No sé aún"] },
            { pregunta: "¿Incluye tablero o solo circuitos?", opciones: ["Solo circuitos", "Incluye tablero"] },
        ],
        gas: [
            { pregunta: "¿Cuántos dispositivos o reguladores involucra?", opciones: ["1-3", "4-8", "Más de 8"] },
            { pregunta: "¿Es casa particular o edificio?", opciones: ["Casa particular", "Edificio/departamentos"] },
            { pregunta: "¿Ya tienes diagnóstico o es primera revisión?", opciones: ["Ya hay diagnóstico", "Primera revisión"] },
        ],
        pintura: [
            { pregunta: "¿Cuántos m² aproximados?", opciones: ["Menos de 30m²", "30-100m²", "Más de 100m²"] },
            { pregunta: "¿Cuántas manos de pintura?", opciones: ["1 mano", "2 manos", "3 o más"] },
            { pregunta: "¿Incluye preparación de superficie?", opciones: ["Sí", "No"] },
        ],
        soldadura: [
            { pregunta: "¿Qué material se va a soldar?", opciones: ["Acero", "Aluminio", "Fierro", "Otro"] },
            { pregunta: "¿Es reparación o instalación nueva?", opciones: ["Reparación", "Instalación nueva"] },
        ],
        mantenimiento_integral: [
            { pregunta: "¿Qué sistemas involucra?", opciones: ["Gas y plomería", "Eléctrico", "Varios sistemas"] },
            { pregunta: "¿Es mantenimiento preventivo o correctivo?", opciones: ["Preventivo", "Correctivo"] },
        ],
    };

    /* ---------- Helpers ---------- */
    function esc(s) {
        return String(s == null ? "" : s)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    function toastGlobal(msg, kind = "success") {
        const t = document.getElementById("toast");
        if (!t) return;
        const m = t.querySelector(".toast-msg");
        if (m) m.textContent = msg;
        t.classList.remove("success", "error");
        t.classList.add("show", kind === "error" ? "error" : "success");
        setTimeout(() => t.classList.remove("show"), 3500);
    }

    /* ---------- DOM (creado al cargar) ---------- */
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    // Avatar del bot (logo del chatbot ALAS). Se usa en el header, en cada
    // burbuja del bot y como icono del botón flotante (globo).
    const BOT_AVATAR = "imagenes/logo-chatbot-alas.png";
    const BTN_ICON = `<img class="asist-btn-icon" src="${BOT_AVATAR}" alt="Asistente" />`;

    const html = `
        <button type="button" class="asist-btn" id="asistBtn" aria-label="Asistente" hidden>${BTN_ICON}</button>
        <div class="asist-panel" id="asistPanel" role="dialog" aria-modal="false" aria-labelledby="asistHeadTitle">
            <header class="asist-head">
                <img class="asist-head-avatar" src="${BOT_AVATAR}" alt="Asistente ALAS" />
                <div class="asist-head-text">
                    <p class="asist-head-title" id="asistHeadTitle">Hola 👋</p>
                    <p class="asist-head-sub">¿En qué te ayudo?</p>
                </div>
            </header>
            <div class="asist-msgs" id="asistMsgs" aria-live="polite"></div>
            <div class="asist-input-bar">
                <input type="text" class="asist-input" id="asistInput" placeholder="Escribe o usa el micrófono..." autocomplete="off" />
                <button type="button" class="asist-mic-btn" id="asistMicBtn" title="Hablar" ${SR ? "" : "hidden"}>🎤</button>
                <button type="button" class="asist-send-btn" id="asistSendBtn" title="Enviar">➤</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML("beforeend", html);

    const btn = document.getElementById("asistBtn");
    const panel = document.getElementById("asistPanel");
    const headTitle = document.getElementById("asistHeadTitle");
    const msgs = document.getElementById("asistMsgs");
    const input = document.getElementById("asistInput");
    const sendBtn = document.getElementById("asistSendBtn");
    const micBtn = document.getElementById("asistMicBtn");

    /* ---------- Render mensajes ---------- */
    function scrollDown() {
        msgs.scrollTop = msgs.scrollHeight;
    }

    // Avatar circular del bot para anteponer a cada burbuja.
    function botAvatar() {
        const img = document.createElement("img");
        img.className = "asist-avatar";
        img.src = BOT_AVATAR;
        img.alt = "ALAS";
        return img;
    }

    function addBotMsg(text, opciones) {
        const row = document.createElement("div");
        row.className = "asist-msg-row asist-msg-row-bot";
        const div = document.createElement("div");
        div.className = "asist-msg asist-msg-bot";
        div.innerHTML = esc(text).replace(/\n/g, "<br>");
        row.appendChild(botAvatar());
        row.appendChild(div);
        msgs.appendChild(row);

        if (Array.isArray(opciones) && opciones.length) {
            const opts = document.createElement("div");
            opts.className = "asist-options";
            opciones.forEach((opt) => {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "asist-option-btn";
                b.textContent = opt.label;
                b.addEventListener("click", () => {
                    // Deshabilitar TODOS los botones del bloque tras click (no doble-click)
                    opts.querySelectorAll("button").forEach((x) => (x.disabled = true));
                    opt.action && opt.action();
                });
                opts.appendChild(b);
            });
            msgs.appendChild(opts);
        }
        scrollDown();
    }

    function addUserMsg(text) {
        const div = document.createElement("div");
        div.className = "asist-msg asist-msg-user";
        div.textContent = text;
        msgs.appendChild(div);
        scrollDown();
    }

    function addLoadingMsg(texto) {
        const row = document.createElement("div");
        row.className = "asist-msg-row asist-msg-row-bot";
        row.id = "asistLoadingMsg";
        const div = document.createElement("div");
        div.className = "asist-msg asist-msg-bot";
        div.innerHTML = '<span class="asist-spinner"></span> ' + esc(texto || "Generando…");
        row.appendChild(botAvatar());
        row.appendChild(div);
        msgs.appendChild(row);
        scrollDown();
    }

    function removeLoadingMsg() {
        const el = document.getElementById("asistLoadingMsg");
        if (el) el.remove();
    }

    /* ---------- Visibilidad ---------- */
    function mostrarBurbuja() { btn.hidden = false; }
    function ocultarBurbuja() {
        btn.hidden = true;
        cerrar();
    }

    function abrir() {
        state.abierto = true;
        panel.classList.remove("is-minimized");
        panel.classList.add("show");
        btn.textContent = "✕";
        // El historial vive en el DOM: solo se inicializa la primera vez.
        // Reabrir el panel NO borra los mensajes previos.
        if (!state.iniciado) iniciarChat();
        setTimeout(() => input.focus(), 80);
    }

    function cerrar() {
        state.abierto = false;
        panel.classList.remove("show");
        panel.classList.remove("is-minimized");
        btn.innerHTML = BTN_ICON;
    }

    // Mobile: colapsa el panel tras navegar (NO lo cierra — el historial y el
    // estado se conservan). La burbuja sigue visible para reabrirlo.
    function minimizar() {
        panel.classList.add("is-minimized");
        btn.innerHTML = BTN_ICON;
    }

    function toggle() {
        // Si está minimizado (mobile), un toque restaura el panel.
        if (panel.classList.contains("is-minimized")) {
            panel.classList.remove("is-minimized");
            btn.textContent = "✕";
            return;
        }
        if (state.abierto) cerrar();
        else abrir();
    }

    /* ---------- Reset / inicio del chat ---------- */
    // Reinicia solo el estado del flujo (no toca el historial de mensajes).
    function resetFlujo() {
        state.modo = null;
        state.paso = null;
        state.preguntaIdx = 0;
        state.preguntas = [];
        state.datos = {
            cliente_nombre: null,
            cliente_telefono: null,
            numero_cliente_existente: null,
            tipo_servicio: null,
            descripcion: null,
            respuestas_adicionales: {},
        };
    }

    // Inicializa el chat: limpia el área y pinta el saludo. Solo se llama
    // una vez por sesión (primera apertura del panel).
    function iniciarChat() {
        resetFlujo();
        msgs.innerHTML = "";
        const nombre = (state.sesion && state.sesion.usuario) || "usuario";
        headTitle.textContent = `Hola ${nombre} 👋`;
        saludo();
        state.iniciado = true;
    }

    // Borra el historial por completo. Se usa al cerrar sesión.
    function limpiarHistorial() {
        resetFlujo();
        msgs.innerHTML = "";
        state.iniciado = false;
    }

    // Opciones del menú principal — siempre disponibles.
    const MENU_OPCIONES = [
        { label: "📋 Nuevo presupuesto", action: empezarPresupuesto },
        { label: "📊 Estado del negocio", action: menuNegocio },
        { label: "🔧 Ver servicios", action: () => navegar("servicios") },
        { label: "👥 Buscar cliente", action: () => navegar("clientes") },
        { label: "📄 Consultar nota", action: () => navegar("notas") },
    ];

    // Menú principal "sticky": primer hijo de #asistMsgs, queda fijo arriba al
    // hacer scroll y sus botones NO se deshabilitan (reutilizables siempre).
    function renderMenuPrincipal() {
        const menu = document.createElement("div");
        menu.className = "asist-menu";
        menu.id = "asistMenu";
        MENU_OPCIONES.forEach((opt) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "asist-option-btn";
            b.textContent = opt.label;
            b.addEventListener("click", () => { if (opt.action) opt.action(); });
            menu.appendChild(b);
        });
        msgs.appendChild(menu);
    }

    function saludo() {
        renderMenuPrincipal();
        addBotMsg("Elige una opción del menú o escríbeme lo que necesitas.");
    }

    /* ---------- Navegación (sin API) ---------- */
    // Dispara el click sobre un elemento del panel si existe. Devuelve true/false.
    function clickSi(selector) {
        const el = document.querySelector(selector);
        if (el) { el.click(); return true; }
        return false;
    }

    // Cambia de tab del dashboard vía el evento que escucha main.js.
    function cambiarTab(tab) {
        document.dispatchEvent(
            new CustomEvent("alas:cambiar-tab", { detail: { tab } }),
        );
    }

    function navegar(target) {
        const dash = document.getElementById("adminDash");
        const isMobile = window.innerWidth < 768;
        const irAlDash = () => {
            if (dash) dash.scrollIntoView({ behavior: "smooth", block: "start" });
        };
        // Mobile: tras navegar, minimiza el panel para que el usuario vea la
        // sección a la que lo llevamos. En desktop el panel se queda como está.
        const trasNavegar = () => { if (isMobile) minimizar(); };

        if (target === "servicios") {
            addUserMsg("Ver servicios");
            // Servicios = tab "Activos" del dashboard.
            cambiarTab("active");
            irAlDash();
            addBotMsg("Te llevo a la lista de servicios.");
            trasNavegar();
            return;
        }

        if (target === "clientes") {
            addUserMsg("Buscar cliente");
            // La sección de clientes es el tab "Buscar cliente" del dashboard.
            cambiarTab("search");
            irAlDash();
            addBotMsg("Te llevo a la búsqueda de clientes. Escribe nombre, número o teléfono.");
            trasNavegar();
            return;
        }

        if (target === "notas") {
            addUserMsg("Consultar nota");
            // Las notas se consultan en los servicios finalizados: tab "Activos"
            // + filtro "Finalizados". Cada servicio terminado con nota muestra
            // el botón "📄 Ver nota".
            cambiarTab("active");
            const filtroOk = clickSi('.filter-btn[data-estado="TERMINADO"]');
            irAlDash();
            if (filtroOk) {
                addBotMsg('Te llevo a los servicios finalizados. Cada uno con nota tiene el botón "📄 Ver nota".');
            } else {
                addBotMsg('Te llevo a los servicios. Cambia al filtro "Finalizados" para ver las notas.');
            }
            trasNavegar();
            return;
        }

        // presupuestos / usuarios: scroll directo a la sección.
        addUserMsg(`Ir a ${target}`);
        const map = {
            presupuestos: "presupuestosSection",
            usuarios: "usuariosSection",
        };
        const el = map[target] && document.getElementById(map[target]);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            addBotMsg(`Te llevo a ${target}.`);
            trasNavegar();
        } else {
            addBotMsg("No encontré esa sección.");
        }
    }

    /* ---------- Consultas de negocio (datos reales, sin Claude API) ---------- */
    const KEYWORDS_NEGOCIO = {
        activos: ["activos", "cuántos servicios", "mis servicios",
                  "servicios tengo", "cuantos servicios",
                  "estado del negocio", "estado negocio",
                  "cómo vamos", "como vamos", "resumen"],
        urgentes: ["urgentes", "más urgentes", "mas urgentes",
                   "prioridad", "más antiguos", "mas antiguos"],
        sin_presupuesto: ["sin presupuesto", "falta presupuesto",
                          "no tienen presupuesto", "presupuesto falta"],
        sin_cerrar: ["sin cerrar", "no han cerrado", "demorados",
                     "llevan mucho", "no cierran"],
        presupuestos_pendientes: ["presupuestos pendientes", "sin respuesta",
                                  "esperando respuesta", "presupuestos enviados"],
    };

    // Devuelve el tipo de consulta si el texto contiene alguna keyword, o null.
    function detectarConsultaNegocio(low) {
        for (const tipo of Object.keys(KEYWORDS_NEGOCIO)) {
            if (KEYWORDS_NEGOCIO[tipo].some((k) => low.includes(k))) return tipo;
        }
        return null;
    }

    // Submenú con las 5 consultas de negocio.
    function menuNegocio() {
        addUserMsg("📊 Estado del negocio");
        addBotMsg("¿Qué quieres consultar?", [
            { label: "📋 Servicios activos", action: () => consultarNegocio("activos", "Servicios activos") },
            { label: "⚡ Más urgentes", action: () => consultarNegocio("urgentes", "Más urgentes") },
            { label: "📄 Sin presupuesto", action: () => consultarNegocio("sin_presupuesto", "Sin presupuesto") },
            { label: "⏳ Sin cerrar", action: () => consultarNegocio("sin_cerrar", "Sin cerrar") },
            { label: "💼 Presupuestos pendientes", action: () => consultarNegocio("presupuestos_pendientes", "Presupuestos pendientes") },
        ]);
    }

    // Consulta al backend y muestra la respuesta. `etiqueta` se usa cuando
    // la consulta viene de un botón (para reflejar la elección del usuario).
    async function consultarNegocio(tipo, etiqueta) {
        if (etiqueta) addUserMsg(etiqueta);
        addLoadingMsg("Consultando datos…");
        try {
            const res = await fetch("/api/ai/consulta-negocio", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tipo }),
            });
            const payload = await res.json().catch(() => ({}));
            removeLoadingMsg();
            if (!res.ok || !payload.ok || !payload.data) {
                addBotMsg("No pude consultar los datos. Intenta de nuevo.");
                return;
            }
            addBotMsg(payload.data.respuesta || "No pude consultar los datos. Intenta de nuevo.");
        } catch (err) {
            removeLoadingMsg();
            console.error("[ASIST] consulta-negocio error:", err);
            addBotMsg("No pude consultar los datos. Intenta de nuevo.");
        }
    }

    /* ---------- Flujo de presupuesto ---------- */
    function empezarPresupuesto() {
        addUserMsg("📋 Nuevo presupuesto");
        state.modo = "presupuesto";
        state.paso = "cliente_tipo";
        addBotMsg("¿Es para un cliente nuevo o uno que ya tenemos registrado?", [
            { label: "Cliente nuevo", action: () => tipoCliente("nuevo") },
            { label: "Cliente existente", action: () => tipoCliente("existente") },
        ]);
    }

    function tipoCliente(tipo) {
        addUserMsg(tipo === "nuevo" ? "Cliente nuevo" : "Cliente existente");
        if (tipo === "nuevo") {
            state.paso = "cliente_nombre";
            addBotMsg("¿Cuál es el nombre del cliente?");
        } else {
            state.paso = "cliente_numero";
            addBotMsg("¿Cuál es el número de cliente? (formato CL-XXXX)");
        }
    }

    function preguntarTipoServicio() {
        state.paso = "tipo_servicio";
        addBotMsg(
            "¿Qué tipo de servicio es?",
            Object.entries(TIPOS).map(([key, label]) => ({
                label,
                action: () => seleccionarTipoServicio(key),
            })),
        );
    }

    function seleccionarTipoServicio(tipo) {
        addUserMsg(TIPOS[tipo]);
        state.datos.tipo_servicio = tipo;
        state.paso = "descripcion";
        addBotMsg("Descríbeme el trabajo con tus palabras. Puedes usar el micrófono 🎤");
    }

    function iniciarPreguntasAdicionales() {
        state.datos.respuestas_adicionales = {};
        state.preguntaIdx = 0;
        state.preguntas = PREGUNTAS_POR_TIPO[state.datos.tipo_servicio] || [];
        siguientePregunta();
    }

    function siguientePregunta() {
        if (state.preguntaIdx >= state.preguntas.length) {
            generar();
            return;
        }
        const q = state.preguntas[state.preguntaIdx];
        state.paso = `pregunta:${state.preguntaIdx}`;
        addBotMsg(
            q.pregunta,
            q.opciones.map((opt) => ({
                label: opt,
                action: () => responderPregunta(opt, state.preguntaIdx),
            })),
        );
    }

    function responderPregunta(valor, idx) {
        if (idx !== state.preguntaIdx) return;
        addUserMsg(valor);
        const q = state.preguntas[idx];
        state.datos.respuestas_adicionales[q.pregunta] = valor;
        state.preguntaIdx++;
        siguientePregunta();
    }

    async function generar() {
        state.paso = "enviando";
        addBotMsg("Perfecto, tengo todo. Preparo tu presupuesto…");
        addLoadingMsg();

        const body = {
            tipo_servicio: state.datos.tipo_servicio,
            descripcion: state.datos.descripcion,
            respuestas_adicionales: state.datos.respuestas_adicionales || {},
        };
        if (state.datos.numero_cliente_existente) {
            body.numero_cliente_existente = state.datos.numero_cliente_existente;
        } else {
            body.cliente_nombre = state.datos.cliente_nombre;
            if (state.datos.cliente_telefono) body.cliente_telefono = state.datos.cliente_telefono;
        }

        try {
            const res = await fetch("/api/ai/chat-presupuesto", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const payload = await res.json().catch(() => ({}));
            removeLoadingMsg();

            if (!res.ok || !payload.ok) {
                addBotMsg(
                    (payload && payload.error) ||
                    "Tuve un problema al generar el presupuesto. ¿Lo intentamos de nuevo?",
                    [{ label: "Intentar de nuevo", action: empezarPresupuesto }],
                );
                return;
            }

            const d = payload.data || {};
            const num = d.numero_presupuesto || "";
            addBotMsg(
                `✨ Listo. Presupuesto ${num} creado con ${d.bloques_generados || 0} bloque(s). Abro el editor…`,
            );
            setTimeout(() => {
                document.dispatchEvent(
                    new CustomEvent("alas:abrir-presupuesto", {
                        detail: { presupuesto_id: d.presupuesto_id },
                    }),
                );
                // Confirmación visible en el chat: tranquiliza al usuario si
                // cierra el editor pensando que perdió el trabajo.
                addBotMsg(
                    `✅ Listo. El presupuesto ${num} quedó guardado como borrador. ` +
                    `Si lo cierras, lo encuentras en la sección Presupuestos. ` +
                    `Agrega los precios cuando estés listo.`,
                );
                toastGlobal("✨ Presupuesto listo. Revisa los datos y agrega los precios.");
                // El flujo terminó: liberar el modo para que el usuario pueda
                // pedir otra cosa con texto libre.
                state.modo = null;
                state.paso = null;
            }, 700);
        } catch (err) {
            removeLoadingMsg();
            console.error("[ASIST] fetch error:", err);
            addBotMsg(
                "Tuve un problema al generar el presupuesto. ¿Lo intentamos de nuevo?",
                [{ label: "Intentar de nuevo", action: empezarPresupuesto }],
            );
        }
    }

    /* ---------- Interpretación de texto libre ---------- */
    // Quita acentos y pasa a minúsculas para comparar de forma tolerante.
    function normaliza(s) {
        return String(s == null ? "" : s)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .trim();
    }

    // Detecta el tipo de servicio desde texto libre o dictado de voz.
    const ALIAS_TIPO = {
        plomeria: ["plomeria", "plomero", "tuberia", "fuga", "agua", "drenaje"],
        electrica: ["electrica", "electrico", "electricidad", "luz", "cableado", "corto"],
        gas: ["gas", "estacionario", "regulador"],
        pintura: ["pintura", "pintar", "pintor"],
        soldadura: ["soldadura", "soldar", "soldador", "herreria"],
        mantenimiento_integral: ["mantenimiento", "integral"],
    };
    function matchTipoServicio(txt) {
        const low = normaliza(txt);
        if (!low) return null;
        return (
            Object.keys(ALIAS_TIPO).find((k) =>
                ALIAS_TIPO[k].some((a) => low.includes(a)),
            ) || null
        );
    }

    // Mapea texto libre a una de las opciones de botón mostradas.
    // Devuelve la opción exacta (tal cual aparece en el botón) o null.
    function matchOpcion(txt, opciones) {
        const low = normaliza(txt);
        if (!low || !Array.isArray(opciones)) return null;
        // 1) Coincidencia exacta.
        let m = opciones.find((o) => normaliza(o) === low);
        if (m) return m;
        // 2) El texto contiene la opción, o la opción contiene al texto.
        m = opciones.find((o) => {
            const ol = normaliza(o);
            return low.includes(ol) || ol.includes(low);
        });
        if (m) return m;
        // 3) Alguna palabra significativa de la opción aparece en el texto.
        m = opciones.find((o) =>
            normaliza(o)
                .split(/\s+/)
                .some((w) => w.length > 2 && low.includes(w)),
        );
        return m || null;
    }

    /* ---------- Procesar texto libre del usuario ---------- */
    function procesarTexto(txt) {
        const t = txt.trim();
        if (!t) return;

        // Modo libre / inicial: keyword detection.
        if (state.modo === null || state.paso === null) {
            addUserMsg(t);
            const low = t.toLowerCase();
            // Consultas de negocio: se evalúan primero (algunas contienen
            // "servicio"/"presupuesto" y se confundirían con navegación).
            const tipoNegocio = detectarConsultaNegocio(low);
            if (tipoNegocio) return consultarNegocio(tipoNegocio);
            if (/\b(presupuesto|cotizaci)/i.test(low)) return empezarPresupuesto();
            if (/\b(servicio)/i.test(low)) return navegar("servicios");
            if (/\b(cliente)/i.test(low)) return navegar("clientes");
            if (/\b(nota)/i.test(low)) return navegar("notas");
            if (/\b(usuario)/i.test(low)) return navegar("usuarios");
            addBotMsg(
                "No entendí. Toca un botón o pregúntame por presupuestos, servicios, clientes o notas.",
            );
            return;
        }

        // En flujo de presupuesto, según paso actual:
        if (state.modo === "presupuesto") {
            switch (state.paso) {
                case "cliente_tipo": {
                    // El usuario escribió en vez de tocar [Cliente nuevo]/[Cliente existente].
                    const low = normaliza(t);
                    if (/(nuev|primera vez|no.*registr|no lo teng|no la teng)/.test(low)) {
                        return tipoCliente("nuevo");
                    }
                    if (/(exist|registrad|ya l[oa] teng|ya teng|ya esta|tenemos|conocid|de antes|viejo|antiguo)/.test(low)) {
                        return tipoCliente("existente");
                    }
                    addBotMsg("No entendí bien. ¿Puedes tocar una de las opciones de arriba?");
                    return;
                }
                case "cliente_nombre": {
                    if (t.length < 2) { addBotMsg("Nombre muy corto. Intenta de nuevo."); return; }
                    addUserMsg(t);
                    state.datos.cliente_nombre = t;
                    state.paso = "cliente_telefono";
                    addBotMsg("¿Cuál es su teléfono? (10 dígitos)");
                    return;
                }
                case "cliente_numero": {
                    const m = t.match(/CL-?(\d{1,4})/i);
                    if (!m) {
                        addBotMsg("Formato inválido. Debe ser CL-XXXX (ej. CL-0042).");
                        return;
                    }
                    addUserMsg(t);
                    state.datos.numero_cliente_existente = `CL-${m[1].padStart(4, "0")}`;
                    preguntarTipoServicio();
                    return;
                }
                case "cliente_telefono": {
                    const digits = t.replace(/\D+/g, "");
                    if (digits.length !== 10) {
                        addBotMsg("Necesito 10 dígitos exactos.");
                        return;
                    }
                    addUserMsg(t);
                    state.datos.cliente_telefono = digits;
                    preguntarTipoServicio();
                    return;
                }
                case "tipo_servicio": {
                    // Texto libre o dictado de voz: identificar el tipo de servicio.
                    const tipo = matchTipoServicio(t);
                    if (tipo) return seleccionarTipoServicio(tipo);
                    addBotMsg("No entendí bien. ¿Puedes tocar una de las opciones de arriba?");
                    return;
                }
                case "descripcion": {
                    if (t.length < 10) {
                        addBotMsg("Describe un poco más (mínimo 10 caracteres).");
                        return;
                    }
                    addUserMsg(t);
                    state.datos.descripcion = t;
                    iniciarPreguntasAdicionales();
                    return;
                }
                default: {
                    if (state.paso && state.paso.startsWith("pregunta:")) {
                        const idx = parseInt(state.paso.split(":")[1], 10);
                        const q = state.preguntas[idx];
                        // Texto libre o voz: mapearlo a una de las opciones del paso.
                        const opcion = q && matchOpcion(t, q.opciones);
                        if (opcion) return responderPregunta(opcion, idx);
                        addBotMsg("No entendí bien. ¿Puedes tocar una de las opciones de arriba?");
                        return;
                    }
                    addBotMsg("No entendí bien. ¿Puedes tocar una de las opciones de arriba?");
                }
            }
            return;
        }
    }

    /* ---------- Reconocimiento de voz (Web Speech API) ---------- */
    // iOS expone solo webkitSpeechRecognition (a lo que ya resuelve SR) y exige
    // continuous=false. Apple limita el dictado a nivel sistema/WebKit, así que
    // la restricción aplica a TODOS los navegadores del dispositivo, no solo
    // Safari. Sin soporte, micBtn ya viene oculto (hidden).
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    let recognition = null;
    let recording = false;
    if (SR) {
        recognition = new SR();
        recognition.lang = "es-MX";
        recognition.continuous = false;     // requerido en iOS Safari
        recognition.interimResults = false; // requerido en iOS Safari
        recognition.maxAlternatives = 1;
        recognition.onresult = (e) => {
            const txt = e.results[0][0].transcript;
            input.value = txt;
            // Auto-enviar tras dictado.
            procesarTexto(txt);
            input.value = "";
        };
        recognition.onend = () => {
            recording = false;
            micBtn.classList.remove("is-recording");
        };
        recognition.onerror = (e) => {
            recording = false;
            micBtn.classList.remove("is-recording");
            // Micrófono no disponible / permiso denegado: avisar en el chat.
            if (e && (e.error === "not-allowed" || e.error === "service-not-allowed")) {
                addBotMsg(
                    isIOS
                        ? "El micrófono no está disponible en este dispositivo. Escribe tu mensaje directamente."
                        : "No pude acceder al micrófono. Revisa los permisos del micrófono en tu navegador.",
                );
            }
        };
        micBtn.addEventListener("click", () => {
            if (recording) {
                try { recognition.stop(); } catch { /* noop */ }
                return;
            }
            try {
                recognition.start();
                recording = true;
                micBtn.classList.add("is-recording");
            } catch { /* noop */ }
        });
    }

    /* ---------- Wiring final ---------- */
    btn.addEventListener("click", toggle);
    sendBtn.addEventListener("click", () => {
        const v = input.value;
        if (!v.trim()) return;
        procesarTexto(v);
        input.value = "";
    });
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    });

    // Inicialización: el asistente se muestra solo cuando hay sesión activa.
    // Reusa el mismo evento que el resto del panel admin.
    document.addEventListener("alas:session-ready", (e) => {
        state.sesion = e.detail || null;
        if (state.sesion) {
            mostrarBurbuja();
        } else {
            // Cierre de sesión: borra el historial del chat.
            limpiarHistorial();
            ocultarBurbuja();
        }
    });
})();

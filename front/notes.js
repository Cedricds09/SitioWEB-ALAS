(() => {
    // URL relativa: el fetch usa el mismo origen desde donde cargó la
    // página → funciona en localhost, ngrok y producción sin cambios.
    const API_BASE = "";

    function escape(s) {
        return String(s ?? "").replace(/[&<>"']/g, c => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[c]));
    }

    function money(n) {
        const num = Number(n) || 0;
        const isWhole = Math.abs(num - Math.round(num)) < 0.005;
        return "$" + num.toLocaleString("es-MX", {
            minimumFractionDigits: isWhole ? 0 : 2, maximumFractionDigits: 2
        });
    }

    function formatClienteId(c) {
        const s = String(c ?? "").trim();
        if (!s) return "—";
        return s.startsWith("CL-") ? s : `CL-${s}`;
    }

    function formatNotaId(id) {
        // El backend ya entrega el folio como "ALAS-XXXX": usarlo tal cual.
        if (typeof id === "string" && id.startsWith("ALAS-")) return id;
        const n = parseInt(id, 10);
        return isNaN(n) ? String(id) : `NT-${String(n).padStart(4, "0")}`;
    }

    function formatPdfFileId(id) {
        // Mismo criterio: si ya viene "ALAS-XXXX" se usa directo.
        if (typeof id === "string" && id.startsWith("ALAS-")) return id;
        const n = parseInt(id, 10);
        return isNaN(n) ? String(id) : `ALAS-${String(n).padStart(4, "0")}`;
    }

    // Privacidad: censurar teléfono, visibles solo últimos 3 dígitos
    function maskTelefono(raw) {
        if (!raw) return "";
        const digits = String(raw).replace(/\D+/g, "");
        if (!digits) return "";
        if (digits.length <= 3) return digits;
        const visibles = digits.slice(-3);
        const ocultos = "*".repeat(digits.length - 3);
        return `${ocultos}${visibles}`;
    }

    // Privacidad: solo primer nombre + primer apellido
    function sanitizarNombre(raw) {
        if (!raw) return "";
        const partes = String(raw).trim().split(/\s+/).filter(Boolean);
        if (partes.length === 0) return "";
        if (partes.length === 1) return partes[0];
        return `${partes[0]} ${partes[1]}`;
    }

    function formatFecha(f) {
        if (!f) return "—";
        const d = new Date(f);
        if (isNaN(d.getTime())) return String(f);
        return d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
    }

    // Normaliza "conceptos" a array de { concept, amount } para pdf.js
    function parseConceptos(raw, total) {
        if (Array.isArray(raw)) {
            return raw.map(r => ({
                concept: String(r.concept ?? r.descripcion ?? r.nombre ?? r),
                amount: Number(r.amount ?? r.costo ?? r.precio ?? 0)
            }));
        }
        if (typeof raw === "string") {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parseConceptos(parsed, total);
            } catch { /* no es JSON, tratar como texto */ }
            const parts = raw.split(/\r?\n|;|,/).map(s => s.trim()).filter(Boolean);
            if (parts.length > 1) {
                return parts.map(p => ({ concept: p, amount: 0 }));
            }
            return [{ concept: raw, amount: Number(total) || 0 }];
        }
        return [{ concept: "Servicio", amount: Number(total) || 0 }];
    }

    function toPdfNote(data, cliente, validacion) {
        const nombreSafe = sanitizarNombre(data.nombre) || formatClienteId(data.cliente ?? cliente);
        const telMasked = maskTelefono(data.telefono) || "—";
        return {
            id: formatNotaId(data.id),
            filename: `${formatPdfFileId(data.id)}.pdf`,
            customerId: formatClienteId(data.cliente ?? cliente),
            date: formatFecha(data.fecha),
            name: nombreSafe,
            phone: telMasked,
            // Issue 29: usa tipo_servicio del backend (heredado vía JOIN
            // notas LEFT JOIN servicios). Fallback al label genérico.
            service: data.tipo_servicio || "Nota de servicio",
            message: typeof data.conceptos === "string" ? data.conceptos : "",
            items: parseConceptos(data.conceptos, data.total)
        };
    }

    function flashAndScroll(root) {
        root.scrollIntoView({ behavior: "smooth", block: "center" });
        root.classList.remove("flash");
        // reinicia animación
        void root.offsetWidth;
        root.classList.add("flash");
    }

    function renderError(msg, opts = {}) {
        const root = document.getElementById("notesResults");
        if (!root) return;
        root.classList.toggle("error", !!opts.notFound);
        root.innerHTML = `<p class="notes-empty">${escape(msg)}</p>`;
        flashAndScroll(root);
    }

    function renderNotFound() {
        renderError("No se encontró ninguna nota con los datos proporcionados", { notFound: true });
    }

    // Renderiza 1..N notas. 1-3 → todas; >3 → 3 recientes + "Ver más" +
    // buscador en vivo (por fecha o folio) sobre las notas ya cargadas.
    function renderNotas(dataArr) {
        const root = document.getElementById("notesResults");
        if (!root) return;
        root.classList.remove("error");

        // Modelo de presentación por nota (incluye su PDF ya armado).
        const notas = dataArr.map((d, idx) => ({
            idx,
            data: d,
            pdf: toPdfNote(d),
            folio: formatNotaId(d.id),
            fechaStr: formatFecha(d.fecha),
        }));

        const count = notas.length;
        const colapsable = count > 3;

        root.innerHTML = `
            <p class="notes-count">${count} nota${count === 1 ? "" : "s"} encontrada${count === 1 ? "" : "s"}</p>
            ${colapsable ? '<input type="search" class="notes-filter" id="notesFilter" placeholder="Buscar por fecha (dd/mm/aaaa) o folio (ALAS-XXXX)…" autocomplete="off" />' : ""}
            <ul class="notes-list" id="notesList"></ul>
            ${colapsable ? '<button type="button" class="btn btn-ghost notes-more" id="notesMore"></button>' : ""}
        `;

        const listEl = root.querySelector("#notesList");
        const moreBtn = root.querySelector("#notesMore");
        const filterEl = root.querySelector("#notesFilter");
        let expandido = false;
        let filtro = "";

        function notaLi(n) {
            const d = n.data;
            const estadoClase = String(d.estado || "").toLowerCase() === "pagado" ? "paid" : "pending";
            const conceptosTxt = Array.isArray(n.pdf.items)
                ? n.pdf.items.map(i => i.concept).join(" · ")
                : String(d.conceptos ?? "—");
            return `
                <li class="note-item">
                    <div class="note-meta">
                        <span class="note-id">${escape(n.folio)}</span>
                        <span class="note-id">Cliente: ${escape(formatClienteId(d.cliente))}</span>
                        <span class="note-date">${escape(n.fechaStr)}</span>
                    </div>
                    <div class="note-info">
                        <p class="note-service">${escape(conceptosTxt)}</p>
                        <p class="note-total">Total: ${escape(money(d.total))}</p>
                        <p class="note-status ${estadoClase}">Estado: ${escape(d.estado)}</p>
                    </div>
                    <button type="button" class="btn btn-primary note-dl" data-idx="${n.idx}">Descargar PDF</button>
                </li>
            `;
        }

        function pintar() {
            const q = filtro.trim().toLowerCase();
            const filtradas = q
                ? notas.filter(n => n.fechaStr.toLowerCase().includes(q) || n.folio.toLowerCase().includes(q))
                : notas;

            // El colapso solo aplica sin filtro activo.
            const colapsadoAhora = colapsable && !q && !expandido;
            const visibles = colapsadoAhora ? filtradas.slice(0, 3) : filtradas;

            if (!filtradas.length) {
                listEl.innerHTML = '<li class="notes-empty-filter">Sin notas para esa búsqueda.</li>';
            } else {
                listEl.innerHTML = visibles.map(notaLi).join("");
                listEl.querySelectorAll(".note-dl").forEach((btn) => {
                    btn.addEventListener("click", () => {
                        const n = notas[parseInt(btn.dataset.idx, 10)];
                        if (!n) return;
                        if (window.AlasPDF) window.AlasPDF.generate(n.pdf);
                        else alert("Generador de PDF no disponible.");
                    });
                });
            }

            if (moreBtn) {
                const ocultas = filtradas.length - visibles.length;
                if (colapsadoAhora && ocultas > 0) {
                    moreBtn.hidden = false;
                    moreBtn.textContent = `Ver ${ocultas} nota${ocultas === 1 ? "" : "s"} más ▼`;
                } else if (colapsable && !q && expandido) {
                    moreBtn.hidden = false;
                    moreBtn.textContent = "Ocultar ▲";
                } else {
                    moreBtn.hidden = true;
                }
            }
        }

        if (moreBtn) moreBtn.addEventListener("click", () => { expandido = !expandido; pintar(); });
        if (filterEl) filterEl.addEventListener("input", () => { filtro = filterEl.value; pintar(); });

        pintar();
    }

    async function buscarNota(cliente, validacion) {
        const root = document.getElementById("notesResults");
        if (root) root.innerHTML = '<p class="notes-count">Buscando…</p>';

        const url = `${API_BASE}/api/notas/${encodeURIComponent(cliente)}?validacion=${encodeURIComponent(validacion)}`;
        console.log("[FRONT] GET", url);

        try {
            const res = await fetch(url, { method: "GET" });
            const body = await res.json().catch(() => ({}));

            if (res.status === 404) {
                renderNotFound();
                return;
            }
            if (!res.ok || !body.ok) {
                renderError(body.error || `Error del servidor (${res.status}).`);
                return;
            }

            // El backend devuelve un array de notas (puede traer 1..N).
            const data = Array.isArray(body.data)
                ? body.data
                : (body.data ? [body.data] : []);
            if (!data.length) {
                renderNotFound();
                return;
            }
            renderNotas(data);
            flashAndScroll(root);
        } catch (err) {
            console.error("[FRONT] Error fetch:", err);
            renderError("No se pudo conectar al servidor. Verifica que el backend esté corriendo.");
        }
    }

    const form = document.getElementById("notesForm");
    if (form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            const data = new FormData(form);
            const cliente = String(data.get("customer") || "").trim();
            const validacion = String(data.get("key") || "").trim();
            if (!cliente || !validacion) {
                renderError("Captura número de cliente y validación.");
                return;
            }
            buscarNota(cliente, validacion);
        });
    }

    window.AlasNotes = { buscar: buscarNota };
})();

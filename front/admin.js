(() => {
  const API_BASE = window.location.origin.startsWith("http")
    ? window.location.origin
    : "http://localhost:3000";

  const form = document.getElementById("svcForm");
  const list = document.getElementById("svcList");
  const toastEl = document.getElementById("toast");

  function escape(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function money(n) {
    return "$" + (Number(n) || 0).toLocaleString("es-MX", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }

  function fechaCorta(f) {
    if (!f) return "—";
    const d = new Date(f);
    if (isNaN(d.getTime())) return String(f);
    return d.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
  }

  function badge(estado) {
    const k = String(estado || "").toUpperCase();
    const cls = k === "PENDIENTE" ? "PEND" : k === "EN_PROCESO" ? "PROC" : "TERM";
    return `<span class="badge ${cls}">${escape(k)}</span>`;
  }

  let toastTimer = null;
  function toast(msg, isError) {
    toastEl.textContent = msg;
    toastEl.classList.toggle("error", !!isError);
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3500);
  }

  async function listar() {
    list.innerHTML = '<p class="svc-empty">Cargando…</p>';
    try {
      const res = await fetch(`${API_BASE}/api/servicios`);
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "Error");
      render(body.data);
    } catch (err) {
      list.innerHTML = `<p class="svc-empty">Error: ${escape(err.message)}</p>`;
    }
  }

  function render(rows) {
    if (!rows.length) {
      list.innerHTML = '<p class="svc-empty">Sin servicios activos.</p>';
      return;
    }
    list.innerHTML = `
      <table class="svc-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Trabajo</th>
            <th>Total</th>
            <th>Inicio</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td>
                <strong>${escape(r.nombre_cliente)}</strong><br />
                <small>${escape(r.numero_cliente)} · ${escape(r.telefono || "—")}</small>
              </td>
              <td>${escape(r.descripcion)}</td>
              <td>${money(r.total)}</td>
              <td>${escape(fechaCorta(r.fecha_inicio))}</td>
              <td>${badge(r.estado)}</td>
              <td>
                <button class="btn btn-primary svc-fin" data-id="${r.id}">Finalizar</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
    list.querySelectorAll(".svc-fin").forEach((b) =>
      b.addEventListener("click", () => finalizar(parseInt(b.dataset.id, 10)))
    );
  }

  async function finalizar(id) {
    if (!confirm("¿Finalizar trabajo y generar nota?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/servicios/${id}/finalizar`, { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "Error");
      toast(`Nota generada: ${body.data.numero_nota}`);
      listar();
    } catch (err) {
      toast(err.message, true);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const res = await fetch(`${API_BASE}/api/servicios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "Error");
      toast("Servicio creado.");
      form.reset();
      listar();
    } catch (err) {
      toast(err.message, true);
    }
  });

  listar();
})();

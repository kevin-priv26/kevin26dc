import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://vlrxwlzapvvaxbatjccv.supabase.co";
const SUPABASE_KEY = "sb_publishable_Iw47QxQo5nU6YK5o6ts97g_pafbo00a";
const BUCKET = "archivos";
const MAX_BYTES = 5 * 1024 * 1024;
const EXT_OK = ["xlsx", "xls", "xlsm", "csv", "png", "jpg", "jpeg", "gif", "webp"];

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const bucket = () => sb.storage.from(BUCKET);

const $ = (sel) => document.querySelector(sel);
const filesList = $("#filesList");
const adminLogin = $("#adminLogin");
const adminPanel = $("#adminPanel");
const adminToggle = $("#adminToggle");
const viewerToggle = $("#viewerToggle");
const fileInput = $("#fileInput");
const uploadStatus = $("#uploadStatus");

let esAdmin = false;

const estado = (el, texto, error = false) => {
  el.textContent = texto;
  el.classList.toggle("is-error", error);
};
const tamano = (b) => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
const fecha = (iso) => iso ? new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
const esImagen = (a) => (a.type || "").startsWith("image/");

function nombreSeguro(nombre) {
  const limpio = nombre
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-100);
  return `${Date.now()}_${limpio}`;
}
const nombreVisible = (key) => key.replace(/^\d+_/, "");

async function actualizarVista() {
  const { data } = await sb.auth.getSession();
  const sesion = data?.session;
  esAdmin = Boolean(sesion);
  adminPanel.classList.toggle("hidden", !esAdmin);
  adminToggle.classList.toggle("hidden", esAdmin);
  if (esAdmin) {
    adminLogin.classList.add("hidden");
    $("#adminWho").textContent = `Administrador · ${sesion.user.email}`;
  }
}

async function cargarArchivos() {
  const { data, error } = await bucket().list("", {
    limit: 200,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) {
    filesList.innerHTML = '<div class="files__status is-error">No se pudieron cargar los archivos.</div>';
    return;
  }
  const archivos = data
    .filter((o) => o.name !== ".emptyFolderPlaceholder")
    .map((o) => ({
      key: o.name,
      name: nombreVisible(o.name),
      type: o.metadata?.mimetype || "",
      size: o.metadata?.size || 0,
      uploadedAt: o.created_at,
    }));

  filesList.innerHTML = "";
  if (!archivos.length) {
    filesList.innerHTML = '<div class="files__status">Todavía no hay archivos.</div>';
    return;
  }
  archivos.forEach((a) => filesList.appendChild(filaArchivo(a)));
}

function filaArchivo(a) {
  const urlVer = bucket().getPublicUrl(a.key).data.publicUrl;
  const urlDescarga = bucket().getPublicUrl(a.key, { download: a.name }).data.publicUrl;

  const row = document.createElement("div");
  row.className = "list__row";

  const info = document.createElement("div");
  info.className = "files__info";
  if (esImagen(a)) {
    const img = new Image();
    img.className = "files__thumb";
    img.loading = "lazy";
    img.alt = "";
    img.src = urlVer;
    info.appendChild(img);
  } else {
    const ico = document.createElement("div");
    ico.className = "files__icon";
    ico.textContent = (a.name.split(".").pop() || "").toUpperCase().slice(0, 4);
    info.appendChild(ico);
  }
  const main = document.createElement("div");
  main.className = "list__main";
  const nombre = document.createElement("strong");
  nombre.textContent = a.name;
  const meta = document.createElement("span");
  meta.textContent = `${fecha(a.uploadedAt)} · ${tamano(a.size)}`;
  main.append(nombre, meta);
  info.appendChild(main);

  const acciones = document.createElement("div");
  acciones.className = "actions";
  const descargar = document.createElement("a");
  descargar.className = "btn btn--small btn--solid";
  descargar.href = urlDescarga;
  descargar.textContent = "Descargar";
  acciones.appendChild(descargar);

  if (esAdmin) {
    const borrar = document.createElement("button");
    borrar.className = "btn btn--small btn--danger";
    borrar.type = "button";
    borrar.textContent = "Eliminar";
    borrar.addEventListener("click", () => eliminar(a, borrar));
    acciones.appendChild(borrar);
  }

  row.append(info, acciones);
  return row;
}

async function eliminar(a, boton) {
  if (!confirm(`¿Eliminar “${a.name}”?`)) return;
  boton.disabled = true;
  const { error } = await bucket().remove([a.key]);
  if (error) {
    boton.disabled = false;
    alert("No se pudo eliminar el archivo.");
    return;
  }
  cargarArchivos();
}

$("#uploadBtn").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  const files = [...fileInput.files];
  fileInput.value = "";
  let errores = 0;

  for (const [i, file] of files.entries()) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!EXT_OK.includes(ext)) {
      errores++;
      estado(uploadStatus, `${file.name}: tipo de archivo no permitido.`, true);
      continue;
    }
    if (file.size > MAX_BYTES) {
      errores++;
      estado(uploadStatus, `${file.name}: supera 5 MB.`, true);
      continue;
    }
    estado(uploadStatus, `Subiendo ${i + 1}/${files.length}: ${file.name}…`);
    const { error } = await bucket().upload(nombreSeguro(file.name), file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (error) {
      errores++;
      estado(uploadStatus, `${file.name}: ${error.message}`, true);
    }
  }
  if (!errores) estado(uploadStatus, files.length === 1 ? "Archivo subido." : `${files.length} archivos subidos.`);
  cargarArchivos();
});

adminToggle.addEventListener("click", () => {
  adminLogin.classList.toggle("hidden");
  if (!adminLogin.classList.contains("hidden")) {
    $("#adminUser").focus();
    estado(uploadStatus, "");
  }
});

adminLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  const st = $("#adminLoginStatus");
  estado(st, "Entrando…");
  const { error } = await sb.auth.signInWithPassword({
    email: $("#adminUser").value.trim(),
    password: $("#adminPass").value,
  });
  $("#adminPass").value = "";
  if (error) {
    estado(st, "Correo o contraseña incorrectos.", true);
    $("#adminPass").focus();
    return;
  }
  estado(st, "");
  await actualizarVista();
  estado(uploadStatus, "Sesión de administrador activa.");
  cargarArchivos();
});

$("#adminLogout").addEventListener("click", async () => {
  await sb.auth.signOut();
  await actualizarVista();
  estado(uploadStatus, "");
  cargarArchivos();
});

viewerToggle.addEventListener("click", async () => {
  adminLogin.classList.add("hidden");
  adminToggle.classList.toggle("hidden", esAdmin);
  estado(uploadStatus, "Modo espectador · puedes ver y descargar los archivos.");
  await cargarArchivos();
  filesList.scrollIntoView({ behavior: "smooth", block: "center" });
});

document.querySelector('[data-modal="modal-corte"]').addEventListener("click", cargarArchivos);

await actualizarVista();
cargarArchivos();

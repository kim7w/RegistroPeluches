import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    deleteDoc,
    doc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCZIgfuXyL6_AZxPjbir7j7LIDxi3k5Xo",
    authDomain: "registropeluches.firebaseapp.com",
    projectId: "registropeluches",
    storageBucket: "registropeluches.firebasestorage.app",
    messagingSenderId: "1090804367320",
    appId: "1:1090804367320:web:15462d9a4dbb4c1f987cad",
    measurementId: "G-VZ537J3Q3E"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const formulario = document.getElementById("formulario");
const lista = document.getElementById("lista");
const buscar = document.getElementById("buscar");
const contador = document.getElementById("contador");
const foto = document.getElementById("foto");
const galeriaPrevia = document.getElementById("galeriaPrevia");
const btnGuardar = document.getElementById("btnGuardar");
const btnCancelar = document.getElementById("btnCancelar");
const limpiarBusqueda = document.getElementById("limpiarBusqueda");
const sinResultados = document.getElementById("sinResultados");

let peluches = [];
let editando = null;
let filtroActivo = "todos";
let visorFotos = [];
let visorIndice = 0;

const normalizar = (valor = "") =>
    String(valor)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

function obtenerFotos(p) {
    const fotos = Array.isArray(p.fotos) ? p.fotos.filter(Boolean) : [];
    if (p.foto && !fotos.includes(p.foto)) fotos.unshift(p.foto);
    return [...new Set(fotos)];
}

function clasificarTamano(tamano = "") {
    const t = normalizar(tamano);
    const numeros = t.match(/\d+(?:[.,]\d+)?/g)?.map(Number) || [];

    if (t.includes("grande") || numeros.some(n => n >= 50)) return "grande";
    if (t.includes("mediano") || t.includes("mediana") || numeros.some(n => n >= 25 && n < 50)) return "mediano";
    if (t.includes("pequeno") || t.includes("pequena") || numeros.some(n => n < 25)) return "pequeno";
    return "";
}

function estadoPeluche(p) {
    const cantidad = Number(p.cantidad ?? 0);
    return cantidad <= 0 ? "Agotado" : (p.estado || "Disponible");
}

function actualizarResumen() {
    const total = peluches.length;
    const unidades = peluches.reduce((s, p) => s + Math.max(0, Number(p.cantidad) || 0), 0);
    const disponibles = peluches.filter(p => estadoPeluche(p) !== "Agotado").length;
    const agotados = peluches.filter(p => estadoPeluche(p) === "Agotado").length;

    document.getElementById("totalPeluche").textContent = total;
    document.getElementById("totalUnidades").textContent = unidades;
    document.getElementById("totalDisponibles").textContent = disponibles;
    document.getElementById("totalAgotados").textContent = agotados;
}

function coincideFiltro(p) {
    if (filtroActivo === "todos") return true;
    if (filtroActivo === "disponible") return estadoPeluche(p) !== "Agotado";
    if (filtroActivo === "agotado") return estadoPeluche(p) === "Agotado";
    return clasificarTamano(p.tamano) === filtroActivo;
}

function coincideBusqueda(p, texto) {
    if (!texto) return true;

    const campos = [
        p.nombre, p.codigo, p.etiqueta, p.tamano,
        p.observaciones, p.precio, p.cantidad, p.fechaIngreso,
        p.estado
    ];

    return normalizar(campos.join(" ")).includes(normalizar(texto));
}

function obtenerFiltrados() {
    const texto = buscar.value;
    return peluches.filter(p => coincideFiltro(p) && coincideBusqueda(p, texto));
}

function actualizarInterfazBusqueda() {
    const texto = buscar.value.trim();
    limpiarBusqueda.classList.toggle("visible", Boolean(texto));

    const resultado = obtenerFiltrados();
    contador.textContent = texto || filtroActivo !== "todos"
        ? `${resultado.length} peluche${resultado.length === 1 ? "" : "s"} encontrado${resultado.length === 1 ? "" : "s"}`
        : `Peluches registrados: ${peluches.length}`;

    const nombresFiltro = {
        todos: "Mostrando todos",
        grande: "Filtro: grandes",
        mediano: "Filtro: medianos",
        pequeno: "Filtro: pequeños",
        disponible: "Filtro: disponibles",
        agotado: "Filtro: agotados"
    };

    document.getElementById("filtroActual").textContent =
        texto ? `Buscando: “${texto}”` : nombresFiltro[filtroActivo];

    mostrarPeluches(resultado);
}

function escaparHTML(valor = "") {
    return String(valor)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function crearTarjeta(p) {
    const fotos = obtenerFotos(p);
    const principal = fotos[0] || "";
    const agotado = estadoPeluche(p) === "Agotado";
    const estado = agotado ? "Agotado" : "Disponible";

    const miniaturas = fotos.length > 1
        ? `<div class="miniaturas">
            ${fotos.map((url, i) => `
                <img src="${escaparHTML(url)}"
                     alt="Foto ${i + 1} de ${escaparHTML(p.nombre || "peluche")}"
                     class="${i === 0 ? "activa" : ""}"
                     loading="lazy"
                     onclick="cambiarFotoTarjeta(event, '${p.id}', ${i})">
            `).join("")}
           </div>`
        : "";

    const imagen = principal
        ? `<img id="foto-${p.id}" src="${escaparHTML(principal)}"
                alt="${escaparHTML(p.nombre || "Peluche")}"
                loading="lazy"
                onclick="abrirVisorPorId('${p.id}', 0)">`
        : `<div class="sin-foto">🧸</div>`;

    return `
        <article class="tarjeta">
            <div class="imagen-principal">
                ${imagen}
                <span class="badge-estado ${agotado ? "agotado" : ""}">${estado}</span>
                <span class="cantidad-badge">📦 ${Number(p.cantidad) || 0}</span>
            </div>
            ${miniaturas}
            <div class="info">
                <h3>${escaparHTML(p.nombre || "Sin nombre")}</h3>
                <div class="etiquetas">
                    ${p.etiqueta ? `<span class="etiqueta-chip">🏷️ ${escaparHTML(p.etiqueta)}</span>` : ""}
                    ${p.tamano ? `<span class="etiqueta-chip">📏 ${escaparHTML(p.tamano)}</span>` : ""}
                </div>
                <div class="precio">Q${escaparHTML(p.precio ?? "0")}</div>
                <div class="datos">
                    <div class="dato"><small>CÓDIGO</small><strong>${escaparHTML(p.codigo || "—")}</strong></div>
                    <div class="dato"><small>CANTIDAD</small><strong>${Number(p.cantidad) || 0}</strong></div>
                    <div class="dato"><small>FECHA</small><strong>${escaparHTML(p.fechaIngreso || "—")}</strong></div>
                    <div class="dato"><small>FOTOS</small><strong>${fotos.length}</strong></div>
                </div>
                ${p.observaciones ? `<p class="observaciones">💬 ${escaparHTML(p.observaciones)}</p>` : ""}
            </div>
            <div class="botones">
                <button type="button" onclick="editarPeluche('${p.id}')">✏️ Editar</button>
                <button type="button" onclick="eliminarPeluche('${p.id}')">🗑️ Eliminar</button>
            </div>
        </article>
    `;
}

function mostrarPeluches(datos) {
    lista.innerHTML = datos.map(crearTarjeta).join("");
    sinResultados.style.display = datos.length ? "none" : "block";
}

function mostrarPrevisualizaciones(files) {
    galeriaPrevia.innerHTML = "";
    [...files].forEach(file => {
        if (!file.type.startsWith("image/")) return;
        const url = URL.createObjectURL(file);
        const img = document.createElement("img");
        img.src = url;
        img.alt = "Vista previa";
        galeriaPrevia.appendChild(img);
    });
}

foto.addEventListener("change", () => mostrarPrevisualizaciones(foto.files));

async function subirImagenCloudinary(archivo) {
    if (!archivo) return "";

    const datos = new FormData();
    datos.append("file", archivo);
    datos.append("upload_preset", "peluches");

    const respuesta = await fetch(
        "https://api.cloudinary.com/v1_1/vspx5rke/image/upload",
        { method: "POST", body: datos }
    );

    if (!respuesta.ok) throw new Error("No se pudo subir una imagen.");
    const resultado = await respuesta.json();
    return resultado.secure_url || "";
}

async function cargarPeluches() {
    try {
        lista.innerHTML = `<div class="sin-resultados"><div>⏳</div><p>Cargando peluches...</p></div>`;
        const consulta = await getDocs(collection(db, "peluches"));

        peluches = [];
        consulta.forEach(documento => {
            peluches.push({
                id: documento.id,
                ...documento.data()
            });
        });

        actualizarResumen();
        actualizarInterfazBusqueda();
    } catch (error) {
        console.error(error);
        lista.innerHTML = `<div class="sin-resultados"><div>⚠️</div><h3>No se pudo cargar el inventario</h3><p>Revisa tu conexión e inténtalo de nuevo.</p></div>`;
    }
}

formulario.addEventListener("submit", async (e) => {
    e.preventDefault();

    const textoOriginal = btnGuardar.textContent;
    btnGuardar.disabled = true;
    btnGuardar.textContent = "⏳ Guardando...";

    try {
        const codigo = document.getElementById("codigo").value.trim();
        const nombre = document.getElementById("nombre").value.trim();
        const precio = document.getElementById("precio").value;
        const etiqueta = document.getElementById("etiqueta").value.trim();
        const tamano = document.getElementById("medida").value.trim();
        const cantidad = document.getElementById("cantidad").value;
        const observaciones = document.getElementById("observaciones").value.trim();
        const fechaIngreso = document.getElementById("fechaIngreso").value;

        let fotos = [];

        if (foto.files.length) {
            const archivos = [...foto.files];
            fotos = (await Promise.all(archivos.map(subirImagenCloudinary))).filter(Boolean);
        } else if (editando) {
            const existente = peluches.find(p => p.id === editando);
            fotos = obtenerFotos(existente);
        }

        const datos = {
            codigo,
            etiqueta,
            nombre,
            precio,
            tamano,
            cantidad,
            observaciones,
            foto: fotos[0] || "",
            fotos,
            fechaIngreso,
            estado: Number(cantidad) > 0 ? "Disponible" : "Agotado"
        };

        if (editando) {
            await updateDoc(doc(db, "peluches", editando), datos);
        } else {
            await addDoc(collection(db, "peluches"), datos);
        }

        formulario.reset();
        galeriaPrevia.innerHTML = "";
        editando = null;
        btnGuardar.textContent = "💾 Guardar peluche";
        btnCancelar.style.display = "none";

        await cargarPeluches();
        window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
        console.error(error);
        alert("No se pudo guardar el peluche. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
        btnGuardar.disabled = false;
        if (!editando) btnGuardar.textContent = "💾 Guardar peluche";
        else btnGuardar.textContent = textoOriginal;
    }
});

buscar.addEventListener("input", actualizarInterfazBusqueda);

limpiarBusqueda.addEventListener("click", () => {
    buscar.value = "";
    buscar.focus();
    actualizarInterfazBusqueda();
});

document.querySelectorAll(".filtro").forEach(boton => {
    boton.addEventListener("click", () => {
        filtroActivo = boton.dataset.filtro;
        document.querySelectorAll(".filtro").forEach(b => b.classList.remove("activo"));
        boton.classList.add("activo");
        actualizarInterfazBusqueda();
    });
});

async function eliminarPeluche(id) {
    if (!confirm("¿Deseas eliminar este peluche?")) return;

    try {
        await deleteDoc(doc(db, "peluches", id));
        await cargarPeluches();
    } catch (error) {
        console.error(error);
        alert("No se pudo eliminar el peluche.");
    }
}

async function editarPeluche(id) {
    const peluche = peluches.find(p => p.id === id);
    if (!peluche) {
        alert("No se encontró el peluche.");
        return;
    }

    document.getElementById("codigo").value = peluche.codigo || "";
    document.getElementById("nombre").value = peluche.nombre || "";
    document.getElementById("precio").value = peluche.precio || "";
    document.getElementById("etiqueta").value = peluche.etiqueta || "";
    document.getElementById("medida").value = peluche.tamano || "";
    document.getElementById("cantidad").value = peluche.cantidad || "";
    document.getElementById("observaciones").value = peluche.observaciones || "";
    document.getElementById("fechaIngreso").value = peluche.fechaIngreso || "";

    galeriaPrevia.innerHTML = obtenerFotos(peluche)
        .map(url => `<img src="${escaparHTML(url)}" alt="Foto guardada">`)
        .join("");

    editando = id;
    btnGuardar.textContent = "💾 Actualizar peluche";
    btnCancelar.style.display = "block";

    document.getElementById("formulario").scrollIntoView({ behavior: "smooth", block: "start" });
}

btnCancelar.addEventListener("click", () => {
    formulario.reset();
    galeriaPrevia.innerHTML = "";
    editando = null;
    btnGuardar.textContent = "💾 Guardar peluche";
    btnCancelar.style.display = "none";
});

function cambiarFotoTarjeta(evento, id, indice) {
    evento.stopPropagation();

    const p = peluches.find(item => item.id === id);
    if (!p) return;

    const fotos = obtenerFotos(p);
    const img = document.getElementById(`foto-${id}`);
    if (img && fotos[indice]) {
        img.src = fotos[indice];
        img.onclick = () => abrirVisorPorId(id, indice);
    }

    const tarjeta = img?.closest(".tarjeta");
    tarjeta?.querySelectorAll(".miniaturas img").forEach((mini, i) => {
        mini.classList.toggle("activa", i === indice);
    });
}

function abrirVisorPorId(id, indice = 0) {
    const p = peluches.find(item => item.id === id);
    if (!p) return;

    visorFotos = obtenerFotos(p);
    visorIndice = Math.max(0, Math.min(indice, visorFotos.length - 1));
    actualizarVisor();
    document.getElementById("visorImagen").classList.add("abierto");
}

function actualizarVisor() {
    const imagen = document.getElementById("imagenGrande");
    imagen.src = visorFotos[visorIndice] || "";
    document.getElementById("contadorImagenes").textContent =
        visorFotos.length > 1 ? `${visorIndice + 1} / ${visorFotos.length}` : "";
}

document.getElementById("imagenAnterior").addEventListener("click", (e) => {
    e.stopPropagation();
    if (visorFotos.length < 2) return;
    visorIndice = (visorIndice - 1 + visorFotos.length) % visorFotos.length;
    actualizarVisor();
});

document.getElementById("imagenSiguiente").addEventListener("click", (e) => {
    e.stopPropagation();
    if (visorFotos.length < 2) return;
    visorIndice = (visorIndice + 1) % visorFotos.length;
    actualizarVisor();
});

function cerrarVisor() {
    document.getElementById("visorImagen").classList.remove("abierto");
}

document.getElementById("cerrarVisor").addEventListener("click", cerrarVisor);

document.getElementById("visorImagen").addEventListener("click", (e) => {
    if (e.target.id === "visorImagen") cerrarVisor();
});

document.addEventListener("keydown", (e) => {
    const visorAbierto = document.getElementById("visorImagen").classList.contains("abierto");
    if (!visorAbierto) return;

    if (e.key === "Escape") cerrarVisor();
    if (e.key === "ArrowLeft") {
        visorIndice = (visorIndice - 1 + visorFotos.length) % visorFotos.length;
        actualizarVisor();
    }
    if (e.key === "ArrowRight") {
        visorIndice = (visorIndice + 1) % visorFotos.length;
        actualizarVisor();
    }
});

const toggleFormulario = document.getElementById("toggleFormulario");
const formularioPanel = document.querySelector(".formulario-panel");
toggleFormulario.addEventListener("click", () => {
    const colapsado = formularioPanel.classList.toggle("collapsado");
    toggleFormulario.setAttribute("aria-expanded", String(!colapsado));
    document.getElementById("flechaFormulario").textContent = colapsado ? "⌄" : "⌃";
});

window.editarPeluche = editarPeluche;
window.eliminarPeluche = eliminarPeluche;
window.cambiarFotoTarjeta = cambiarFotoTarjeta;
window.abrirVisorPorId = abrirVisorPorId;

cargarPeluches();

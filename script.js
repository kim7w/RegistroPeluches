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


// ============================================================
// FIREBASE
// ============================================================

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


// ============================================================
// ELEMENTOS
// ============================================================

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


// ============================================================
// UTILIDADES
// ============================================================

const normalizar = (valor = "") =>
    String(valor)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();


function escaparHTML(valor = "") {
    return String(valor)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function obtenerFotos(p) {

    const fotos = Array.isArray(p.fotos)
        ? p.fotos.filter(Boolean)
        : [];

    if (p.foto && !fotos.includes(p.foto)) {
        fotos.unshift(p.foto);
    }

    return [...new Set(fotos)];
}


function clasificarTamano(tamano = "") {

    const t = normalizar(tamano);

    const numeros =
        t.match(/\d+(?:[.,]\d+)?/g)
            ?.map(Number) || [];

    if (
        t.includes("grande") ||
        numeros.some(n => n >= 50)
    ) {
        return "grande";
    }

    if (
        t.includes("mediano") ||
        t.includes("mediana") ||
        numeros.some(n => n >= 25 && n < 50)
    ) {
        return "mediano";
    }

    if (
        t.includes("pequeno") ||
        t.includes("pequena") ||
        numeros.some(n => n < 25)
    ) {
        return "pequeno";
    }

    return "";
}


function estadoPeluche(p) {

    const cantidad = Number(p.cantidad ?? 0);

    return cantidad <= 0
        ? "Agotado"
        : (p.estado || "Disponible");
}


// ============================================================
// RESUMEN
// ============================================================

function actualizarResumen() {

    const total = peluches.length;

    const unidades = peluches.reduce(
        (s, p) =>
            s + Math.max(0, Number(p.cantidad) || 0),
        0
    );

    const disponibles =
        peluches.filter(
            p => estadoPeluche(p) !== "Agotado"
        ).length;

    const agotados =
        peluches.filter(
            p => estadoPeluche(p) === "Agotado"
        ).length;


    const totalPeluche =
        document.getElementById("totalPeluche");

    const totalUnidades =
        document.getElementById("totalUnidades");

    const totalDisponibles =
        document.getElementById("totalDisponibles");

    const totalAgotados =
        document.getElementById("totalAgotados");


    if (totalPeluche) {
        totalPeluche.textContent = total;
    }

    if (totalUnidades) {
        totalUnidades.textContent = unidades;
    }

    if (totalDisponibles) {
        totalDisponibles.textContent = disponibles;
    }

    if (totalAgotados) {
        totalAgotados.textContent = agotados;
    }
}


// ============================================================
// FILTROS
// ============================================================

function coincideFiltro(p) {

    if (filtroActivo === "todos") {
        return true;
    }

    if (filtroActivo === "disponible") {
        return estadoPeluche(p) !== "Agotado";
    }

    if (filtroActivo === "agotado") {
        return estadoPeluche(p) === "Agotado";
    }

    return clasificarTamano(p.tamano) === filtroActivo;
}


function coincideBusqueda(p, texto) {

    if (!texto) {
        return true;
    }

    const campos = [
        p.nombre,
        p.codigo,
        p.etiqueta,
        p.tamano,
        p.observaciones,
        p.precio,
        p.cantidad,
        p.fechaIngreso,
        p.estado
    ];

    return normalizar(
        campos.join(" ")
    ).includes(
        normalizar(texto)
    );
}


function obtenerFiltrados() {

    const texto = buscar.value;

    return peluches.filter(
        p =>
            coincideFiltro(p) &&
            coincideBusqueda(p, texto)
    );
}


// ============================================================
// BÚSQUEDA
// ============================================================

function actualizarInterfazBusqueda() {

    const texto = buscar.value.trim();

    if (limpiarBusqueda) {
        limpiarBusqueda.classList.toggle(
            "visible",
            Boolean(texto)
        );
    }


    const resultado = obtenerFiltrados();


    if (contador) {

        contador.textContent =
            texto || filtroActivo !== "todos"
                ? `${resultado.length} peluche${resultado.length === 1 ? "" : "s"} encontrado${resultado.length === 1 ? "" : "s"}`
                : `Peluches registrados: ${peluches.length}`;
    }


    const nombresFiltro = {

        todos: "Mostrando todos",

        grande: "Filtro: grandes",

        mediano: "Filtro: medianos",

        pequeno: "Filtro: pequeños",

        disponible: "Filtro: disponibles",

        agotado: "Filtro: agotados"
    };


    const filtroActual =
        document.getElementById("filtroActual");


    if (filtroActual) {

        filtroActual.textContent =
            texto
                ? `Buscando: “${texto}”`
                : nombresFiltro[filtroActivo];
    }


    mostrarPeluches(resultado);
}


// ============================================================
// TARJETAS
// ============================================================

function crearTarjeta(p) {

    const fotos = obtenerFotos(p);

    const principal = fotos[0] || "";

    const agotado =
        estadoPeluche(p) === "Agotado";

    const estado =
        agotado
            ? "Agotado"
            : "Disponible";


    const miniaturas =
        fotos.length > 1

            ? `
                <div class="miniaturas">

                    ${fotos.map((url, i) => `

                        <img
                            src="${escaparHTML(url)}"
                            alt="Foto ${i + 1} de ${escaparHTML(p.nombre || "peluche")}"
                            class="${i === 0 ? "activa" : ""}"
                            loading="lazy"
                            onclick="cambiarFotoTarjeta(event, '${p.id}', ${i})"
                        >

                    `).join("")}

                </div>
            `

            : "";


    const imagen = principal

        ? `
            <img
                id="foto-${p.id}"
                src="${escaparHTML(principal)}"
                alt="${escaparHTML(p.nombre || "Peluche")}"
                loading="lazy"
                onclick="abrirVisorPorId('${p.id}', 0)"
            >
        `

        : `
            <div class="sin-foto">
                🧸
            </div>
        `;


    return `

        <article class="tarjeta">

            <div class="imagen-principal">

                ${imagen}

                <span class="badge-estado ${agotado ? "agotado" : ""}">
                    ${estado}
                </span>

                <span class="cantidad-badge">
                    📦 ${Number(p.cantidad) || 0}
                </span>

            </div>


            ${miniaturas}


            <div class="info">

                <h3>
                    ${escaparHTML(
                        p.nombre || "Sin nombre"
                    )}
                </h3>


                <div class="etiquetas">

                    ${
                        p.etiqueta
                            ? `
                                <span class="etiqueta-chip">
                                    🏷️ ${escaparHTML(p.etiqueta)}
                                </span>
                              `
                            : ""
                    }


                    ${
                        p.tamano
                            ? `
                                <span class="etiqueta-chip">
                                    📏 ${escaparHTML(p.tamano)}
                                </span>
                              `
                            : ""
                    }

                </div>


                <div class="precio">
                    Q${escaparHTML(p.precio ?? "0")}
                </div>


                <div class="datos">

                    <div class="dato">
                        <small>CÓDIGO</small>
                        <strong>
                            ${escaparHTML(p.codigo || "—")}
                        </strong>
                    </div>


                    <div class="dato">
                        <small>CANTIDAD</small>
                        <strong>
                            ${Number(p.cantidad) || 0}
                        </strong>
                    </div>


                    <div class="dato">
                        <small>FECHA</small>
                        <strong>
                            ${escaparHTML(
                                p.fechaIngreso || "—"
                            )}
                        </strong>
                    </div>


                    <div class="dato">
                        <small>FOTOS</small>
                        <strong>
                            ${fotos.length}
                        </strong>
                    </div>

                </div>


                ${
                    p.observaciones

                        ? `
                            <p class="observaciones">
                                💬 ${escaparHTML(
                                    p.observaciones
                                )}
                            </p>
                          `

                        : ""
                }

            </div>


            <div class="botones">

                <button
                    type="button"
                    onclick="editarPeluche('${p.id}')"
                >
                    ✏️ Editar
                </button>


                <button
                    type="button"
                    onclick="eliminarPeluche('${p.id}')"
                >
                    🗑️ Eliminar
                </button>

            </div>

        </article>
    `;
}


function mostrarPeluches(datos) {

    if (!lista) {
        return;
    }

    lista.innerHTML =
        datos.map(crearTarjeta).join("");


    if (sinResultados) {

        sinResultados.style.display =
            datos.length
                ? "none"
                : "block";
    }
}


// ============================================================
// FOTOS - PREVISUALIZACIÓN
// ============================================================

function mostrarPrevisualizaciones(files) {

    if (!galeriaPrevia) {
        return;
    }

    galeriaPrevia.innerHTML = "";


    [...files].forEach(file => {

        if (!file.type.startsWith("image/")) {
            return;
        }


        const url =
            URL.createObjectURL(file);


        const img =
            document.createElement("img");


        img.src = url;

        img.alt = "Vista previa";


        img.onload = () => {
            URL.revokeObjectURL(url);
        };


        galeriaPrevia.appendChild(img);

    });
}


if (foto) {

    foto.addEventListener(
        "change",
        () => mostrarPrevisualizaciones(
            foto.files
        )
    );
}


// ============================================================
// COMPRESIÓN DE IMÁGENES
// ============================================================

async function comprimirImagen(
    archivo,
    maxSize = 1600,
    calidad = 0.80
) {

    // GIF y SVG se mantienen originales
    // para evitar problemas con animaciones
    // o gráficos vectoriales.

    if (
        archivo.type === "image/gif" ||
        archivo.type === "image/svg+xml"
    ) {
        return archivo;
    }


    return new Promise((resolve, reject) => {

        const imagen =
            new Image();

        const url =
            URL.createObjectURL(archivo);


        imagen.onload = () => {

            URL.revokeObjectURL(url);


            let ancho =
                imagen.naturalWidth;

            let alto =
                imagen.naturalHeight;


            // Reducir solamente si es demasiado grande

            if (
                ancho > maxSize ||
                alto > maxSize
            ) {

                const escala =
                    Math.min(
                        maxSize / ancho,
                        maxSize / alto
                    );

                ancho =
                    Math.round(ancho * escala);

                alto =
                    Math.round(alto * escala);
            }


            const canvas =
                document.createElement("canvas");


            canvas.width = ancho;
            canvas.height = alto;


            const contexto =
                canvas.getContext("2d");


            if (!contexto) {

                resolve(archivo);

                return;
            }


            contexto.drawImage(
                imagen,
                0,
                0,
                ancho,
                alto
            );


            canvas.toBlob(
                blob => {

                    if (!blob) {

                        resolve(archivo);

                        return;
                    }


                    const nuevoArchivo =
                        new File(
                            [blob],
                            archivo.name.replace(
                                /\.[^/.]+$/,
                                ""
                            ) + ".webp",
                            {
                                type: "image/webp",
                                lastModified:
                                    Date.now()
                            }
                        );


                    resolve(nuevoArchivo);

                },
                "image/webp",
                calidad
            );

        };


        imagen.onerror = () => {

            URL.revokeObjectURL(url);

            resolve(archivo);
        };


        imagen.src = url;

    });
}


// ============================================================
// SUBIR IMAGEN A CLOUDINARY
// ============================================================

async function subirImagenCloudinary(
    archivo
) {

    if (!archivo) {
        return "";
    }


    // ⭐ NUEVO:
    // comprimir antes de subir

    const archivoOptimizado =
        await comprimirImagen(archivo);


    const datos =
        new FormData();


    datos.append(
        "file",
        archivoOptimizado
    );


    datos.append(
        "upload_preset",
        "peluches"
    );


    const respuesta =
        await fetch(
            "https://api.cloudinary.com/v1_1/vspx5rke/image/upload",
            {
                method: "POST",
                body: datos
            }
        );


    if (!respuesta.ok) {

        throw new Error(
            "No se pudo subir una imagen."
        );
    }


    const resultado =
        await respuesta.json();


    return resultado.secure_url || "";
}


// ============================================================
// CARGAR PELUCHES
// ============================================================

async function cargarPeluches() {

    try {

        if (lista) {

            lista.innerHTML = `
                <div class="sin-resultados">
                    <div>⏳</div>
                    <p>Cargando peluches...</p>
                </div>
            `;
        }


        const consulta =
            await getDocs(
                collection(
                    db,
                    "peluches"
                )
            );


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


        if (lista) {

            lista.innerHTML = `
                <div class="sin-resultados">
                    <div>⚠️</div>

                    <h3>
                        No se pudo cargar el inventario
                    </h3>

                    <p>
                        Revisa tu conexión e inténtalo de nuevo.
                    </p>
                </div>
            `;
        }
    }
}


// ============================================================
// GUARDAR / EDITAR
// ============================================================

if (formulario) {

    formulario.addEventListener(
        "submit",
        async e => {

            e.preventDefault();


            const textoOriginal =
                btnGuardar
                    ? btnGuardar.textContent
                    : "";


            if (btnGuardar) {

                btnGuardar.disabled = true;

                btnGuardar.textContent =
                    "⏳ Guardando...";
            }


            try {

                const codigo =
                    document
                        .getElementById("codigo")
                        .value
                        .trim();


                const nombre =
                    document
                        .getElementById("nombre")
                        .value
                        .trim();


                const precio =
                    document
                        .getElementById("precio")
                        .value;


                const etiqueta =
                    document
                        .getElementById("etiqueta")
                        .value
                        .trim();


                const tamano =
                    document
                        .getElementById("medida")
                        .value
                        .trim();


                const cantidad =
                    document
                        .getElementById("cantidad")
                        .value;


                const observaciones =
                    document
                        .getElementById("observaciones")
                        .value
                        .trim();


                const fechaIngreso =
                    document
                        .getElementById("fechaIngreso")
                        ?.value || "";


                let fotos = [];


                // ==================================================
                // FOTOS
                // ==================================================

                if (
                    foto &&
                    foto.files &&
                    foto.files.length
                ) {

                    const archivos =
                        [...foto.files];


                    // Las imágenes se suben en paralelo
                    // para ahorrar tiempo.

                    fotos =
                        (
                            await Promise.all(
                                archivos.map(
                                    subirImagenCloudinary
                                )
                            )
                        ).filter(Boolean);


                } else if (editando) {

                    const existente =
                        peluches.find(
                            p =>
                                p.id === editando
                        );


                    fotos =
                        existente
                            ? obtenerFotos(existente)
                            : [];
                }


                // ==================================================
                // DATOS
                // ==================================================

                const datos = {

                    codigo,

                    etiqueta,

                    nombre,

                    precio,

                    tamano,

                    cantidad,

                    observaciones,

                    foto:
                        fotos[0] || "",

                    fotos,

                    fechaIngreso,

                    estado:
                        Number(cantidad) > 0
                            ? "Disponible"
                            : "Agotado"
                };


                // ==================================================
                // EDITAR
                // ==================================================

                if (editando) {

                    const id =
                        editando;


                    await updateDoc(
                        doc(
                            db,
                            "peluches",
                            id
                        ),
                        datos
                    );


                    // ⭐ MUY IMPORTANTE:
                    // actualizar solamente el producto
                    // en memoria.

                    const indice =
                        peluches.findIndex(
                            p =>
                                p.id === id
                        );


                    if (indice !== -1) {

                        peluches[indice] = {

                            id,

                            ...datos
                        };
                    }


                }

                // ==================================================
                // NUEVO PRODUCTO
                // ==================================================

                else {

                    const nuevoDocumento =
                        await addDoc(
                            collection(
                                db,
                                "peluches"
                            ),
                            datos
                        );


                    // ⭐ En lugar de volver a descargar
                    // TODOS los productos, agregamos
                    // solamente el nuevo.

                    peluches.unshift({

                        id:
                            nuevoDocumento.id,

                        ...datos
                    });
                }


                // ==================================================
                // ACTUALIZAR PANTALLA
                // ==================================================

                actualizarResumen();

                actualizarInterfazBusqueda();


                // Limpiar formulario

                formulario.reset();


                if (galeriaPrevia) {
                    galeriaPrevia.innerHTML = "";
                }


                editando = null;


                if (btnGuardar) {

                    btnGuardar.textContent =
                        "💾 Guardar peluche";
                }


                if (btnCancelar) {

                    btnCancelar.style.display =
                        "none";
                }


                // Volver arriba

                window.scrollTo({
                    top: 0,
                    behavior: "smooth"
                });


            } catch (error) {

                console.error(error);


                alert(
                    "No se pudo guardar el peluche. Revisa tu conexión e inténtalo de nuevo."
                );


            } finally {

                if (btnGuardar) {

                    btnGuardar.disabled = false;


                    if (!editando) {

                        btnGuardar.textContent =
                            "💾 Guardar peluche";

                    } else {

                        btnGuardar.textContent =
                            textoOriginal;
                    }
                }
            }
        }
    );
}


// ============================================================
// BÚSQUEDA
// ============================================================

if (buscar) {

    buscar.addEventListener(
        "input",
        actualizarInterfazBusqueda
    );
}


if (limpiarBusqueda) {

    limpiarBusqueda.addEventListener(
        "click",
        () => {

            buscar.value = "";

            buscar.focus();

            actualizarInterfazBusqueda();
        }
    );
}


// ============================================================
// FILTROS
// ============================================================

document
    .querySelectorAll(".filtro")
    .forEach(boton => {

        boton.addEventListener(
            "click",
            () => {

                filtroActivo =
                    boton.dataset.filtro;


                document
                    .querySelectorAll(".filtro")
                    .forEach(b =>
                        b.classList.remove(
                            "activo"
                        )
                    );


                boton.classList.add(
                    "activo"
                );


                actualizarInterfazBusqueda();
            }
        );
    });


// ============================================================
// ELIMINAR
// ============================================================

async function eliminarPeluche(id) {

    if (
        !confirm(
            "¿Deseas eliminar este peluche?"
        )
    ) {
        return;
    }


    try {

        await deleteDoc(
            doc(
                db,
                "peluches",
                id
            )
        );


        // ⭐ Ya no descargamos todo Firebase.
        // Solo quitamos el producto eliminado.

        peluches =
            peluches.filter(
                p =>
                    p.id !== id
            );


        actualizarResumen();

        actualizarInterfazBusqueda();


    } catch (error) {

        console.error(error);

        alert(
            "No se pudo eliminar el peluche."
        );
    }
}


// ============================================================
// EDITAR
// ============================================================

async function editarPeluche(id) {

    const peluche =
        peluches.find(
            p =>
                p.id === id
        );


    if (!peluche) {

        alert(
            "No se encontró el peluche."
        );

        return;
    }


    document
        .getElementById("codigo")
        .value =
        peluche.codigo || "";


    document
        .getElementById("nombre")
        .value =
        peluche.nombre || "";


    document
        .getElementById("precio")
        .value =
        peluche.precio || "";


    document
        .getElementById("etiqueta")
        .value =
        peluche.etiqueta || "";


    document
        .getElementById("medida")
        .value =
        peluche.tamano || "";


    document
        .getElementById("cantidad")
        .value =
        peluche.cantidad || "";


    document
        .getElementById("observaciones")
        .value =
        peluche.observaciones || "";


    const fecha =
        document.getElementById(
            "fechaIngreso"
        );


    if (fecha) {

        fecha.value =
            peluche.fechaIngreso || "";
    }


    if (galeriaPrevia) {

        galeriaPrevia.innerHTML =
            obtenerFotos(peluche)
                .map(
                    url =>
                        `<img src="${escaparHTML(url)}" alt="Foto guardada">`
                )
                .join("");
    }


    editando = id;


    if (btnGuardar) {

        btnGuardar.textContent =
            "💾 Actualizar peluche";
    }


    if (btnCancelar) {

        btnCancelar.style.display =
            "block";
    }


    formulario.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


// ============================================================
// CANCELAR EDICIÓN
// ============================================================

if (btnCancelar) {

    btnCancelar.addEventListener(
        "click",
        () => {

            formulario.reset();


            if (galeriaPrevia) {
                galeriaPrevia.innerHTML = "";
            }


            editando = null;


            btnGuardar.textContent =
                "💾 Guardar peluche";


            btnCancelar.style.display =
                "none";
        }
    );
}


// ============================================================
// CAMBIAR FOTO DE TARJETA
// ============================================================

function cambiarFotoTarjeta(
    evento,
    id,
    indice
) {

    evento.stopPropagation();


    const p =
        peluches.find(
            item =>
                item.id === id
        );


    if (!p) {
        return;
    }


    const fotos =
        obtenerFotos(p);


    const img =
        document.getElementById(
            `foto-${id}`
        );


    if (
        img &&
        fotos[indice]
    ) {

        img.src =
            fotos[indice];


        img.onclick =
            () =>
                abrirVisorPorId(
                    id,
                    indice
                );
    }


    const tarjeta =
        img?.closest(
            ".tarjeta"
        );


    tarjeta
        ?.querySelectorAll(
            ".miniaturas img"
        )
        .forEach(
            (mini, i) => {

                mini.classList.toggle(
                    "activa",
                    i === indice
                );
            }
        );
}


// ============================================================
// VISOR DE FOTOS
// ============================================================

function abrirVisorPorId(
    id,
    indice = 0
) {

    const p =
        peluches.find(
            item =>
                item.id === id
        );


    if (!p) {
        return;
    }


    visorFotos =
        obtenerFotos(p);


    visorIndice =
        Math.max(
            0,
            Math.min(
                indice,
                visorFotos.length - 1
            )
        );


    actualizarVisor();


    const visor =
        document.getElementById(
            "visorImagen"
        );


    if (visor) {

        visor.classList.add(
            "abierto"
        );
    }
}


function actualizarVisor() {

    const imagen =
        document.getElementById(
            "imagenGrande"
        );


    const contadorImagenes =
        document.getElementById(
            "contadorImagenes"
        );


    if (imagen) {

        imagen.src =
            visorFotos[visorIndice] || "";
    }


    if (contadorImagenes) {

        contadorImagenes.textContent =
            visorFotos.length > 1
                ? `${visorIndice + 1} / ${visorFotos.length}`
                : "";
    }
}


// ============================================================
// FOTO ANTERIOR
// ============================================================

const imagenAnterior =
    document.getElementById(
        "imagenAnterior"
    );


if (imagenAnterior) {

    imagenAnterior.addEventListener(
        "click",
        e => {

            e.stopPropagation();


            if (
                visorFotos.length < 2
            ) {
                return;
            }


            visorIndice =
                (
                    visorIndice -
                    1 +
                    visorFotos.length
                ) %
                visorFotos.length;


            actualizarVisor();
        }
    );
}


// ============================================================
// FOTO SIGUIENTE
// ============================================================

const imagenSiguiente =
    document.getElementById(
        "imagenSiguiente"
    );


if (imagenSiguiente) {

    imagenSiguiente.addEventListener(
        "click",
        e => {

            e.stopPropagation();


            if (
                visorFotos.length < 2
            ) {
                return;
            }


            visorIndice =
                (
                    visorIndice +
                    1
                ) %
                visorFotos.length;


            actualizarVisor();
        }
    );
}


// ============================================================
// CERRAR VISOR
// ============================================================

function cerrarVisor() {

    const visor =
        document.getElementById(
            "visorImagen"
        );


    if (visor) {

        visor.classList.remove(
            "abierto"
        );
    }
}


const cerrarVisorBoton =
    document.getElementById(
        "cerrarVisor"
    );


if (cerrarVisorBoton) {

    cerrarVisorBoton.addEventListener(
        "click",
        cerrarVisor
    );
}


const visor =
    document.getElementById(
        "visorImagen"
    );


if (visor) {

    visor.addEventListener(
        "click",
        e => {

            if (
                e.target.id ===
                "visorImagen"
            ) {

                cerrarVisor();
            }
        }
    );
}


// ============================================================
// TECLADO
// ============================================================

document.addEventListener(
    "keydown",
    e => {

        const visorActual =
            document.getElementById(
                "visorImagen"
            );


        const visorAbierto =
            visorActual &&
            visorActual.classList.contains(
                "abierto"
            );


        if (!visorAbierto) {
            return;
        }


        if (
            e.key ===
            "Escape"
        ) {

            cerrarVisor();

            return;
        }


        if (
            e.key ===
            "ArrowLeft"
        ) {

            if (
                visorFotos.length < 2
            ) {
                return;
            }


            visorIndice =
                (
                    visorIndice -
                    1 +
                    visorFotos.length
                ) %
                visorFotos.length;


            actualizarVisor();
        }


        if (
            e.key ===
            "ArrowRight"
        ) {

            if (
                visorFotos.length < 2
            ) {
                return;
            }


            visorIndice =
                (
                    visorIndice +
                    1
                ) %
                visorFotos.length;


            actualizarVisor();
        }
    }
);


// ============================================================
// FORMULARIO COLAPSABLE
// ============================================================

const toggleFormulario =
    document.getElementById(
        "toggleFormulario"
    );


const formularioPanel =
    document.querySelector(
        ".formulario-panel"
    );


if (
    toggleFormulario &&
    formularioPanel
) {

    toggleFormulario.addEventListener(
        "click",
        () => {

            const colapsado =
                formularioPanel.classList.toggle(
                    "collapsado"
                );


            toggleFormulario.setAttribute(
                "aria-expanded",
                String(!colapsado)
            );


            const flecha =
                document.getElementById(
                    "flechaFormulario"
                );


            if (flecha) {

                flecha.textContent =
                    colapsado
                        ? "⌄"
                        : "⌃";
            }
        }
    );
}


// ============================================================
// FUNCIONES DISPONIBLES PARA LOS BOTONES
// ============================================================

window.editarPeluche =
    editarPeluche;


window.eliminarPeluche =
    eliminarPeluche;


window.cambiarFotoTarjeta =
    cambiarFotoTarjeta;


window.abrirVisorPorId =
    abrirVisorPorId;


// ============================================================
// INICIAR
// ============================================================

cargarPeluches();

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
  apiKey: "AIzaSyCZIgfuXyL6_AZxPjbir7j7LJIDxi3k5Xo",
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
const vistaPrevia = document.getElementById("vistaPrevia");
const foto = document.getElementById("foto");
const btnGuardar = document.getElementById("btnGuardar");
const btnCancelar = document.getElementById("btnCancelar");

let peluches = [];
let editando = null;
foto.addEventListener("change", () => {

    const archivo = foto.files[0];

    if(!archivo) return;

    const lector = new FileReader();

    lector.onload = e => {

        vistaPrevia.src = e.target.result;

        vistaPrevia.style.display="block";

    }

    lector.readAsDataURL(archivo);

});
async function subirImagenCloudinary(archivo) {

    if (!archivo) return "";

    const datos = new FormData();

    datos.append("file", archivo);
    datos.append("upload_preset", "peluches");

    const respuesta = await fetch(
        "https://api.cloudinary.com/v1_1/vspx5rke/image/upload",
        {
            method: "POST",
            body: datos
        }
    );

    const resultado = await respuesta.json();

    return resultado.secure_url;

}
async function cargarPeluches(){

    lista.innerHTML="";

    const consulta = await getDocs(collection(db,"peluches"));

    peluches=[];

    consulta.forEach((documento)=>{

        peluches.push({
            id:documento.id,
            ...documento.data()
        });

    });

    contador.textContent=`Peluches registrados: ${peluches.length}`;

    mostrarPeluches(peluches);

}
function mostrarPeluches(datos){

    lista.innerHTML="";

    datos.forEach((p)=>{

        lista.innerHTML+=`
      <div class="tarjeta">

          <img src="${p.foto}" alt="Peluche" class="fotoPeluche" onclick="abrirImagen('${p.foto}')">

            <h3>${p.nombre}</h3>

           <p><b>Etiqueta:</b> ${p.etiqueta}</p>

<p><b>Código:</b> ${p.codigo}</p>

<p><b>Precio:</b> Q${p.precio}</p>

<p><b>Medida:</b> ${p.tamano}</p>

<p><b>Cantidad:</b> ${p.cantidad}</p>

<p><b>Observaciones:</b> ${p.observaciones}</p>

<p><b>Fecha:</b> ${p.fechaIngreso}</p>

<p><b>Estado:</b> ${p.estado}</p>

<div class="botones">
    <button onclick="editarPeluche('${p.id}')">✏️ Editar</button>
    <button onclick="eliminarPeluche('${p.id}')">🗑️ Eliminar</button>
</div>
</div>
`;

    });

}
formulario.addEventListener("submit", async (e) => {

    e.preventDefault();

    const codigo = document.getElementById("codigo").value;
    const nombre = document.getElementById("nombre").value;
    const precio = document.getElementById("precio").value;
    const etiqueta = document.getElementById("etiqueta").value;
    const tamano = document.getElementById("medida").value;
    const cantidad = document.getElementById("cantidad").value;
    const observaciones = document.getElementById("observaciones").value;

    const archivo = foto.files[0];

let urlFoto = "";

if (archivo) {
    urlFoto = await subirImagenCloudinary(archivo);
} else if (editando) {
    const peluche = peluches.find(p => p.id === editando);
    urlFoto = peluche.foto;
}

 const datos = {
    codigo,
    etiqueta,
    nombre,
    precio,
    tamano,
    cantidad,
    observaciones,
    foto: urlFoto,
    fechaIngreso: new Date().toLocaleDateString("es-GT"),
    estado: "Disponible"
};

if (editando) {
    await updateDoc(doc(db, "peluches", editando), datos);
    editando = null;
} else {
    await addDoc(collection(db, "peluches"), datos);
}

  formulario.reset();

vistaPrevia.style.display = "none";

editando = null;

btnGuardar.textContent = "💾 Guardar Peluche";
btnCancelar.style.display = "none";

cargarPeluches();

});
buscar.addEventListener("input", () => {

    const texto = buscar.value.toLowerCase();

    const resultado = peluches.filter(p =>
        p.nombre.toLowerCase().includes(texto) ||
        p.codigo.toLowerCase().includes(texto) ||
       p.etiqueta.toLowerCase().includes(texto)
    );

    mostrarPeluches(resultado);

});

async function eliminarPeluche(id) {

    if (!confirm("¿Deseas eliminar este peluche?")) return;

    await deleteDoc(doc(db, "peluches", id));

    cargarPeluches();
}

async function editarPeluche(id) {


    const peluche = peluches.find(p => p.id === id);

    console.log("ID recibido:", id);
    console.log("Peluche encontrado:", peluche);

    if (!peluche) {
        alert("No encontró el peluche");
        return;
    }

    document.getElementById("codigo").value = peluche.codigo;
    document.getElementById("nombre").value = peluche.nombre;
    document.getElementById("precio").value = peluche.precio;
    document.getElementById("etiqueta").value = peluche.etiqueta;
    document.getElementById("medida").value = peluche.tamano;
    document.getElementById("cantidad").value = peluche.cantidad;
    document.getElementById("observaciones").value = peluche.observaciones;

    vistaPrevia.src = peluche.foto;
    vistaPrevia.style.display = "block";

 editando = id;


formulario.scrollIntoView({ behavior: "smooth" });

  btnGuardar.textContent = "💾 Actualizar Peluche";

    btnCancelar.style.display = "inline-block";
}

;
btnCancelar.addEventListener("click", () => {
    formulario.reset();

    vistaPrevia.style.display = "none";
    vistaPrevia.src = "";

    editando = null;

    btnGuardar.textContent = "💾 Guardar Peluche";
    btnCancelar.style.display = "none";
});

window.editarPeluche = editarPeluche;
window.eliminarPeluche = eliminarPeluche;

function abrirImagen(url){
    const visor = document.getElementById("visorImagen");
    const imagen = document.getElementById("imagenGrande");

    imagen.src = url;
    visor.style.display = "flex";
}

document.getElementById("cerrarVisor").addEventListener("click", () => {
    document.getElementById("visorImagen").style.display = "none";
});

document.getElementById("visorImagen").addEventListener("click", (e) => {
    if (e.target.id === "visorImagen") {
        document.getElementById("visorImagen").style.display = "none";
    }
});

window.abrirImagen = abrirImagen;

cargarPeluches();
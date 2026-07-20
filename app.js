// 1. Importaciones usando la CDN de Firebase (versión 10.8.0)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  doc, 
  onSnapshot, 
  updateDoc, 
  increment,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 2. Tus credenciales reales de Hielos Polar
const firebaseConfig = {
  apiKey: "AIzaSyDVDJNa3Waer5nJJ_mkG_jjc4wkN3XQNWI",
  authDomain: "hielos-polar.firebaseapp.com",
  projectId: "hielos-polar",
  storageBucket: "hielos-polar.firebasestorage.app",
  messagingSenderId: "529010081798",
  appId: "1:529010081798:web:b5d7429af1efc049ed0387"
};

// 3. Inicializar Firebase y la base de datos Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ... aquí continúa el resto del código de app.js que te pasé antes

// Referencias a Firestore
const inventoryRef = doc(db, "inventario", "general");
const transactionsRef = collection(db, "historial_transacciones");

// Elementos del DOM
const elEmptyBags = document.getElementById("val-empty-bags");
const elIceStock = document.getElementById("val-ice-stock");
const elProducedToday = document.getElementById("val-produced-today");
const elSoldToday = document.getElementById("val-sold-today");
const elRevenueToday = document.getElementById("val-revenue-today");
const elTotalRevenue = document.getElementById("val-total-revenue");
const inputUnitPrice = document.getElementById("unit-price");
const activityList = document.getElementById("activity-list");

let currentUnitPrice = 0;

// 1. Escuchar cambios del inventario en tiempo real
onSnapshot(inventoryRef, (docSnap) => {
  if (docSnap.exists()) {
    const data = docSnap.data();
    
    currentUnitPrice = data.precioPorBolsa || 0;
    const totalRev = data.recaudacionTotal || 0;
    
    // Actualizar métricas del Dashboard
    elEmptyBags.textContent = data.bolsasVacias || 0;
    elIceStock.textContent = data.stockHielo || 0;
    elProducedToday.textContent = data.producidasHoy || 0;
    elSoldToday.textContent = data.vendidasHoy || 0;
    
    // Subtotal de hoy
    const revenueToday = (data.vendidasHoy || 0) * currentUnitPrice;
    elRevenueToday.textContent = `Subtotal: $${revenueToday.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
    
    // Recaudación Total Acumulada
    elTotalRevenue.textContent = `$${totalRev.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
    
    // Actualizar input de precio si el usuario no lo tiene enfocado
    if (document.activeElement !== inputUnitPrice) {
      inputUnitPrice.value = currentUnitPrice;
    }
  } else {
    console.warn("El documento de inventario 'general' no existe en Firestore.");
  }
});

// 2. Escuchar últimas 15 transacciones en tiempo real
const qTransactions = query(transactionsRef, orderBy("timestamp", "desc"), limit(15));
onSnapshot(qTransactions, (snapshot) => {
  activityList.innerHTML = "";
  
  if (snapshot.empty) {
    activityList.innerHTML = `<li class="empty-state">No hay registros de actividad aún.</li>`;
    return;
  }

  snapshot.forEach((docItem) => {
    const item = docItem.data();
    const li = document.createElement("li");
    li.className = "activity-item";
    
    let typeClass = "";
    if (item.tipo === "PRODUCCION") typeClass = "type-production";
    else if (item.tipo === "VENTA") typeClass = "type-sale";
    else if (item.tipo === "INSUMO") typeClass = "type-stock";
    else if (item.tipo === "PRECIO") typeClass = "type-price";

    const dateFormatted = item.timestamp ? new Date(item.timestamp.toDate()).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '--:--';

    li.innerHTML = `
      <div>
        <span class="item-type ${typeClass}">${item.tipo}</span>
        <span>${item.descripcion}</span>
      </div>
      <span class="item-time">${dateFormatted} hs</span>
    `;
    activityList.appendChild(li);
  });
});

// Función auxiliar para registrar en el historial
async function logActivity(tipo, descripcion) {
  try {
    await addDoc(transactionsRef, {
      tipo,
      descripcion,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error("Error al registrar actividad:", err);
  }
}

// 3. Actualizar Precio Unitario
document.getElementById("btn-update-price").addEventListener("click", async () => {
  const newPrice = parseFloat(inputUnitPrice.value);
  if (isNaN(newPrice) || newPrice < 0) return alert("Ingrese un precio válido.");

  try {
    await updateDoc(inventoryRef, { precioPorBolsa: newPrice });
    await logActivity("PRECIO", `Precio actualizado a $${newPrice.toFixed(2)}`);
    alert("Precio actualizado correctamente.");
  } catch (error) {
    console.error("Error actualizando precio:", error);
  }
});

// 4. Registrar Producción (Suma stock hielo, descuenta bolsas vacías)
document.getElementById("form-production").addEventListener("submit", async (e) => {
  e.preventDefault();
  const qtyInput = document.getElementById("input-produced");
  const qty = parseInt(qtyInput.value, 10);
  
  if (isNaN(qty) || qty <= 0) return;

  try {
    await updateDoc(inventoryRef, {
      stockHielo: increment(qty),
      bolsasVacias: increment(-qty),
      producidasHoy: increment(qty)
    });
    await logActivity("PRODUCCION", `Se produjeron +${qty} bolsas de hielo`);
    qtyInput.value = "";
  } catch (error) {
    console.error("Error registrando producción:", error);
  }
});

// 5. Registrar Venta (Descuenta stock hielo, suma recaudación total y diaria)
document.getElementById("form-sales").addEventListener("submit", async (e) => {
  e.preventDefault();
  const qtyInput = document.getElementById("input-sold");
  const qty = parseInt(qtyInput.value, 10);

  if (isNaN(qty) || qty <= 0) return;

  const totalSaleAmount = qty * currentUnitPrice;

  try {
    await updateDoc(inventoryRef, {
      stockHielo: increment(-qty),
      vendidasHoy: increment(qty),
      recaudacionTotal: increment(totalSaleAmount)
    });
    await logActivity("VENTA", `Venta de ${qty} bolsas por $${totalSaleAmount.toLocaleString('es-AR')}`);
    qtyInput.value = "";
  } catch (error) {
    console.error("Error registrando venta:", error);
  }
});

// 6. Agregar Bolsas Vacías (Insumo)
document.getElementById("form-add-empty-bags").addEventListener("submit", async (e) => {
  e.preventDefault();
  const qtyInput = document.getElementById("input-empty-bags");
  const qty = parseInt(qtyInput.value, 10);

  if (isNaN(qty) || qty <= 0) return;

  try {
    await updateDoc(inventoryRef, {
      bolsasVacias: increment(qty)
    });
    await logActivity("INSUMO", `Ingreso de +${qty} bolsas vacías al inventario`);
    qtyInput.value = "";
  } catch (error) {
    console.error("Error agregando bolsas vacías:", error);
  }
});


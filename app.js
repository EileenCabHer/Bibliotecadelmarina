/**
 * Biblioteca Escolar PWA - I.E.S. Marina Cebrián
 * Estructura Oficial de Columnas Google Sheets:
 * Columna A (1): ISBN
 * Columna B (2): Portada (URL de la imagen de portada)
 * Columna C (3): Título
 * Columna D (4): Autor
 * Columna E (5): Sinopsis (Información de la Columna E)
 * Columna F (6): Ejemplares
 * Columna G (7): Abiesweb (SÓLO VISIBLE PARA ADMINISTRADOR)
 * Columna H (8): Última Actualización
 */

// ================= GLOBAL STATE =================
let booksState = [];
let html5QrcodeScanner = null;
let currentPreviewBook = null;
let activeDetailRowId = null;
let isAdmin = false; // Default: Public Consulta Mode

const ADMIN_PIN = '1234';
const DEFAULT_COVER_IMAGE = 'default-cover.png';

const STORAGE_KEYS = {
  SHEET_URL: 'https://script.google.com/macros/s/AKfycbw4ZbixLX_ITKcqGe9hKUMIJkbc4NXL52wxJ4kKjKHGY2J24Huc3Po4F8bL7pMDvY2h/exec', // <--- Pón tu URL real aquí entre comillas
  LOCAL_BOOKS: 'BIBLIO_LOCAL_BOOKS_V3' // Version 3 for clean cache refresh
};

const DEFAULT_SHEET_URL = STORAGE_KEYS.SHEET_URL;

// Seed sample books for immediate out-of-the-box experience
const SEED_BOOKS = [
  {
    rowId: 1,
    isbn: '9788434842718',
    portada: 'https://m.media-amazon.com/images/I/7119FZN2-KL._AC_UF1000,1000_QL80_.jpg',
    titulo: 'Abdel',
    autor: 'Enrique Páez',
    sinopsis: 'Abdel es un niño tuareg del Sáhara que emprende un viaje buscando una vida mejor junto a su padre en España. Tras cruzar el Estrecho y trabajar en los campos de fresas de Huelva, vivirá una apasionante e intensa aventura sobre la inmigración, la amistad y los derechos humanos.',
    ejemplares: 17,
    abiesweb: 'ABW-9788434842718',
    fecha: new Date().toLocaleDateString('es-ES')
  },
  {
    rowId: 2,
    isbn: '9788434857729',
    portada: 'https://openlibrary.org/b/isbn/9788434857729-L.jpg',
    titulo: 'Agualuna',
    autor: 'Joan Manuel Gisbert',
    sinopsis: 'Agualuna. Bruna planea una peligrosa huida para escapar de las garras de la ambiciosa dama que pretende arrebatarle su identidad y su lugar en el reino.',
    ejemplares: 12,
    abiesweb: 'ABW-9788434857729',
    fecha: new Date().toLocaleDateString('es-ES')
  },
  {
    rowId: 3,
    isbn: '9788466332910',
    portada: 'https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1327881361i/329888.jpg',
    titulo: 'Cien años de soledad',
    autor: 'Gabriel García Márquez',
    sinopsis: 'Una de las obras cumbre de la literatura hispanoamericana. Misterio, fantasía, ironía, mito y realismo mágico en la epopeya de Macondo y la familia Buendía.',
    ejemplares: 15,
    abiesweb: 'ABW-9788466332910',
    fecha: new Date().toLocaleDateString('es-ES')
  },
  {
    rowId: 4,
    isbn: '9788420471839',
    portada: 'https://openlibrary.org/b/isbn/9788420471839-L.jpg',
    titulo: 'El Principito',
    autor: 'Antoine de Saint-Exupéry',
    sinopsis: 'Pido perdón a los niños por haber dedicado este libro a una persona grande. Tengo una seria razón para ello: esta persona grande es el mejor amigo que tengo en el mundo.',
    ejemplares: 24,
    abiesweb: 'ABW-9788420471839',
    fecha: new Date().toLocaleDateString('es-ES')
  }
];

// Preservación directa y sin alteraciones del texto de la Columna E (Sinopsis)
function normalizeBook(b) {
  if (!b) return b;
  let book = { ...b };

  const rawSinopsis = String(book.sinopsis || '').trim();

  // Preserva 100% el texto enviado desde Google Sheets en la Columna E
  if (rawSinopsis && rawSinopsis.length > 0 && !rawSinopsis.startsWith('http')) {
    book.sinopsis = rawSinopsis;
  } else if (!book.sinopsis || book.sinopsis.trim() === '') {
    book.sinopsis = `Resumen e información del libro "${book.titulo}" de ${book.autor}. Lote disponible para préstamo escolar en la biblioteca del I.E.S. Marina Cebrián.`;
  }

  // Asegura que la portada sea una URL válida o fallback al logo del centro
  if (!book.portada || (!book.portada.startsWith('http://') && !book.portada.startsWith('https://'))) {
    book.portada = DEFAULT_COVER_IMAGE;
  }

  return book;
}

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  loadSheetConfig();
  loadBooksData();
  updateRoleUI();
}

function loadSheetConfig() {
  // Aquí está el cambio: usa STORAGE_KEYS.SHEET_URL en lugar de DEFAULT_SHEET_URL
  const savedUrl = localStorage.getItem('BIBLIO_SHEET_URL_V1') || STORAGE_KEYS.SHEET_URL;
  document.getElementById('sheet-url-input').value = savedUrl;
  updateStatusPill(savedUrl);
}

function updateStatusPill(url) {
  const dot = document.getElementById('sync-dot');
  const text = document.getElementById('sync-text');
  
  if (url && url.startsWith('http')) {
    dot.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
    text.textContent = 'Google Sheet Conectado';
  } else {
    dot.className = 'w-2 h-2 rounded-full bg-amber-500';
    text.textContent = 'Modo Local (Sin Sheet)';
  }
}

// Load Books from Google Sheet or LocalStorage seed
async function loadBooksData() {
  const sheetUrl = localStorage.getItem(STORAGE_KEYS.SHEET_URL) || DEFAULT_SHEET_URL;

  if (sheetUrl && sheetUrl.startsWith('http')) {
    await fetchBooksFromSheet();
  } else {
    const localData = localStorage.getItem(STORAGE_KEYS.LOCAL_BOOKS);
    if (localData) {
      try {
        const parsed = JSON.parse(localData);
        booksState = Array.isArray(parsed) ? parsed.map(normalizeBook) : SEED_BOOKS;
      } catch (e) {
        booksState = SEED_BOOKS;
      }
    } else {
      booksState = SEED_BOOKS;
      saveLocalBooks();
    }
    renderCatalog();
    updateStatsSummary();
  }
}

function saveLocalBooks() {
  localStorage.setItem(STORAGE_KEYS.LOCAL_BOOKS, JSON.stringify(booksState));
}

// Fetch from Google Apps Script GET endpoint
async function fetchBooksFromSheet() {
  const sheetUrl = localStorage.getItem(STORAGE_KEYS.SHEET_URL);
  if (!sheetUrl) return;

  showToast('🔄 Sincronizando con Google Sheets...', 'info');

  try {
    const res = await fetch(sheetUrl);
    const data = await res.json();

    if (data.status === 'success' && Array.isArray(data.books)) {
      booksState = data.books.map(normalizeBook);
      saveLocalBooks();
      renderCatalog();
      updateStatsSummary();
      showToast('✅ Sincronización completada', 'success');
      document.getElementById('stat-last-sync').textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } else {
      throw new Error(data.message || 'Respuesta inválida');
    }
  } catch (err) {
    console.warn('Error al leer de Google Sheets:', err);
    showToast('⚠️ No se pudo conectar a Google Sheets. Usando datos locales.', 'warning');
    const localData = localStorage.getItem(STORAGE_KEYS.LOCAL_BOOKS);
    if (localData) {
      const parsed = JSON.parse(localData);
      booksState = Array.isArray(parsed) ? parsed.map(normalizeBook) : SEED_BOOKS;
    }
    renderCatalog();
    updateStatsSummary();
  }
}


// ================= ROLE MANAGEMENT (CONSULTA vs ADMINISTRADOR) =================
function handleAdminToggleClick() {
  if (isAdmin) {
    isAdmin = false;
    updateRoleUI();
    showToast('🔒 Modo Administrador cerrado. Vista de Consulta activa.', 'info');
  } else {
    openAdminLoginModal();
  }
}

function openAdminLoginModal() {
  document.getElementById('modal-admin-login').classList.remove('hidden');
  const pinInput = document.getElementById('admin-pin-input');
  pinInput.value = '';
  setTimeout(() => pinInput.focus(), 100);
}

function closeAdminLoginModal() {
  document.getElementById('modal-admin-login').classList.add('hidden');
}

function submitAdminPin(e) {
  e.preventDefault();
  const inputPin = document.getElementById('admin-pin-input').value.trim();

  if (inputPin === ADMIN_PIN) {
    isAdmin = true;
    closeAdminLoginModal();
    updateRoleUI();
    showToast('🔓 Acceso concedido: Modo Administrador activado.', 'success');
  } else {
    showToast('❌ Clave incorrecta. Inténtalo de nuevo (Clave por defecto: 1234).', 'error');
  }
}

function updateRoleUI() {
  const adminSection = document.getElementById('admin-actions-section');
  const statusPill = document.getElementById('status-pill');
  const adminToggleBtn = document.getElementById('btn-admin-toggle');
  const adminIcon = document.getElementById('admin-icon');
  const adminText = document.getElementById('admin-toggle-text');

  if (isAdmin) {
    adminSection.classList.remove('hidden');
    statusPill.classList.remove('hidden');
    adminToggleBtn.className = 'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md transition-all';
    adminIcon.className = 'fa-solid fa-unlock text-white';
    adminText.textContent = 'Salir Admin';
  } else {
    adminSection.classList.add('hidden');
    statusPill.classList.add('hidden');
    adminToggleBtn.className = 'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-amber-50 border border-amber-200 text-[#78350f] hover:border-orange-500 hover:text-orange-700 transition-all shadow-sm';
    adminIcon.className = 'fa-solid fa-lock text-orange-600';
    adminText.textContent = 'Gestión';
  }

  renderCatalog();
}


// ================= ISBN API LOOKUP (GOOGLE BOOKS + OPEN LIBRARY) =================
async function fetchBookDetailsFromApis(isbnInput) {
  const cleanIsbn = String(isbnInput).replace(/[^0-9X]/gi, '');
  if (!cleanIsbn) {
    throw new Error('El ISBN debe contener dígitos válidos.');
  }

  let result = {
    isbn: cleanIsbn,
    portada: '',
    titulo: '',
    autor: '',
    sinopsis: '',
    abiesweb: `ABW-${cleanIsbn}`
  };

  // 1. QUERY GOOGLE BOOKS API
  try {
    const gResponse = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`);
    if (gResponse.ok) {
      const gData = await gResponse.json();
      if (gData.items && gData.items.length > 0) {
        const info = gData.items[0].volumeInfo || {};
        result.titulo = info.title || '';
        result.autor = info.authors ? info.authors.join(', ') : '';
        result.sinopsis = info.description || '';
        
        if (info.imageLinks) {
          result.portada = (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail || '')
            .replace('http://', 'https://');
        }
      }
    }
  } catch (e) {
    console.warn('Google Books API search failed:', e);
  }

  // 2. QUERY OPEN LIBRARY API (FOR FALLBACK / SUPPLEMENTING MISSING FIELDS)
  try {
    const olUrl = `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`;
    const olResponse = await fetch(olUrl);
    if (olResponse.ok) {
      const olData = await olResponse.json();
      const olBook = olData[`ISBN:${cleanIsbn}`];
      
      if (olBook) {
        if (!result.titulo && olBook.title) {
          result.titulo = olBook.title;
        }
        if (!result.autor && olBook.authors) {
          result.autor = olBook.authors.map(a => a.name).join(', ');
        }
        if (!result.sinopsis) {
          result.sinopsis = typeof olBook.notes === 'string' ? olBook.notes : (olBook.excerpts ? olBook.excerpts[0]?.text : '');
        }
        if (!result.portada && olBook.cover) {
          result.portada = olBook.cover.large || olBook.cover.medium || olBook.cover.small || '';
        }
      }
    }
  } catch (e) {
    console.warn('Open Library API search failed:', e);
  }

  // Fallback cover if none found from APIs
  if (!result.portada) {
    result.portada = `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg`;
  }

  if (!result.titulo) {
    result.titulo = `Libro ISBN ${cleanIsbn}`;
  }
  if (!result.autor) {
    result.autor = 'Autor no especificado';
  }

  return normalizeBook(result);
}


// ================= BARCODE SCANNER (CAMERA) =================
function startScannerModal() {
  if (!isAdmin) return;

  document.getElementById('modal-scanner').classList.remove('hidden');

  if (html5QrcodeScanner) {
    html5QrcodeScanner.clear();
  }

  html5QrcodeScanner = new Html5Qrcode("reader");

  const config = {
    fps: 15,
    qrbox: { width: 250, height: 160 },
    formatsToSupport: [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.UPC_A
    ]
  };

  html5QrcodeScanner.start(
    { facingMode: "environment" },
    config,
    onBarcodeScannedSuccess,
    onBarcodeScanError
  ).catch(err => {
    console.error("Error al iniciar la cámara:", err);
    showToast('❌ No se pudo acceder a la cámara. Revisa los permisos.', 'error');
    stopScannerModal();
  });
}

function stopScannerModal() {
  if (html5QrcodeScanner) {
    html5QrcodeScanner.stop().then(() => {
      html5QrcodeScanner.clear();
      html5QrcodeScanner = null;
    }).catch(() => {
      html5QrcodeScanner = null;
    });
  }
  document.getElementById('modal-scanner').classList.add('hidden');
}

function onBarcodeScannedSuccess(decodedText, decodedResult) {
  if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  stopScannerModal();
  lookupAndShowPreview(decodedText);
}

function onBarcodeScanError(errorMessage) {}


// ================= MANUAL ISBN SUBMIT =================
function handleManualIsbnSubmit(e) {
  e.preventDefault();
  if (!isAdmin) return;

  const input = document.getElementById('manual-isbn-input');
  const isbn = input.value.trim();

  if (!isbn) {
    showToast('⚠️ Introduce un código ISBN.', 'warning');
    return;
  }

  lookupAndShowPreview(isbn);
}


// ================= LOOKUP & PREVIEW MODAL =================
async function lookupAndShowPreview(isbn) {
  const modal = document.getElementById('modal-preview');
  const loading = document.getElementById('preview-loading');
  const body = document.getElementById('preview-body');

  modal.classList.remove('hidden');
  loading.classList.remove('hidden');
  body.classList.add('hidden');

  try {
    const bookData = await fetchBookDetailsFromApis(isbn);
    currentPreviewBook = normalizeBook(bookData);

    document.getElementById('preview-isbn-badge').textContent = `ISBN: ${currentPreviewBook.isbn}`;
    document.getElementById('preview-title').textContent = currentPreviewBook.titulo;
    document.getElementById('preview-author').textContent = currentPreviewBook.autor || 'Autor no especificado';
    document.getElementById('preview-synopsis').textContent = currentPreviewBook.sinopsis || 'Sin sinopsis disponible en las APIs públicas.';

    const imgEl = document.getElementById('preview-cover-img');
    const coverUrl = (currentPreviewBook.portada && currentPreviewBook.portada.startsWith('http')) ? currentPreviewBook.portada : DEFAULT_COVER_IMAGE;
    imgEl.src = coverUrl;
    imgEl.onerror = () => {
      imgEl.src = DEFAULT_COVER_IMAGE;
    };

    checkDuplicateAndAlert(currentPreviewBook);

    loading.classList.add('hidden');
    body.classList.remove('hidden');

  } catch (err) {
    console.error('Error al consultar ISBN:', err);
    showToast(`❌ Error: ${err.message}`, 'error');
    closePreviewModal();
  }
}

function checkDuplicateAndAlert(bookData) {
  const banner = document.getElementById('preview-match-banner');
  const icon = document.getElementById('preview-match-icon');
  const headline = document.getElementById('preview-match-headline');
  const subtext = document.getElementById('preview-match-subtext');

  const cleanIsbnInput = bookData.isbn.replace(/[^0-9X]/gi, '');
  const cleanTitleInput = cleanString(bookData.titulo);

  const existingBook = booksState.find(b => {
    const rowIsbn = String(b.isbn || '').replace(/[^0-9X]/gi, '');
    const rowTitle = cleanString(b.titulo);
    return (cleanIsbnInput && rowIsbn && cleanIsbnInput === rowIsbn) || 
           (cleanTitleInput && rowTitle && cleanTitleInput === rowTitle);
  });

  if (existingBook) {
    banner.className = 'p-3 rounded-xl mb-4 border border-amber-300 bg-amber-50 text-amber-900 flex items-center gap-3';
    icon.className = 'fa-solid fa-layer-group text-amber-700 text-xl flex-shrink-0';
    headline.textContent = `📚 ¡Este libro ya existe en el inventario!`;
    subtext.textContent = `Se sumará +1 ejemplar al lote (Ejemplares actuales: ${existingBook.ejemplares} → Nuevo total: ${existingBook.ejemplares + 1}).`;
    currentPreviewBook.matchedRowId = existingBook.rowId;
    currentPreviewBook.currentCopies = existingBook.ejemplares;
    currentPreviewBook.isDuplicate = true;
  } else {
    banner.className = 'p-3 rounded-xl mb-4 border border-emerald-300 bg-emerald-50 text-emerald-900 flex items-center gap-3';
    icon.className = 'fa-solid fa-sparkles text-emerald-600 text-xl flex-shrink-0';
    headline.textContent = `✨ Nuevo libro / lote para la biblioteca`;
    subtext.textContent = `Se añadirá una nueva fila al Google Sheet con 1 ejemplar inicial.`;
    currentPreviewBook.isDuplicate = false;
  }
}

function closePreviewModal() {
  document.getElementById('modal-preview').classList.add('hidden');
  currentPreviewBook = null;
}


// ================= CONFIRM AND SAVE TO GOOGLE SHEET / LOCAL =================
async function confirmSaveBook() {
  if (!currentPreviewBook) return;

  const bookToSave = normalizeBook(currentPreviewBook);
  const btn = document.getElementById('btn-confirm-save');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Guardando...`;

  const sheetUrl = localStorage.getItem(STORAGE_KEYS.SHEET_URL);

  const payload = {
    action: 'add_or_update',
    isbn: bookToSave.isbn,
    portada: bookToSave.portada,
    titulo: bookToSave.titulo,
    autor: bookToSave.autor,
    sinopsis: bookToSave.sinopsis,
    ejemplares: 1,
    abiesweb: bookToSave.abiesweb || ''
  };

  try {
    if (sheetUrl && sheetUrl.startsWith('http')) {
      const res = await fetch(sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.status === 'updated' || data.status === 'created' || data.status === 'success') {
        showToast(`✅ ${data.message || 'Guardado correctamente en Google Sheets'}`, 'success');
        await fetchBooksFromSheet();
      } else {
        throw new Error(data.message || 'Error al guardar en Google Sheet');
      }
    } else {
      if (bookToSave.isDuplicate) {
        const item = booksState.find(b => b.rowId === bookToSave.matchedRowId);
        if (item) {
          item.ejemplares += 1;
          item.fecha = new Date().toLocaleDateString('es-ES');
        }
        showToast(`✅ Sumado +1 ejemplar localmente (Total: ${item ? item.ejemplares : ''})`, 'success');
      } else {
        const newBook = {
          rowId: Date.now(),
          isbn: bookToSave.isbn,
          portada: bookToSave.portada,
          titulo: bookToSave.titulo,
          autor: bookToSave.autor,
          sinopsis: bookToSave.sinopsis,
          ejemplares: 1,
          abiesweb: bookToSave.abiesweb || '',
          fecha: new Date().toLocaleDateString('es-ES')
        };
        booksState.unshift(newBook);
        showToast('✅ Nuevo lote registrado en almacenamiento local.', 'success');
      }
      saveLocalBooks();
      renderCatalog();
      updateStatsSummary();
    }

    closePreviewModal();

  } catch (err) {
    console.error('Error al guardar libro:', err);
    showToast(`⚠️ Error al guardar: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-check"></i> Confirmar y Registrar`;
  }
}


// ================= CATALOG RENDER (VISUAL COVERS & SEARCH) =================
function renderCatalog() {
  const grid = document.getElementById('catalog-grid');
  const empty = document.getElementById('catalog-empty');
  const searchInput = document.getElementById('catalog-search-input');
  const search = searchInput ? searchInput.value.trim() : '';
  const sortSelect = document.getElementById('filter-sort-select');
  const sort = sortSelect ? sortSelect.value : 'recent';

  let filtered = booksState.map(normalizeBook);

  if (search) {
    const q = cleanString(search);
    filtered = filtered.filter(b => 
      cleanString(b.titulo).includes(q) ||
      cleanString(b.autor).includes(q) ||
      String(b.isbn).includes(q) ||
      (isAdmin && cleanString(b.abiesweb).includes(q))
    );
  }

  if (sort === 'copies-desc') {
    filtered.sort((a, b) => (b.ejemplares || 0) - (a.ejemplares || 0));
  } else if (sort === 'title-asc') {
    filtered.sort((a, b) => a.titulo.localeCompare(b.titulo));
  }

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  grid.innerHTML = filtered.map(book => {
    // COLUMNA B: PORTADA (URL DE IMAGEN) -> RENDERIZADA EN ETIQUETA HTML IMG
    const coverUrl = (book.portada && book.portada.startsWith('http')) 
      ? book.portada 
      : DEFAULT_COVER_IMAGE;

    // CONTROLES DE EDICIÓN DE STOCK: SÓLO VISIBLES SI ES ADMIN
    const stockControls = isAdmin ? `
      <div class="mt-3 pt-2 border-t border-amber-200/80 flex items-center justify-between">
        <span class="text-[10px] font-mono text-[#78350f]">ISBN ${book.isbn ? book.isbn.slice(-4) : '---'}</span>
        <div class="flex items-center gap-1">
          <button onclick="event.stopPropagation(); changeBookCopies(${book.rowId}, -1)" class="w-6 h-6 rounded bg-amber-100 border border-amber-300 text-[#78350f] hover:bg-orange-600 hover:text-white flex items-center justify-center text-xs font-bold transition-colors" title="Restar 1 ejemplar">
            -
          </button>
          <span class="text-xs font-extrabold text-[#291307] px-1.5">${book.ejemplares || 1}</span>
          <button onclick="event.stopPropagation(); changeBookCopies(${book.rowId}, 1)" class="w-6 h-6 rounded bg-amber-100 border border-amber-300 text-[#78350f] hover:bg-orange-600 hover:text-white flex items-center justify-center text-xs font-bold transition-colors" title="Sumar 1 ejemplar">
            +
          </button>
        </div>
      </div>
    ` : `
      <div class="mt-2.5 pt-2 border-t border-amber-200/80 flex items-center justify-between text-[11px] text-[#78350f]">
        <span>Disponible:</span>
        <span class="font-extrabold text-emerald-700 flex items-center gap-1">
          <i class="fa-solid fa-copy text-[10px]"></i> ${book.ejemplares || 1} ej.
        </span>
      </div>
    `;

    return `
      <div class="book-card glass-panel p-3 rounded-xl border border-amber-200/90 bg-white flex flex-col justify-between group">
        <div>
          <!-- COLUMNA B: RENDERIZADO DE LA URL DE PORTADA EN ETIQUETA IMG -->
          <div onclick="openDetailModal(${book.rowId})" class="book-cover-wrapper mb-3 cursor-pointer">
            <img src="${escapeHtml(coverUrl)}" 
                 alt="${escapeHtml(book.titulo)}" 
                 onerror="this.onerror=null; this.src='${DEFAULT_COVER_IMAGE}';"
                 class="book-cover-img" />
            
            <!-- BADGE DE EJEMPLARES DISPONIBLES -->
            <div class="absolute top-2 right-2 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-md border border-orange-300 text-emerald-700 text-[11px] font-extrabold shadow-sm flex items-center gap-1">
              <i class="fa-solid fa-book-bookmark text-[10px]"></i>
              <span>${book.ejemplares || 1} ej.</span>
            </div>
          </div>

          <!-- COLUMNA C: TÍTULO MÁS GRANDE Y DESTACADO -->
          <h3 onclick="openDetailModal(${book.rowId})" class="font-extrabold text-sm sm:text-base text-[#291307] line-clamp-2 leading-snug cursor-pointer hover:text-orange-600 transition-colors" title="${escapeHtml(book.titulo)}">
            ${escapeHtml(book.titulo)}
          </h3>

          <!-- COLUMNA D: AUTOR DEDICADO Y SEPARADO -->
          <p class="text-xs text-orange-700 font-semibold truncate mt-1 flex items-center gap-1">
            <i class="fa-solid fa-feather text-[10px] text-orange-600"></i> ${escapeHtml(book.autor || 'Autor no especificado')}
          </p>
        </div>

        ${stockControls}
      </div>
    `;
  }).join('');
}

function filterCatalog() {
  renderCatalog();
}

async function changeBookCopies(rowId, delta) {
  if (!isAdmin) return;

  const book = booksState.find(b => b.rowId === rowId);
  if (!book) return;

  const newCount = Math.max(0, (book.ejemplares || 1) + delta);
  book.ejemplares = newCount;
  
  renderCatalog();
  updateStatsSummary();

  const sheetUrl = localStorage.getItem(STORAGE_KEYS.SHEET_URL);
  if (sheetUrl && sheetUrl.startsWith('http')) {
    try {
      await fetch(sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'update_copies', rowId: rowId, ejemplares: newCount })
      });
      showToast(`Stock actualizado a ${newCount} ej.`, 'success');
    } catch (e) {
      console.warn('Error al actualizar en Sheet:', e);
    }
  } else {
    saveLocalBooks();
    showToast(`Ejemplares actualizados a ${newCount}`, 'info');
  }

  if (activeDetailRowId === rowId) {
    const copiesEl = document.getElementById('detail-copies');
    if (copiesEl) copiesEl.textContent = newCount;
  }
}

function updateStatsSummary() {
  const totalTitles = booksState.length;
  const totalCopies = booksState.reduce((sum, b) => sum + Number(b.ejemplares || 1), 0);

  document.getElementById('stat-total-titles').textContent = totalTitles;
  document.getElementById('stat-total-copies').textContent = totalCopies;
}


// ================= CLEAN PUBLIC BOOK DETAIL VIEW =================
function openDetailModal(rowId) {
  let book = booksState.find(b => b.rowId === rowId);
  if (!book) return;

  book = normalizeBook(book);
  activeDetailRowId = rowId;
  
  // COLUMNA A: ISBN
  document.getElementById('detail-isbn').textContent = `ISBN: ${book.isbn || 'N/A'}`;
  
  // COLUMNA C: TÍTULO MÁS GRANDE Y DESTACADO
  document.getElementById('detail-title').textContent = book.titulo;
  
  // COLUMNA D: CAMPO AUTOR DEDICADO
  document.getElementById('detail-author').textContent = book.autor || 'Autor no especificado';
  
  // COLUMNA E: CAMPO SINOPSIS DEDICADO Y SEPARADO (MUESTRA EL TEXTO DE LA COLUMNA E)
  document.getElementById('detail-synopsis').textContent = book.sinopsis;

  // COLUMNA F: EJEMPLARES DISPONIBLES (READ ONLY SI NO ES ADMIN)
  const copiesContainer = document.getElementById('detail-copies-container');
  if (isAdmin) {
    copiesContainer.innerHTML = `
      <button onclick="changeBookCopies(${book.rowId}, -1)" class="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 text-[#78350f] font-bold hover:bg-orange-600 hover:text-white flex items-center justify-center text-sm">-</button>
      <span id="detail-copies" class="text-lg font-extrabold text-emerald-700 min-w-[2.5rem] text-center">${book.ejemplares || 1}</span>
      <button onclick="changeBookCopies(${book.rowId}, 1)" class="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 text-[#78350f] hover:bg-orange-600 hover:text-white flex items-center justify-center text-sm">+</button>
    `;
  } else {
    copiesContainer.innerHTML = `
      <span class="text-base font-extrabold text-emerald-700 flex items-center gap-2">
        <i class="fa-solid fa-copy text-sm"></i> ${book.ejemplares || 1} ejemplares disponibles en la biblioteca
      </span>
    `;
  }

  // COLUMNA G: ABIESWEB (SÓLO VISIBLE PARA ADMINISTRADOR)
  const abiesContainer = document.getElementById('detail-abiesweb-container');
  if (isAdmin) {
    abiesContainer.classList.remove('hidden');
    document.getElementById('detail-abiesweb').textContent = book.abiesweb || `ABW-${book.isbn || rowId}`;
  } else {
    abiesContainer.classList.add('hidden'); // COMPLETAMENTE OCULTO PARA USUARIOS GENERALES
  }

  // COLUMNA B: PORTADA (URL) MOSTRADA COMO FOTO EN ETIQUETA IMG
  const coverImg = document.getElementById('detail-cover');
  const coverUrl = (book.portada && book.portada.startsWith('http')) ? book.portada : DEFAULT_COVER_IMAGE;
  coverImg.src = coverUrl;
  coverImg.onerror = () => {
    coverImg.src = DEFAULT_COVER_IMAGE;
  };

  document.getElementById('modal-detail').classList.remove('hidden');
}

function closeDetailModal() {
  document.getElementById('modal-detail').classList.add('hidden');
  activeDetailRowId = null;
}


// ================= GOOGLE SHEETS CONFIG MODAL =================
function openConfigModal() {
  if (!isAdmin) return;
  document.getElementById('modal-config').classList.remove('hidden');
}

function closeConfigModal() {
  document.getElementById('modal-config').classList.add('hidden');
}

function saveSheetConfig() {
  const url = document.getElementById('sheet-url-input').value.trim();
  localStorage.setItem(STORAGE_KEYS.SHEET_URL, url);
  updateStatusPill(url);
  closeConfigModal();

  if (url) {
    fetchBooksFromSheet();
  } else {
    showToast('Configurado en Modo Local (offline).', 'info');
    loadBooksData();
  }
}

function copyGasScriptCode() {
  const gasCode = `function doGet(e){const s=getOrCreateSheet(),d=s.getDataRange().getValues();if(d.length<=1)return json({status:"success",books:[]});const h=d[0].map(function(x){return clean(x);});let cI=h.findIndex(function(x){return x.includes('isbn');});let cP=h.findIndex(function(x){return x.includes('portada')||x.includes('cover')||x.includes('imagen')||x.includes('url');});let cT=h.findIndex(function(x){return x.includes('titulo')||x.includes('title');});let cA=h.findIndex(function(x){return x.includes('autor')||x.includes('author');});let cS=h.findIndex(function(x){return x.includes('sinopsis')||x.includes('resumen')||x.includes('descripcion');});let cE=h.findIndex(function(x){return x.includes('ejemplar')||x.includes('copi')||x.includes('cantidad');});let cAb=h.findIndex(function(x){return x.includes('abies');});let cF=h.findIndex(function(x){return x.includes('fecha');});if(cI===-1)cI=0;if(cP===-1)cP=1;if(cT===-1)cT=2;if(cA===-1)cA=3;if(cS===-1)cS=4;if(cE===-1)cE=5;if(cAb===-1)cAb=6;if(cF===-1)cF=7;const b=[];for(let i=1;i<d.length;i++){const r=d[i];if(!r[cI]&&!r[cT]&&!r[cP])continue;b.push({rowId:i+1,isbn:String(r[cI]||'').trim(),portada:String(r[cP]||'').trim(),titulo:String(r[cT]||'').trim(),autor:String(r[cA]||'').trim(),sinopsis:String(r[cS]||'').trim(),ejemplares:Number(r[cE]||1),abiesweb:String(r[cAb]||'').trim(),fecha:r[cF]?String(r[cF]):new Date().toISOString()});}return json({status:"success",books:b});}
function doPost(e){try{const s=getOrCreateSheet(),c=JSON.parse(e.postData.contents),a=c.action||'add_or_update';if(a==='add_or_update'){const isbn=String(c.isbn||'').trim(),p=String(c.portada||'').trim(),t=String(c.titulo||'').trim(),au=String(c.autor||'').trim(),sn=String(c.sinopsis||'').trim(),delta=Number(c.ejemplares||1),abw=String(c.abiesweb||'').trim(),d=s.getDataRange().getValues();let found=-1,cur=0;const cT=clean(t),cI=isbn.replace(/[^0-9X]/gi,'');for(let i=1;i<d.length;i++){const rI=String(d[i][0]||'').replace(/[^0-9X]/gi,''),rT=clean(d[i][2]);if((cI&&rI&&cI===rI)||(cT&&rT&&cT===rT)){found=i+1;cur=Number(d[i][5]||1);break;}}const now=new Date().toLocaleString("es-ES");if(found>0){const n=cur+delta;s.getRange(found,6).setValue(n);s.getRange(found,8).setValue(now);if(sn)s.getRange(found,5).setValue(sn);return json({status:"updated",message:"Sumado +"+delta+" ejemplar(es).",nuevoTotalEjemplares:n});}else{s.appendRow([isbn,p,t,au,sn,delta,abw,now]);return json({status:"created",message:"Nuevo lote añadido.",nuevoTotalEjemplares:delta});}}else if(a==='update_copies'){s.getRange(Number(c.rowId),6).setValue(Math.max(0,Number(c.ejemplares)));return json({status:"success"});}}catch(err){return json({status:"error",message:err.toString()});}}
function getOrCreateSheet(){const ss=SpreadsheetApp.getActiveSpreadsheet();let s=ss.getSheetByName("Biblioteca_Lotes")||ss.getActiveSheet();if(s.getLastRow()===0)s.appendRow(["ISBN","Portada","Título","Autor","Sinopsis","Ejemplares","Abiesweb","Última Actualización"]);return s;}
function clean(str){return String(str||'').toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").trim();}
function json(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}`;

  navigator.clipboard.writeText(gasCode).then(() => {
    showToast('📋 Código Apps Script copiado al portapapeles', 'success');
  }).catch(() => {
    showToast('Selecciona y copia el código en google_script.gs', 'info');
  });
}


// ================= UTILITIES & HELPERS =================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  
  let bg = 'bg-white border-amber-300 text-[#291307] shadow-xl';
  if (type === 'success') bg = 'bg-emerald-50 border-emerald-400 text-emerald-900 shadow-xl';
  if (type === 'error') bg = 'bg-rose-50 border-rose-400 text-rose-900 shadow-xl';
  if (type === 'warning') bg = 'bg-amber-50 border-orange-400 text-amber-950 shadow-xl';

  toast.className = `p-3.5 rounded-xl border ${bg} text-xs font-bold shadow-2xl backdrop-blur-md flex items-center justify-between transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function cleanString(str) {
  return String(str || '')
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

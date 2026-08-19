/**
 * CÓDIGO PARA GOOGLE APPS SCRIPT (Google Sheets Backend) - I.E.S. MARINA CEBRIÁN
 * 
 * BÚSQUEDA DINÁMICA POR CABECERAS DE COLUMNAS CON FALLBACK PARA TÍTULOS FALTANTES:
 * Columna A (1): ISBN
 * Columna B (2): Portada (URL de la imagen de portada)
 * Columna C (3): Título
 * Columna D (4): Autor
 * Columna E (5): Sinopsis
 * Columna F (6): Ejemplares
 * Columna G (7): Abiesweb (Sólo visible para Administrador)
 * Columna H (8): Última Actualización
 */

function doGet(e) {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    return createJsonResponse({ status: "success", books: [] });
  }

  // 1. Obtener la fila de cabeceras (Fila 1) para detección dinámica
  const headers = data[0].map(h => cleanString(h));

  // Detección dinámica ampliada de índices de columna
  let colIsbn = headers.findIndex(h => h.includes('isbn'));
  let colPortada = headers.findIndex(h => h.includes('portada') || h.includes('cover') || h.includes('imagen') || h.includes('url') || h.includes('foto') || h.includes('link'));
  let colTitulo = headers.findIndex(h => h.includes('titulo') || h.includes('title') || h.includes('nombre') || h.includes('obra') || h.includes('denominacion') || h.includes('libro'));
  let colAutor = headers.findIndex(h => h.includes('autor') || h.includes('author') || h.includes('escritor'));
  let colSinopsis = headers.findIndex(h => h.includes('sinopsis') || h.includes('resumen') || h.includes('descripcion') || h.includes('description') || h.includes('nota'));
  let colEjemplares = headers.findIndex(h => h.includes('ejemplar') || h.includes('copi') || h.includes('cantidad') || h.includes('stock'));
  let colAbiesweb = headers.findIndex(h => h.includes('abies'));
  let colFecha = headers.findIndex(h => h.includes('fecha') || h.includes('actualiza'));

  // Posiciones por defecto en caso de no coincidencia en cabecera
  if (colIsbn === -1) colIsbn = 0;
  if (colPortada === -1) colPortada = 1;
  if (colTitulo === -1) colTitulo = 2;
  if (colAutor === -1) colAutor = 3;
  if (colSinopsis === -1) colSinopsis = 4; // Columna E por defecto
  if (colEjemplares === -1) colEjemplares = 5;
  if (colAbiesweb === -1) colAbiesweb = 6;
  if (colFecha === -1) colFecha = 7;

  const books = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[colIsbn] && !row[colTitulo] && !row[colPortada] && !row[colAutor]) continue; // ignora filas completamente vacías
    
    let isbnVal = String(row[colIsbn] || '').trim();
    let portadaVal = String(row[colPortada] || '').trim();
    let tituloVal = String(row[colTitulo] || '').trim();
    let autorVal = String(row[colAutor] || '').trim();
    let sinopsisVal = String(row[colSinopsis] || '').trim();
    let abieswebVal = String(row[colAbiesweb] || '').trim();

    // GARANTIZAR QUE NUNCA FALTE UN TÍTULO SI LA FILA TIENE DATOS
    if (!tituloVal || tituloVal === '') {
      if (isbnVal) {
        tituloVal = `Libro (ISBN ${isbnVal})`;
      } else if (autorVal) {
        tituloVal = `Lote de ${autorVal}`;
      } else {
        tituloVal = `Lote de Lectura #${i}`;
      }
    }

    let rawBook = {
      rowId: i + 1,
      isbn: isbnVal,
      portada: portadaVal,
      titulo: tituloVal,
      autor: autorVal,
      sinopsis: sinopsisVal,
      ejemplares: Number(row[colEjemplares] || 1),
      abiesweb: abieswebVal,
      fecha: row[colFecha] ? String(row[colFecha]) : new Date().toISOString()
    };

    books.push(rawBook);
  }

  return createJsonResponse({ status: "success", books: books });
}

function doPost(e) {
  try {
    const sheet = getOrCreateSheet();
    const contents = JSON.parse(e.postData.contents);
    const action = contents.action || 'add_or_update';

    if (action === 'add_or_update') {
      const isbn = String(contents.isbn || '').trim();
      const portada = String(contents.portada || '').trim();
      const titulo = String(contents.titulo || '').trim();
      const autor = String(contents.autor || '').trim();
      const sinopsis = String(contents.sinopsis || '').trim();
      const deltaEjemplares = Number(contents.ejemplares || 1);
      const abiesweb = String(contents.abiesweb || '').trim();

      const data = sheet.getDataRange().getValues();
      let foundIndex = -1;
      let currentCopies = 0;

      const cleanTitleInput = cleanString(titulo);
      const cleanIsbnInput = isbn.replace(/[^0-9X]/gi, '');

      for (let i = 1; i < data.length; i++) {
        const rowIsbn = String(data[i][0] || '').replace(/[^0-9X]/gi, '');
        const rowTitle = cleanString(String(data[i][2] || ''));

        const matchIsbn = cleanIsbnInput && rowIsbn && cleanIsbnInput === rowIsbn;
        const matchTitle = cleanTitleInput && rowTitle && cleanTitleInput === rowTitle;

        if (matchIsbn || matchTitle) {
          foundIndex = i + 1;
          currentCopies = Number(data[i][5] || 1);
          break;
        }
      }

      const nowStr = new Date().toLocaleString("es-ES");

      if (foundIndex > 0) {
        // YA EXISTE: Sumar +1 ejemplar en Columna F (índice 6)
        const newCopies = currentCopies + deltaEjemplares;
        sheet.getRange(foundIndex, 6).setValue(newCopies);
        sheet.getRange(foundIndex, 8).setValue(nowStr);
        if (sinopsis) sheet.getRange(foundIndex, 5).setValue(sinopsis);

        return createJsonResponse({
          status: "updated",
          action: "incremented",
          message: `Libro existente. Se ha sumado +${deltaEjemplares} ejemplar(es).`,
          rowId: foundIndex,
          nuevoTotalEjemplares: newCopies,
          book: { isbn, portada, titulo, autor, sinopsis, ejemplares: newCopies, abiesweb }
        });
      } else {
        // NO EXISTE: Fila [ISBN (A), Portada (B), Título (C), Autor (D), Sinopsis (E), Ejemplares (F), Abiesweb (G), Fecha (H)]
        const newRow = [isbn, portada, titulo, autor, sinopsis, deltaEjemplares, abiesweb, nowStr];
        sheet.appendRow(newRow);

        return createJsonResponse({
          status: "created",
          action: "inserted",
          message: "Nuevo lote registrado correctamente.",
          rowId: sheet.getLastRow(),
          nuevoTotalEjemplares: deltaEjemplares,
          book: { isbn, portada, titulo, autor, sinopsis, ejemplares: deltaEjemplares, abiesweb }
        });
      }
    } else if (action === 'update_copies') {
      const rowId = Number(contents.rowId);
      const newCount = Math.max(0, Number(contents.ejemplares));
      if (rowId > 1) {
        sheet.getRange(rowId, 6).setValue(newCount);
        sheet.getRange(rowId, 8).setValue(new Date().toLocaleString("es-ES"));
        return createJsonResponse({ status: "success", action: "copies_updated", rowId, nuevoTotalEjemplares: newCount });
      }
    }

    return createJsonResponse({ status: "error", message: "Acción no reconocida." });

  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Biblioteca_Lotes");
  if (!sheet) {
    sheet = ss.getActiveSheet();
    sheet.setName("Biblioteca_Lotes");
  }
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["ISBN", "Portada", "Título", "Autor", "Sinopsis", "Ejemplares", "Abiesweb", "Última Actualización"]);
    sheet.getRange("A1:H1").setFontWeight("bold").setBackground("#fed7aa");
  }
  
  return sheet;
}

function cleanString(str) {
  return String(str || '')
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

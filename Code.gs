const DB_PROPERTY_KEY = 'MYTIX_DB_SHEET_ID';

const SHEET_NAMES = Object.freeze({
  PRODUCTS: 'products',
  TRANSACTIONS: 'transactions',
  TRANSACTION_ITEMS: 'transaction_items',
});

const SHEET_HEADERS = Object.freeze({
  PRODUCTS: ['id', 'category', 'name', 'price', 'desc', 'is_active', 'created_at', 'updated_at'],
  TRANSACTIONS: ['transaction_id', 'created_at', 'payment_method', 'total', 'cash_received', 'change_amount', 'line_count', 'qty_total'],
  TRANSACTION_ITEMS: ['transaction_id', 'product_id', 'product_name', 'category', 'qty', 'unit_price', 'subtotal'],
});

const DUMMY_PRODUCTS = Object.freeze([
  { id: 'w1', category: 'wisata', name: 'Tiket Terusan Dufan', price: 275000, desc: 'Akses penuh ke semua wahana.' },
  { id: 'w2', category: 'wisata', name: 'Tiket Ragunan', price: 15000, desc: 'Tiket masuk dewasa.' },
  { id: 'w3', category: 'wisata', name: 'Tiket Candi Borobudur', price: 50000, desc: 'Tiket domestik area pelataran.' },
  { id: 'k1', category: 'kendaraan', name: 'Tiket Bus Trans', price: 3500, desc: 'Tarif flat satu kali jalan.' },
  { id: 'k2', category: 'kendaraan', name: 'Tiket Damri Bandara', price: 65000, desc: 'Rute eksekutif ke Soekarno-Hatta.' },
  { id: 'k3', category: 'kendaraan', name: 'Tiket KAI Ekonomi', price: 120000, desc: 'Jakarta - Bandung (KA lokal).' },
]);

const PAYMENT_LABELS = Object.freeze({
  cash: 'Tunai',
});

function doGet(e) {
  return routeApiRequest_('GET', e);
}

function doPost(e) {
  return routeApiRequest_('POST', e);
}

function routeApiRequest_(method, e) {
  try {
    const action = resolveApiAction_(method, e);

    switch (action) {
      case 'products':
        return jsonOutput_(getProducts());
      case 'create-transaction':
        if (method !== 'POST') {
          return jsonOutput_({
            ok: false,
            error: {
              code: 'method_not_allowed',
              message: 'Gunakan metode POST untuk create-transaction.',
            },
          });
        }

        return jsonOutput_(createTransaction(parseCreateTransactionPayload_(e)));
      case 'setup-db':
        return jsonOutput_(setupDatabase());
      case 'health':
        return jsonOutput_({
          ok: true,
          data: {
            service: 'MyTix POS API',
            timestamp: new Date().toISOString(),
            timezone: Session.getScriptTimeZone(),
          },
        });
      default:
        return jsonOutput_(buildApiHelp_());
    }
  } catch (error) {
    return jsonOutput_({
      ok: false,
      error: {
        code: 'internal_error',
        message: error && error.message ? error.message : 'Terjadi kesalahan server.',
      },
    });
  }
}

function resolveApiAction_(method, e) {
  const parameterAction = e && e.parameter && e.parameter.action
    ? String(e.parameter.action).trim().toLowerCase()
    : '';

  if (parameterAction) {
    return normalizeAction_(parameterAction);
  }

  if (method === 'POST') {
    const body = parseJsonBody_(e);
    const bodyAction = body && body.action ? String(body.action).trim().toLowerCase() : '';
    if (bodyAction) {
      return normalizeAction_(bodyAction);
    }
  }

  return 'help';
}

function normalizeAction_(rawAction) {
  switch (rawAction) {
    case 'products':
    case 'get-products':
      return 'products';
    case 'create-transaction':
    case 'create_transaction':
    case 'transaction':
      return 'create-transaction';
    case 'setup-db':
    case 'setup':
      return 'setup-db';
    case 'health':
    case 'ping':
      return 'health';
    default:
      return rawAction;
  }
}

function parseCreateTransactionPayload_(e) {
  const body = parseJsonBody_(e);
  if (!body || typeof body !== 'object') {
    throw new Error('Body request tidak valid.');
  }

  if (body.payload && typeof body.payload === 'object') {
    return body.payload;
  }

  if (body.data && typeof body.data === 'object') {
    return body.data;
  }

  return body;
}

function parseJsonBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }

  const rawBody = String(e.postData.contents || '').trim();
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch (error) {
    throw new Error('Body request harus berupa JSON valid.');
  }
}

function buildApiHelp_() {
  return {
    ok: true,
    data: {
      service: 'MyTix POS API',
      usage: {
        products: {
          method: 'GET',
          endpoint: '?action=products',
        },
        createTransaction: {
          method: 'POST',
          endpoint: '?action=create-transaction',
          bodyExample: {
            paymentMethod: 'cash',
            cashReceived: 300000,
            items: [
              { id: 'w1', qty: 1 },
              { id: 'k1', qty: 2 },
            ],
          },
        },
      },
    },
  };
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Menyediakan data produk aktif untuk frontend.
 * @returns {{ok: boolean, data: Array}}
 */
function getProducts() {
  const spreadsheet = getOrCreateDatabase_();
  const productSheet = spreadsheet.getSheetByName(SHEET_NAMES.PRODUCTS);
  const rows = readRows_(productSheet, SHEET_HEADERS.PRODUCTS.length);
  const products = rows
    .map(rowToProduct_)
    .filter(Boolean);

  return {
    ok: true,
    data: products,
  };
}

/**
 * Menyimpan transaksi penjualan.
 * Server menjadi source of truth untuk harga dan total.
 * @param {Object} payload
 * @returns {{ok: boolean, data: Object}}
 */
function createTransaction(payload) {
  const normalized = normalizePayload_(payload);
  const spreadsheet = getOrCreateDatabase_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const productSheet = spreadsheet.getSheetByName(SHEET_NAMES.PRODUCTS);
    const productMap = buildProductMap_(productSheet);
    const items = buildTransactionItems_(normalized.items, productMap);

    if (!items.length) {
      throw new Error('Minimal 1 item harus dipilih.');
    }

    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    if (normalized.cashReceived < total) {
      throw new Error('Nominal pembayaran kurang.');
    }

    const now = new Date();
    const transactionId = buildTransactionId_(now);
    const changeAmount = normalized.cashReceived - total;

    writeTransaction_(spreadsheet, {
      transactionId,
      now,
      paymentMethod: normalized.paymentMethod,
      total,
      cashReceived: normalized.cashReceived,
      changeAmount,
      items,
    });

    return {
      ok: true,
      data: {
        transactionId,
        createdAt: now.toISOString(),
        createdAtDisplay: formatDateTimeID_(now),
        paymentMethod: normalized.paymentMethod,
        paymentMethodLabel: PAYMENT_LABELS[normalized.paymentMethod] || normalized.paymentMethod,
        total,
        cashReceived: normalized.cashReceived,
        changeAmount,
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          qty: item.qty,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
        })),
      },
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Utility setup/manual check untuk memastikan database tersedia.
 * @returns {{ok: boolean, data: {spreadsheetId: string, spreadsheetUrl: string}}}
 */
function setupDatabase() {
  const spreadsheet = getOrCreateDatabase_();
  return {
    ok: true,
    data: {
      spreadsheetId: spreadsheet.getId(),
      spreadsheetUrl: spreadsheet.getUrl(),
    },
  };
}

function getOrCreateDatabase_() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const existingSheetId = scriptProperties.getProperty(DB_PROPERTY_KEY);
  let spreadsheet = null;

  if (existingSheetId) {
    try {
      spreadsheet = SpreadsheetApp.openById(existingSheetId);
    } catch (error) {
      scriptProperties.deleteProperty(DB_PROPERTY_KEY);
    }
  }

  if (!spreadsheet) {
    spreadsheet = SpreadsheetApp.create('MyTix POS Database');
    scriptProperties.setProperty(DB_PROPERTY_KEY, spreadsheet.getId());
  }

  ensureSchema_(spreadsheet);
  seedDummyProductsIfNeeded_(spreadsheet.getSheetByName(SHEET_NAMES.PRODUCTS));

  return spreadsheet;
}

function ensureSchema_(spreadsheet) {
  ensureSheetWithHeader_(spreadsheet, SHEET_NAMES.PRODUCTS, SHEET_HEADERS.PRODUCTS);
  ensureSheetWithHeader_(spreadsheet, SHEET_NAMES.TRANSACTIONS, SHEET_HEADERS.TRANSACTIONS);
  ensureSheetWithHeader_(spreadsheet, SHEET_NAMES.TRANSACTION_ITEMS, SHEET_HEADERS.TRANSACTION_ITEMS);
}

function ensureSheetWithHeader_(spreadsheet, sheetName, headers) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }

  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasMismatch = headers.some((header, index) => String(currentHeaders[index] || '').trim() !== header);

  if (hasMismatch) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  sheet.setFrozenRows(1);
}

function seedDummyProductsIfNeeded_(productSheet) {
  if (productSheet.getLastRow() > 1) {
    return;
  }

  const nowIso = new Date().toISOString();
  const rows = DUMMY_PRODUCTS.map((item) => [
    item.id,
    item.category,
    item.name,
    item.price,
    item.desc,
    true,
    nowIso,
    nowIso,
  ]);

  if (!rows.length) {
    return;
  }

  productSheet.getRange(2, 1, rows.length, SHEET_HEADERS.PRODUCTS.length).setValues(rows);
}

function normalizePayload_(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload transaksi tidak valid.');
  }

  const paymentMethod = String(payload.paymentMethod || '').trim().toLowerCase();
  if (paymentMethod !== 'cash') {
    throw new Error('Metode pembayaran tidak didukung.');
  }

  const cashReceived = toPositiveInteger_(payload.cashReceived);
  if (cashReceived <= 0) {
    throw new Error('Nominal pembayaran harus lebih besar dari 0.');
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new Error('Daftar item transaksi wajib diisi.');
  }

  const items = payload.items.map((item, index) => normalizePayloadItem_(item, index));
  return { paymentMethod, cashReceived, items };
}

function normalizePayloadItem_(item, index) {
  if (!item || typeof item !== 'object') {
    throw new Error(`Item ke-${index + 1} tidak valid.`);
  }

  const id = String(item.id || '').trim();
  const qty = toPositiveInteger_(item.qty);

  if (!id) {
    throw new Error(`Produk pada item ke-${index + 1} belum dipilih.`);
  }

  if (qty <= 0) {
    throw new Error(`Quantity item ke-${index + 1} tidak valid.`);
  }

  return { id, qty };
}

function buildProductMap_(productSheet) {
  const rows = readRows_(productSheet, SHEET_HEADERS.PRODUCTS.length);
  const productMap = {};

  rows.forEach((row) => {
    const product = rowToProduct_(row);
    if (product) {
      productMap[product.id] = product;
    }
  });

  return productMap;
}

function buildTransactionItems_(requestedItems, productMap) {
  const mergedQty = {};
  requestedItems.forEach((item) => {
    mergedQty[item.id] = (mergedQty[item.id] || 0) + item.qty;
  });

  return Object.keys(mergedQty).map((productId) => {
    const product = productMap[productId];
    if (!product) {
      throw new Error(`Produk dengan ID "${productId}" tidak ditemukan atau tidak aktif.`);
    }

    const qty = mergedQty[productId];
    const subtotal = product.price * qty;

    return {
      id: product.id,
      name: product.name,
      category: product.category,
      qty,
      unitPrice: product.price,
      subtotal,
    };
  });
}

function writeTransaction_(spreadsheet, data) {
  const transactionSheet = spreadsheet.getSheetByName(SHEET_NAMES.TRANSACTIONS);
  const itemSheet = spreadsheet.getSheetByName(SHEET_NAMES.TRANSACTION_ITEMS);

  const qtyTotal = data.items.reduce((sum, item) => sum + item.qty, 0);
  transactionSheet.appendRow([
    data.transactionId,
    data.now.toISOString(),
    data.paymentMethod,
    data.total,
    data.cashReceived,
    data.changeAmount,
    data.items.length,
    qtyTotal,
  ]);

  const itemRows = data.items.map((item) => [
    data.transactionId,
    item.id,
    item.name,
    item.category,
    item.qty,
    item.unitPrice,
    item.subtotal,
  ]);

  if (!itemRows.length) {
    return;
  }

  const startRow = itemSheet.getLastRow() + 1;
  itemSheet.getRange(startRow, 1, itemRows.length, SHEET_HEADERS.TRANSACTION_ITEMS.length)
    .setValues(itemRows);
}

function readRows_(sheet, width) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return [];
  }

  return sheet.getRange(2, 1, lastRow - 1, width).getValues();
}

function rowToProduct_(row) {
  const id = String(row[0] || '').trim();
  const category = String(row[1] || '').trim().toLowerCase();
  const name = String(row[2] || '').trim();
  const price = toPositiveInteger_(row[3]);
  const desc = String(row[4] || '').trim();
  const isActive = parseBoolean_(row[5], true);

  if (!isActive || !id || !name || price <= 0) {
    return null;
  }

  return {
    id,
    category: category || 'lainnya',
    name,
    price,
    desc,
  };
}

function parseBoolean_(value, defaultValue) {
  if (value === true || value === false) {
    return value;
  }

  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return defaultValue;
  }

  if (['true', '1', 'yes', 'y'].indexOf(normalized) !== -1) {
    return true;
  }

  if (['false', '0', 'no', 'n'].indexOf(normalized) !== -1) {
    return false;
  }

  return defaultValue;
}

function toPositiveInteger_(value) {
  const numericValue = Number(value);
  if (!isFinite(numericValue) || numericValue <= 0) {
    return 0;
  }

  return Math.floor(numericValue);
}

function buildTransactionId_(dateValue) {
  const timezone = Session.getScriptTimeZone() || 'Asia/Jakarta';
  const base = Utilities.formatDate(dateValue, timezone, 'yyyyMMdd-HHmmss');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `TRX-${base}-${randomSuffix}`;
}

function formatDateTimeID_(dateValue) {
  const timezone = Session.getScriptTimeZone() || 'Asia/Jakarta';
  return Utilities.formatDate(dateValue, timezone, 'dd/MM/yyyy HH:mm:ss');
}

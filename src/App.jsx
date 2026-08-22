import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Mic, MicOff, Plus, Trash2, X, ShoppingBag, Check,
  ChevronDown, ChevronUp, Store, Keyboard, Send, Search,
  Pencil, Package, BarChart3, History, Settings, Download,
  Upload, Printer, ScanLine, AlertTriangle, WalletCards,
  Banknote, RotateCcw
} from "lucide-react";

/*
  RD KASIR — COMPLETE SINGLE FILE
  Fitur:
  - Produk: tambah/edit/hapus, kategori, SKU, barcode, alias
  - Harga beli & jual, stok, stok minimum, satuan
  - Pencarian produk
  - Keranjang & batas stok
  - Voice input Bahasa Indonesia + input ketik
  - Checkout tunai / QRIS / transfer / debit-kartu
  - Uang pelanggan & kembalian
  - Nomor transaksi otomatis
  - Stok otomatis berkurang
  - Riwayat + detail transaksi
  - Void transaksi + stok dikembalikan
  - Cetak struk
  - Dashboard omzet/laba/transaksi/produk terlaris/stok menipis
  - Export/import backup JSON
  - IndexedDB sebagai penyimpanan utama
  - Migrasi produk/transaksi dari versi prototype lama
  - Pengaturan nama toko
  - Scan barcode jika browser mendukung BarcodeDetector
*/

const DB_NAME = "rd-kasir-db-v3";
const DB_VERSION = 1;
const STORES = ["products", "transactions", "settings"];

const T = {
  paper: "#EAF0E4",
  card: "#FBFAF4",
  ink: "#1E2A22",
  inkSoft: "#4B5D4E",
  rule: "#C9D6BC",
  stamp: "#B23A2E",
  stampDark: "#8C2C22",
  brass: "#A97C33",
  brassLight: "#C9A25A",
  white: "#FFFFFF",
};

const displayFont = "'Georgia', 'Times New Roman', serif";
const monoFont = "'Courier New', Courier, monospace";
const bodyFont = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const rupiah = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(Number(n) || 0);

const dateKey = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

const dateLabel = (d = new Date()) =>
  new Date(d).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const makeId = (prefix = "ID") =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const inputStyle = {
  width: "100%",
  border: `1px solid ${T.rule}`,
  background: T.white,
  borderRadius: 8,
  padding: "10px 11px",
  outline: "none",
  color: T.ink,
  fontFamily: bodyFont,
};

const buttonStyle = (extra = {}) => ({
  border: "none",
  borderRadius: 9,
  padding: "10px 13px",
  cursor: "pointer",
  fontWeight: 700,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  ...extra,
});

const cardStyle = {
  background: T.card,
  border: `1px solid ${T.rule}`,
  borderRadius: 14,
  padding: 16,
};

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================
   INDEXED DB
========================= */

function openDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB tidak tersedia"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      for (const storeName of STORES) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "id" });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGetAll(storeName) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function dbPut(storeName, value) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbPutAll(storeName, values) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);

    store.clear();

    for (const value of values) {
      store.put(value);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDelete(storeName, id) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* =========================
   VOICE PARSER
========================= */

const NUMBER_WORDS = {
  nol: 0,
  satu: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
  enam: 6,
  tujuh: 7,
  delapan: 8,
  sembilan: 9,
  sepuluh: 10,
  sebelas: 11,
  selusin: 12,
};

const UNIT_WORDS = [
  "bungkus",
  "botol",
  "kilo",
  "kg",
  "kilogram",
  "kotak",
  "pcs",
  "buah",
  "ekor",
  "lembar",
  "pak",
  "renceng",
  "sachet",
  "liter",
  "gram",
  "biji",
  "lusin",
  "dus",
  "kaleng",
  "gelas",
];

function extractQuantity(text) {
  const words = normalize(text).split(/\s+/).filter(Boolean);

  if (!words.length) {
    return { qty: 1, rest: "" };
  }

  if (/^\d+$/.test(words[0])) {
    return {
      qty: Math.max(1, parseInt(words[0], 10)),
      rest: words.slice(1).join(" "),
    };
  }

  if (NUMBER_WORDS[words[0]] !== undefined) {
    return {
      qty: Math.max(1, NUMBER_WORDS[words[0]]),
      rest: words.slice(1).join(" "),
    };
  }

  if (words[0] === "sebanyak" && words[1]) {
    if (/^\d+$/.test(words[1])) {
      return {
        qty: Math.max(1, parseInt(words[1], 10)),
        rest: words.slice(2).join(" "),
      };
    }

    if (NUMBER_WORDS[words[1]] !== undefined) {
      return {
        qty: Math.max(1, NUMBER_WORDS[words[1]]),
        rest: words.slice(2).join(" "),
      };
    }
  }

  if (words[0].startsWith("se") && words[0].length > 2) {
    const possibleUnit = words[0].slice(2);

    if (UNIT_WORDS.includes(possibleUnit)) {
      return {
        qty: 1,
        rest: words.slice(1).join(" "),
      };
    }
  }

  return {
    qty: 1,
    rest: words.join(" "),
  };
}

function stripUnits(text) {
  return normalize(text)
    .split(/\s+/)
    .filter((word) => !UNIT_WORDS.includes(word))
    .join(" ");
}

function scoreProduct(query, product) {
  const q = stripUnits(query);

  const candidates = [
    product.name,
    product.sku,
    product.barcode,
    ...(product.aliases || []),
  ]
    .map(normalize)
    .filter(Boolean);

  let best = 0;

  for (const candidate of candidates) {
    if (q === candidate) {
      best = Math.max(best, 100);
      continue;
    }

    if (candidate.includes(q) || q.includes(candidate)) {
      best = Math.max(best, 70 + Math.min(candidate.length, q.length));
      continue;
    }

    const qWords = q.split(/\s+/);
    const cWords = candidate.split(/\s+/);

    const overlap = qWords.filter((word) => cWords.includes(word)).length;

    if (overlap > 0) {
      best = Math.max(best, overlap * 10);
    }
  }

  return best;
}

function findProduct(query, products) {
  let best = null;
  let bestScore = 0;

  for (const product of products) {
    const score = scoreProduct(query, product);

    if (score > bestScore) {
      bestScore = score;
      best = product;
    }
  }

  return bestScore >= 10 ? best : null;
}

function parseVoice(text, products) {
  const parts = normalize(text)
    .split(/\s*(?:,| dan | sama | plus | lalu | kemudian | juga )\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const matched = [];
  const unmatched = [];

  for (const part of parts) {
    const { qty, rest } = extractQuantity(part);
    const product = findProduct(rest, products);

    if (product) {
      matched.push({
        product,
        qty,
      });
    } else if (rest) {
      unmatched.push(part);
    }
  }

  return {
    matched,
    unmatched,
  };
}

/* =========================
   HELPERS
========================= */

function addToCart(cart, product, quantity = 1) {
  const index = cart.findIndex((item) => item.productId === product.id);

  if (index >= 0) {
    const next = [...cart];

    next[index] = {
      ...next[index],
      qty: next[index].qty + quantity,
    };

    return next;
  }

  return [
    ...cart,
    {
      productId: product.id,
      name: product.name,
      price: Number(product.sellPrice ?? product.price ?? 0),
      costPrice: Number(product.costPrice || 0),
      qty: quantity,
      unit: product.unit || "pcs",
    },
  ];
}

function calculateProfit(transaction) {
  if (transaction.voided) return 0;

  return (transaction.items || []).reduce((total, item) => {
    const profitPerItem =
      Number(item.price || 0) - Number(item.costPrice || 0);

    return total + profitPerItem * Number(item.qty || 0);
  }, 0);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function printReceipt(transaction, storeName) {
  const items = (transaction.items || [])
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name)} x${item.qty}</td>
          <td style="text-align:right">${rupiah(
            Number(item.price) * Number(item.qty)
          )}</td>
        </tr>
      `
    )
    .join("");

  const html = `
    <html>
      <head>
        <title>${escapeHtml(transaction.number)}</title>
        <style>
          body {
            font-family: monospace;
            width: 300px;
            margin: 20px auto;
          }
          h2 {
            text-align: center;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          td {
            padding: 5px 0;
            border-bottom: 1px dashed #aaa;
          }
          .center {
            text-align: center;
          }
        </style>
      </head>
      <body>
        <h2>${escapeHtml(storeName)}</h2>

        <div>
          ${escapeHtml(transaction.number)}<br />
          ${new Date(transaction.createdAt).toLocaleString("id-ID")}
        </div>

        <hr />

        <table>${items}</table>

        <hr />

        <div>Total: <b>${rupiah(transaction.total)}</b></div>
        <div>Bayar: ${rupiah(transaction.paid)}</div>
        <div>Kembalian: ${rupiah(transaction.change)}</div>
        <div>Metode: ${escapeHtml(transaction.paymentMethod)}</div>

        <p class="center">Terima kasih 🙏</p>
      </body>
    </html>
  `;

  const printWindow = window.open(
    "",
    "_blank",
    "width=400,height=700"
  );

  if (!printWindow) {
    alert("Popup diblokir browser. Izinkan popup untuk mencetak struk.");
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
    printWindow.print();
  }, 300);
}

function nextTransactionNumber(transactions) {
  const today = dateKey();

  const count =
    transactions.filter(
      (transaction) => dateKey(transaction.createdAt) === today
    ).length + 1;

  return `TRX-${today.replaceAll("-", "")}-${String(count).padStart(
    4,
    "0"
  )}`;
}

function downloadJSON(filename, data) {
  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

/* =========================
   MAIN APP
========================= */

export default function KasirSuara() {
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);

  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState("kasir");

  const [cart, setCart] = useState([]);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Semua");

  const [listening, setListening] = useState(false);
  const [supportsVoice, setSupportsVoice] = useState(true);
  const [liveText, setLiveText] = useState("");
  const [typedText, setTypedText] = useState("");
  const [lastUnmatched, setLastUnmatched] = useState([]);

  const recognitionRef = useRef(null);

  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Tunai");

  const [flash, setFlash] = useState(null);

  const [editingProduct, setEditingProduct] = useState(null);

  const [productForm, setProductForm] = useState({
    name: "",
    category: "",
    sku: "",
    barcode: "",
    aliases: "",
    costPrice: "",
    sellPrice: "",
    stock: "",
    minStock: "0",
    unit: "pcs",
  });

  const [transactionSearch, setTransactionSearch] = useState("");
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  const [settings, setSettings] = useState({
    storeName: "RD Kasir",
  });

  /* =========================
     CALCULATIONS
  ========================= */

  const cartTotal = cart.reduce(
    (total, item) =>
      total + Number(item.price || 0) * Number(item.qty || 0),
    0
  );

  const paid = Number(paymentAmount || 0);

  const change =
    paymentMethod === "Tunai"
      ? Math.max(0, paid - cartTotal)
      : 0;

  const todayTransactions = transactions.filter(
    (transaction) =>
      dateKey(transaction.createdAt) === dateKey() &&
      !transaction.voided
  );

  const todayRevenue = todayTransactions.reduce(
    (total, transaction) =>
      total + Number(transaction.total || 0),
    0
  );

  const todayProfit = todayTransactions.reduce(
    (total, transaction) =>
      total + calculateProfit(transaction),
    0
  );

  const currentMonthRevenue = transactions
    .filter((transaction) => {
      const transactionDate = new Date(transaction.createdAt);
      const now = new Date();

      return (
        transactionDate.getFullYear() === now.getFullYear() &&
        transactionDate.getMonth() === now.getMonth() &&
        !transaction.voided
      );
    })
    .reduce(
      (total, transaction) =>
        total + Number(transaction.total || 0),
      0
    );

  const categories = useMemo(
    () => [
      "Semua",
      ...Array.from(
        new Set(
          products.map(
            (product) => product.category || "Umum"
          )
        )
      ),
    ],
    [products]
  );

  const filteredProducts = useMemo(() => {
    const query = normalize(search);

    return products.filter((product) => {
      const categoryMatch =
        category === "Semua" ||
        (product.category || "Umum") === category;

      const searchable = normalize(
        `${product.name} ${product.sku || ""} ${
          product.barcode || ""
        }`
      );

      return (
        categoryMatch &&
        (!query || searchable.includes(query))
      );
    });
  }, [products, search, category]);

  const topProducts = useMemo(() => {
    const sales = {};

    for (const transaction of transactions) {
      if (transaction.voided) continue;

      for (const item of transaction.items || []) {
        sales[item.name] =
          (sales[item.name] || 0) +
          Number(item.qty || 0);
      }
    }

    return Object.entries(sales)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [transactions]);

  const lowStockProducts = products.filter(
    (product) =>
      Number(product.stock || 0) <=
      Number(product.minStock || 0)
  );

  const filteredTransactions = transactions
    .filter((transaction) => {
      const query = normalize(transactionSearch);

      if (!query) return true;

      const searchable = normalize(
        `${transaction.number} ${
          transaction.paymentMethod
        } ${(transaction.items || [])
          .map((item) => item.name)
          .join(" ")}`
      );

      return searchable.includes(query);
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt) -
        new Date(a.createdAt)
    );

  /* =========================
     LOAD DATA
  ========================= */

  useEffect(() => {
    (async () => {
      try {
        let savedProducts = await dbGetAll("products");
        let savedTransactions =
          await dbGetAll("transactions");

        const savedSettings =
          await dbGetAll("settings");

        /*
          Migrasi dari prototype lama.
        */
        if (!savedProducts.length) {
          try {
            const oldProducts = JSON.parse(
              localStorage.getItem("products") || "[]"
            );

            if (oldProducts.length) {
              savedProducts = oldProducts.map(
                (product) => ({
                  ...product,
                  sellPrice: Number(
                    product.sellPrice ??
                      product.price ??
                      0
                  ),
                  price: Number(
                    product.sellPrice ??
                      product.price ??
                      0
                  ),
                  costPrice: Number(
                    product.costPrice || 0
                  ),
                  stock: Number(
                    product.stock || 0
                  ),
                  minStock: Number(
                    product.minStock || 0
                  ),
                  category:
                    product.category || "Umum",
                  unit: product.unit || "pcs",
                  aliases:
                    product.aliases || [],
                })
              );

              await dbPutAll(
                "products",
                savedProducts
              );
            }
          } catch {}
        }

        /*
          Migrasi transaksi harian lama.
        */
        if (!savedTransactions.length) {
          try {
            const oldTransactions = [];

            for (let i = 0; i < localStorage.length; i++) {
              const key =
                localStorage.key(i);

              if (!key?.startsWith("day:")) {
                continue;
              }

              try {
                const data = JSON.parse(
                  localStorage.getItem(key)
                );

                for (const transaction of
                  data.transactions || []) {
                  oldTransactions.push({
                    ...transaction,
                    id:
                      transaction.id ||
                      makeId("TX"),
                    number:
                      transaction.number ||
                      makeId("TRX"),
                    createdAt:
                      transaction.createdAt ||
                      new Date().toISOString(),
                    paymentMethod:
                      transaction.paymentMethod ||
                      "Tunai",
                    paid:
                      transaction.paid ||
                      transaction.total,
                    change:
                      transaction.change || 0,
                    voided: false,
                    items: (
                      transaction.items || []
                    ).map((item) => ({
                      ...item,
                      costPrice: Number(
                        item.costPrice || 0
                      ),
                    })),
                  });
                }
              } catch {}
            }

            if (oldT

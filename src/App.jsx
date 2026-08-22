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

            if (oldTransactions.length) {
              savedTransactions =
                oldTransactions;

              await dbPutAll(
                "transactions",
                savedTransactions
              );
            }
          } catch {}
        }

        setProducts(savedProducts);
        setTransactions(savedTransactions);

        if (savedSettings[0]?.value) {
          setSettings(
            savedSettings[0].value
          );
        }
      } catch (error) {
        console.error(error);
        alert(
          "Gagal membuka database lokal."
        );
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  /* =========================
     SPEECH RECOGNITION
  ========================= */

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSupportsVoice(false);
      return;
    }

    const recognition =
      new SpeechRecognition();

    recognition.lang = "id-ID";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let text = "";

      for (
        let i = 0;
        i < event.results.length;
        i++
      ) {
        text +=
          event.results[i][0].transcript;
      }

      setLiveText(text);

      const lastResult =
        event.results[
          event.results.length - 1
        ];

      if (lastResult?.isFinal) {
        handleVoiceResult(text);
      }
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognitionRef.current =
      recognition;

    return () => {
      try {
        recognition.stop();
      } catch {}
    };
  }, [products]);

  function handleVoiceResult(text) {
    const result = parseVoice(
      text,
      products
    );

    setLastUnmatched(
      result.unmatched
    );

    if (result.matched.length) {
      setCart((previous) => {
        let next = [...previous];

        for (const item of result.matched) {
          const current =
            next.find(
              (cartItem) =>
                cartItem.productId ===
                item.product.id
            )?.qty || 0;

          if (
            current + item.qty >
            Number(item.product.stock || 0)
          ) {
            continue;
          }

          next = addToCart(
            next,
            item.product,
            item.qty
          );
        }

        return next;
      });
    }

    setLiveText("");
  }

  function toggleVoice() {
    if (!recognitionRef.current) return;

    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    setLastUnmatched([]);
    setLiveText("");

    try {
      recognitionRef.current.start();
      setListening(true);
    } catch {}
  }

  function submitTyped() {
    if (!typedText.trim()) return;

    handleVoiceResult(
      typedText
    );

    setTypedText("");
  }

  /* =========================
     PRODUCT FORM
  ========================= */

  function resetProductForm() {
    setEditingProduct(null);

    setProductForm({
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
  }

  function startEditProduct(product) {
    setEditingProduct(
      product.id
    );

    setProductForm({
      name: product.name || "",
      category:
        product.category || "Umum",
      sku: product.sku || "",
      barcode: product.barcode || "",
      aliases:
        (product.aliases || []).join(
          ", "
        ),
      costPrice: String(
        product.costPrice || ""
      ),
      sellPrice: String(
        product.sellPrice ??
          product.price ??
          ""
      ),
      stock: String(
        product.stock ?? ""
      ),
      minStock: String(
        product.minStock ?? 0
      ),
      unit:
        product.unit || "pcs",
    });

    setPage("produk");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function saveProduct() {
    const name =
      productForm.name.trim();

    const sellPrice = Number(
      productForm.sellPrice
    );

    const stock = Number(
      productForm.stock
    );

    if (
      !name ||
      !sellPrice ||
      !Number.isFinite(stock) ||
      stock < 0
    ) {
      alert(
        "Nama, harga jual, dan stok wajib diisi dengan benar."
      );
      return;
    }

    const oldProduct =
      products.find(
        (product) =>
          product.id ===
          editingProduct
      );

    const product = {
      id:
        editingProduct ||
        makeId("PRD"),

      name,

      category:
        productForm.category.trim() ||
        "Umum",

      sku:
        productForm.sku.trim(),

      barcode:
        productForm.barcode.trim(),

      aliases:
        productForm.aliases
          .split(",")
          .map((item) =>
            item.trim()
          )
          .filter(Boolean),

      costPrice: Number(
        productForm.costPrice || 0
      ),

      sellPrice,

      price: sellPrice,

      stock,

      minStock: Number(
        productForm.minStock || 0
      ),

      unit:
        productForm.unit ||
        "pcs",

      createdAt:
        oldProduct?.createdAt ||
        new Date().toISOString(),

      updatedAt:
        new Date().toISOString(),
    };

    const nextProducts =
      editingProduct
        ? products.map(
            (item) =>
              item.id ===
              editingProduct
                ? product
                : item
          )
        : [
            ...products,
            product,
          ];

    await dbPutAll(
      "products",
      nextProducts
    );

    setProducts(
      nextProducts
    );

    resetProductForm();
  }

  async function deleteProduct(id) {
    const product =
      products.find(
        (item) =>
          item.id === id
      );

    if (!product) return;

    if (
      !confirm(
        `Hapus "${product.name}"?`
      )
    ) {
      return;
    }

    await dbDelete(
      "products",
      id
    );

    setProducts(
      (previous) =>
        previous.filter(
          (item) =>
            item.id !== id
        )
    );

    setCart(
      (previous) =>
        previous.filter(
          (item) =>
            item.productId !== id
        )
    );
  }

  function addProductToCart(
    product,
    quantity = 1
  ) {
    const currentQuantity =
      cart.find(
        (item) =>
          item.productId ===
          product.id
      )?.qty || 0;

    if (
      currentQuantity +
        quantity >
      Number(product.stock || 0)
    ) {
      alert(
        `Stok ${product.name} hanya ${product.stock} ${product.unit || "pcs"}.`
      );
      return;
    }

    setCart(
      (previous) =>
        addToCart(
          previous,
          product,
          quantity
        )
    );
  }

  function changeCartQuantity(
    productId,
    delta
  ) {
    const cartItem =
      cart.find(
        (item) =>
          item.productId ===
          productId
      );

    const product =
      products.find(
        (item) =>
          item.id ===
          productId
      );

    if (!cartItem || !product) {
      return;
    }

    const nextQuantity =
      cartItem.qty + delta;

    if (
      nextQuantity >
      Number(product.stock || 0)
    ) {
      alert(
        `Stok ${product.name} hanya ${product.stock}.`
      );
      return;
    }

    setCart(
      (previous) =>
        previous
          .map((item) =>
            item.productId ===
            productId
              ? {
                  ...item,
                  qty: Math.max(
                    0,
                    nextQuantity
                  ),
                }
              : item
          )
          .filter(
            (item) =>
              item.qty > 0
          )
    );
  }

  /* =========================
     PAYMENT
  ========================= */

  function openPayment() {
    if (!cart.length) return;

    setPaymentAmount("");

    setPaymentMethod(
      "Tunai"
    );

    setShowPayment(true);
  }

  async function finishTransaction() {
    if (!cart.length) {
      return false;
    }

    /*
      Cek stok sekali lagi sebelum transaksi.
    */
    for (const item of cart) {
      const product =
        products.find(
          (product) =>
            product.id ===
            item.productId
        );

      if (!product) {
        alert(
          `Barang "${item.name}" tidak ditemukan.`
        );

        return false;
      }

      if (
        item.qty >
        Number(product.stock || 0)
      ) {
        alert(
          `Stok "${product.name}" tidak cukup.`
        );

        return false;
      }
    }

    /*
      Untuk tunai, pelanggan wajib membayar
      minimal sebesar total.
    */
    if (
      paymentMethod ===
        "Tunai" &&
      paid < cartTotal
    ) {
      alert(
        "Uang pelanggan masih kurang."
      );

      return false;
    }

    /*
      Kurangi stok.
    */
    const updatedProducts =
      products.map(
        (product) => {
          const cartItem =
            cart.find(
              (item) =>
                item.productId ===
                product.id
            );

          if (!cartItem) {
            return product;
          }

          return {
            ...product,
            stock: Math.max(
              0,
              Number(
                product.stock || 0
              ) -
                Number(
                  cartItem.qty || 0
                )
            ),
          };
        }
      );

    /*
      Simpan snapshot barang.
      Jadi kalau harga produk berubah besok,
      transaksi lama tetap menggunakan harga
      saat transaksi terjadi.
    */
    const transaction = {
      id: makeId("TX"),

      number:
        nextTransactionNumber(
          transactions
        ),

      createdAt:
        new Date().toISOString(),

      total: cartTotal,

      paid:
        paymentMethod ===
        "Tunai"
          ? paid
          : cartTotal,

      change:
        paymentMethod ===
        "Tunai"
          ? change
          : 0,

      paymentMethod,

      voided: false,

      items: cart.map(
        (item) => ({
          productId:
            item.productId,

          name: item.name,

          qty: item.qty,

          price: item.price,

          costPrice:
            item.costPrice,

          unit: item.unit,
        })
      ),
    };

    await dbPutAll(
      "products",
      updatedProducts
    );

    await dbPut(
      "transactions",
      transaction
    );

    setProducts(
      updatedProducts
    );

    setTransactions(
      (previous) => [
        transaction,
        ...previous,
      ]
    );

    setCart([]);

    setPaymentAmount("");

    setShowPayment(false);

    setFlash(
      transaction.total
    );

    setTimeout(
      () => setFlash(null),
      1800
    );

    return true;
  }

  /* =========================
     VOID TRANSACTION
  ========================= */

  async function voidTransaction(
    transaction
  ) {
    if (transaction.voided) {
      return;
    }

    if (
      !confirm(
        `Batalkan transaksi ${transaction.number}? Stok akan dikembalikan.`
      )
    ) {
      return;
    }

    const updatedProducts =
      products.map(
        (product) => {
          const item =
            transaction.items.find(
              (transactionItem) =>
                transactionItem.productId ===
                product.id
            );

          if (!item) {
            return product;
          }

          return {
            ...product,
            stock:
              Number(
                product.stock || 0
              ) +
              Number(
                item.qty || 0
              ),
          };
        }
      );

    const updatedTransaction =
      {
        ...transaction,
        voided: true,
        voidedAt:
          new Date().toISOString(),
      };

    await dbPutAll(
      "products",
      updatedProducts
    );

    await dbPut(
      "transactions",
      updatedTransaction
    );

    setProducts(
      updatedProducts
    );

    setTransactions(
      (previous) =>
        previous.map(
          (item) =>
            item.id ===
            transaction.id
              ? updatedTransaction
              : item
        )
    );

    setSelectedTransaction(
      updatedTransaction
    );
  }

  /* =========================
     BACKUP / RESTORE
  ========================= */

  function exportBackup() {
    const backup = {
      app: "RD Kasir",
      version: 3,
      exportedAt:
        new Date().toISOString(),
      products,
      transactions,
      settings,
    };

    downloadJSON(
      `rd-kasir-backup-${dateKey()}.json`,
      backup
    );
  }

  function handleRestoreFile(event) {
    const file =
      event.target.files?.[0];

    if (!file) return;

    const reader =
      new FileReader();

    reader.onload = async () => {
      try {
        const data =
          JSON.parse(
            reader.result
          );

        if (
          !Array.isArray(
            data.products
          ) ||
          !Array.isArray(
            data.transactions
          )
        ) {
          throw new Error(
            "Format backup tidak valid"
          );
        }

        if (
          !confirm(
            "Restore akan mengganti data saat ini. Lanjutkan?"
          )
        ) {
          return;
        }

        await dbPutAll(
          "products",
          data.products
        );

        await dbPutAll(
          "transactions",
          data.transactions
        );

        const restoredSettings =
          data.settings || {
            storeName:
              "RD Kasir",
          };

        await dbPut(
          "settings",
          {
            id: "main",
            value:
              restoredSettings,
          }
        );

        setProducts(
          data.products
        );

        setTransactions(
          data.transactions
        );

        setSettings(
          restoredSettings
        );

        alert(
          "Restore berhasil."
        );
      } catch {
        alert(
          "File backup tidak valid atau rusak."
        );
      }
    };

    reader.readAsText(file);

    event.target.value = "";
  }

  async function saveSettings() {
    const nextSettings = {
      ...settings,
      storeName:
        settings.storeName?.trim() ||
        "RD Kasir",
    };

    await dbPut(
      "settings",
      {
        id: "main",
        value: nextSettings,
      }
    );

    setSettings(
      nextSettings
    );

    alert(
      "Pengaturan tersimpan."
    );
  }

  /* =========================
     BARCODE SCANNER
  ========================= */

  async function scanBarcode() {
    if (
      !("BarcodeDetector" in window)
    ) {
      alert(
        "Browser ini belum mendukung scan barcode otomatis. Gunakan input barcode manual di Produk."
      );
      return;
    }

    try {
      const detector =
        new window.BarcodeDetector();

      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            video: {
              facingMode:
                "environment",
            },
          }
        );

      const overlay =
        document.createElement(
          "div"
        );

      overlay.style.cssText = `
        position:fixed;
        inset:0;
        background:#000;
        z-index:99999;
        display:flex;
        align-items:center;
        justify-content:center;
      `;

      overlay.innerHTML = `
        <video
          autoplay
          playsinline
          style="width:100%;height:100%;object-fit:cover"
        ></video>

        <button
          style="
            position:absolute;
            bottom:30px;
            padding:14px 22px;
            border:0;
            border-radius:10px;
          "
        >
          Tutup
        </button>
      `;

      const video =
        overlay.querySelector(
          "video"
        );

      const close =
        () => {
          stream
            .getTracks()
            .forEach(
              (track) =>
                track.stop()
            );

          overlay.remove();
        };

      overlay
        .querySelector(
          "button"
        )
        .addEventListener(
          "click",
          close
        );

      video.srcObject =
        stream;

      document.body.appendChild(
        overlay
      );

      const detect =
        async () => {
          if (
            !document.body.contains(
              overlay
            )
          ) {
            return;
          }

          try {
            const codes =
              await detector.detect(
                video
              );

            if (
              codes[0]?.rawValue
            ) {
              const barcode =
                codes[0].rawValue;

              close();

              const product =
                products.find(
                  (item) =>
                    item.barcode ===
                      barcode ||
                    item.sku ===
                      barcode
                );

              if (!product) {
                alert(
                  `Barcode ${barcode} belum terdaftar.`
                );

                return;
              }

              addProductToCart(
                product
              );

              return;
            }
          } catch {}

          requestAnimationFrame(
            detect
          );
        };

      detect();
    } catch {
      alert(
        "Kamera tidak bisa digunakan. Pastikan izin kamera diberikan."
      );
    }
  }

  /* =========================
     RENDER
  ========================= */

  if (!loaded) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: T.paper,
          display: "grid",
          placeItems: "center",
          fontFamily: bodyFont,
        }}
      >
        Memuat RD Kasir...
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.paper,
        color: T.ink,
        fontFamily: bodyFont,
      }}
    >
      <style>{`
        * {
          box-sizing: border-box;
        }

        button,
        input,
        select {
          font: inherit;
        }

        button:disabled {
          opacity: .5;
          cursor: not-allowed !important;
        }

        @keyframes rdPop {
          from {
            opacity: 0;
            transform: scale(.85);
          }

          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .rd-pop {
          animation: rdPop .25s ease-out;
        }
      `}</style>

      {/* HEADER */}

      <header
        style={{
          background: T.ink,
          color: T.paper,
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent:
              "space-between",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background:
                  T.paper,
                color: T.ink,
                display: "grid",
                placeItems:
                  "center",
              }}
            >
              <Store size={20} />
            </div>

            <div>
              <div
                style={{
                  fontFamily:
                    displayFont,
                  fontWeight: 700,
                  fontSize: 19,
                }}
              >
                {settings.storeName}
              </div>

              <div
                style={{
                  fontSize: 11,
                  opacity: 0.7,
                }}
              >
                {dateLabel()}
              </div>
            </div>
          </div>

          <div
            style={{
              fontFamily: monoFont,
              fontSize: 12,
            }}
          >
            {cart.length} item
          </div>
        </div>
      </header>

      <main
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding:
            "16px 16px 100px",
        }}
      >
        {flash !== null && (
          <div
            className="rd-pop"
            style={{
              position:
                "fixed",
              top: 80,
              left: "50%",
              transform:
                "translateX(-50%)",
              zIndex: 60,
              background: T.ink,
              color: T.paper,
              padding:
                "12px 18px",
              borderRadius: 12,
              boxShadow:
                "0 10px 30px #0003",
            }}
          >
            Transaksi berhasil •{" "}
            {rupiah(flash)}
          </div>
        )}

        {/* ================= KASIR ================= */}

        {page === "kasir" && (
          <>
            <section
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit,minmax(180px,1fr))",
                gap: 10,
                marginBottom: 16,
              }}
            >
              <Stat
                label="Omzet Hari Ini"
                value={rupiah(
                  todayRevenue
                )}
                icon={
                  <WalletCards
                    size={17}
                  />
                }
              />

              <Stat
                label="Transaksi"
                value={String(
                  todayTransactions.length
                )}
                icon={
                  <History
                    size={17}
                  />
                }
              />

              <Stat
                label="Laba Hari Ini"
                value={rupiah(
                  todayProfit
                )}
                icon={
                  <BarChart3
                    size={17}
                  />
                }
              />

              <Stat
                label="Omzet Bulan Ini"
                value={rupiah(
                  currentMonthRevenue
                )}
                icon={
                  <Banknote
                    size={17}
                  />
                }
              />
            </section>

            <section
              style={cardStyle}
            >
              <div
                style={{
                  display:
                    "flex",
                  justifyContent:
                    "space-between",
                  alignItems:
                    "center",
                  gap: 8,
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontFamily:
                      displayFont,
                  }}
                >
                  Kasir
                </h2>

                <button
                  onClick={
                    scanBarcode
                  }
                  style={buttonStyle({
                    background:
                      T.paper,
                    border: `1px solid ${T.rule}`,
                  })}
                >
                  <ScanLine
                    size={16}
                  />
                  Scan
                </button>
              </div>

              {!supportsVoice && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 8,
                    background:
                      "#F7E7E5",
                    color:
                      T.stampDark,
                    fontSize: 12,
                  }}
                >
                  Browser ini tidak
                  mendukung input
                  suara.
                </div>
              )}

              <div
                style={{
                  display:
                    "flex",
                  flexDirection:
                    "column",
                  alignItems:
                    "center",
                  padding:
                    "18px 0 12px",
                }}
              >
                <button
                  onClick={
                    toggleVoice
                  }
                  disabled={
                    !supportsVoice
                  }
                  style={buttonStyle({
                    width: 86,
                    height: 86,
                    borderRadius:
                      "50%",
                    padding: 0,
                    background:
                      listening
                        ? T.stamp
                        : T.ink,
                    color:
                      T.paper,
                    boxShadow:
                      "0 7px 20px #1e2a2238",
                  })}
                >
                  {listening ? (
                    <MicOff
                      size={30}
                    />
                  ) : (
                    <Mic
                      size={30}
                    />
                  )}
                </button>

                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color:
                      T.inkSoft,
                    textAlign:
                      "center",
                    minHeight: 18,
                  }}
                >
                  {listening
                    ? liveText ||
                      "Mendengarkan..."
                    : 'Contoh: "dua indomie, tiga aqua"'}
                </div>

                {lastUnmatched.length >
                  0 && (
                  <div
                    style={{
                      color:
                        T.stampDark,
                      fontSize: 12,
                      marginTop: 4,
                      textAlign:
                        "center",
                    }}
                  >
                    Tidak dikenali:{" "}
                    {lastUnmatched.join(
                      ", "
                    )}
                  </div>
                )}
              </div>

              {/* INPUT MANUAL */}

              <div
                style={{
                  display:
                    "flex",
                  gap: 7,
                  marginBottom:
                    14,
                }}
              >
                <Keyboard
                  size={17}
                  style={{
                    marginTop: 10,
                    color:
                      T.inkSoft,
                  }}
                />

                <input
                  value={
                    typedText
                  }
                  onChange={(event) =>
                    setTypedText(
                      event.target
                        .value
                    )
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key ===
                      "Enter"
                    ) {
                      submitTyped();
                    }
                  }}
                  placeholder="Ketik barang..."
                  style={
                    inputStyle
                  }
                />

                <button
                  onClick={
                    submitTyped
                  }
                  style={buttonStyle({
                    background:
                      T.ink,
                    color:
                      T.paper,
                  })}
                >
                  <Send
                    size={16}
                  />
                </button>
              </div>

              {/* KERANJANG */}

              <div
                style={{
                  borderTop: `1px solid ${T.rule}`,
                  paddingTop: 12,
                }}
              >
                <div
                  style={{
                    fontFamily:
                      monoFont,
                    fontSize: 11,
                    textTransform:
                      "uppercase",
                    color:
                      T.inkSoft,
                    marginBottom:
                      8,
                  }}
                >
                  Transaksi Berjalan
                </div>

                {cart.length ===
                0 ? (
                  <div
                    style={{
                      color:
                        T.inkSoft,
                      fontSize: 13,
                      padding:
                        "12px 0",
                    }}
                  >
                    Belum ada
                    barang.
                  </div>
                ) : (
                  cart.map(
                    (item) => (
                      <div
                        key={
                          item.productId
                        }
                        style={{
                          display:
                            "flex",
                          alignItems:
                            "center",
                          justifyContent:
                            "space-between",
                          gap: 8,
                          padding:
                            "8px 0",
                          borderBottom:
                            `1px dashed ${T.rule}`,
                        }}
                      >
                        <div
                          style={{
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          <div
                            style={{
                              fontWeight:
                                700,
                              overflow:
                                "hidden",
                              textOverflow:
                                "ellipsis",
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            {item.name}
                          </div>

                          <div
                            style={{
                              color:
                                T.inkSoft,
                              fontSize: 11,
                            }}
                          >
                            {item.qty} ×{" "}
                            {rupiah(
                              item.price
                            )}
                          </div>
                        </div>

                        <div
                          style={{
                            display:
                              "flex",
                            alignItems:
                              "center",
                            gap: 5,
                          }}
                        >
                          <button
                            onClick={() =>
                              changeCartQuantity(
                                item.productId,
                                -1
                              )
                            }
                            style={buttonStyle({
                              padding:
                                "4px 8px",
                              background:
                                T.paper,
                            })}
                          >
                            −
                          </button>

                          <b
                            style={{
                              fontFamily:
                                monoFont,
                              width: 20,
                              textAlign:
                                "center",
                            }}
                          >
                            {item.qty}
                          </b>

                          <button
                            onClick={() =>
                              changeCartQuantity(
                                item.productId,
                                1
                              )
                            }
                            style={buttonStyle({
                              padding:
                                "4px 8px",
                              background:
                                T.paper,
                            })}
                          >
                            +
                          </button>

                          <button
                            onClick={() =>
                              setCart(
                                (previous) =>
                                  previous.filter(
                                    (cartItem) =>
                                      cartItem.productId !==
                                      item.productId
                                  )
                              )
                            }
                            style={buttonStyle({
                              padding: 6,
                              background:
                                "#F7E7E5",
                              color:
                                T.stamp,
                            })}
                          >
                            <Trash2
                              size={13}
                            />
                          </button>
                        </div>
                      </div>
                    )
                  )
                )}

                {cart.length >
                  0 && (
                  <>
                    <div
                      style={{
                        display:
                          "flex",
                        justifyContent:
                          "space-between",
                        marginTop: 12,
                        fontSize: 18,
                        fontFamily:
                          monoFont,
                        fontWeight:
                          700,
                      }}
                    >
                      <span>
                        Total
                      </span>

                      <span>
                        {rupiah(
                          cartTotal
                        )}
                      </span>
                    </div>

                    <button
                      onClick={
                        openPayment
                      }
                      style={buttonStyle({
                        width:
                          "100%",
                        marginTop:
                          12,
                        background:
                          T.ink,
                        color:
                          T.paper,
                      })}
                    >
                      <Check
                        size={16}
                      />
                      Bayar
                    </button>
                  </>
                )}
              </div>
            </section>

            {/* BARANG CEPAT */}

            <section
              style={{
                ...cardStyle,
                marginTop: 16,
              }}
            >
              <div
                style={{
                  display:
                    "flex",
                  justifyContent:
                    "space-between",
                  alignItems:
                    "center",
                  gap: 8,
                  marginBottom:
                    10,
                }}
              >
                <h3
                  style={{
                    margin: 0,
                  }}
                >
                  Barang Cepat
                </h3>

                <button
                  onClick={() =>
                    setPage(
                      "produk"
                    )
                  }
                  style={buttonStyle({
                    background:
                      T.paper,
                  })}
                >
                  Kelola
                </button>
              </div>

              <div
                style={{
                  display:
                    "flex",
                  gap: 8,
                  overflowX:
                    "auto",
                  paddingBottom:
                    4,
                }}
              >
                {products
                  .slice(0, 12)
                  .map(
                    (product) => (
                      <button
                        key={
                          product.id
                        }
                        onClick={() =>
                          addProductToCart(
                            product
                          )
                        }
                        style={buttonStyle({
                          minWidth:
                            130,
                          background:
                            T.white,
                          border: `1px solid ${T.rule}`,
                          display:
                            "block",
                          textAlign:
                            "left",
                        })}
                      >
                        <div
                          style={{
                            fontWeight:
                              700,
                          }}
                        >
                          {
                            product.name
                          }
                        </div>

                        <div
                          style={{
                            fontSize:
                              11,
                            color:
                              T.inkSoft,
                          }}
                        >
                          {rupiah(
                            product.sellPrice
                          )}{" "}
                          • stok{" "}
                          {
                            product.stock
                          }
                        </div>
                      </button>
                    )
                  )}
              </div>
            </section>
          </>
        )}

        {/* ================= PRODUK ================= */}

        {page === "produk" && (
          <ProductsPage
            products={
              products
            }
            filteredProducts={
              filteredProducts
            }
            categories={
              categories
            }
            search={
              search
            }
            setSearch={
              setSearch
            }
            category={
              category
            }
            setCategory={
              setCategory
            }
            form={
              productForm
            }
            setForm={
              setProductForm
            }
            editing={
              editingProduct
            }
            save={
              saveProduct
            }
            edit={
              startEditProduct
            }
            remove={
              deleteProduct
            }
            reset={
              resetProductForm
            }
            addToCart={
              addProductToCart
            }
          />
        )}

        {/* ================= TRANSAKSI ================= */}

        {page ===
          "transaksi" && (
          <TransactionsPage
            transactions={
              filteredTransactions
            }
            search={
              transactionSearch
            }
            setSearch={
              setTransactionSearch
            }
            select={
              setSelectedTransaction
            }
            voidTransaction={
              voidTransaction
            }
            print={(transaction) =>
              printReceipt(
                transaction,
                settings.storeName
              )
            }
          />
        )}

        {/* ================= DASHBOARD ================= */}

        {page ===
          "dashboard" && (
          <DashboardPage
            todayRevenue={
              todayRevenue
            }
            todayProfit={
              todayProfit
            }
            todayCount={
              todayTransactions.length
            }
            monthRevenue={
              currentMonthRevenue
            }
            topProducts={
              topProducts
            }
            lowStock={
              lowStockProducts
            }
          />
        )}

        {/* ================= BACKUP ================= */}

        {page === "backup" && (
          <section
            style={cardStyle}
          >
            <h2
              style={{
                fontFamily:
                  displayFont,
                marginTop: 0,
              }}
            >
              Backup & Data
            </h2>

            <p
              style={{
                fontSize: 13,
                color:
                  T.inkSoft,
              }}
            >
              Backup berisi
              produk, stok,
              transaksi, dan
              pengaturan toko.
            </p>

            <div
              style={{
                display:
                  "grid",
                gap: 10,
              }}
            >
              <button
                onClick={
                  exportBackup
                }
                style={buttonStyle({
                  background:
                    T.ink,
                  color:
                    T.paper,
                })}
              >
                <Download
                  size={17}
                />
                Export Backup
              </button>

              <label
                style={buttonStyle({
                  background:
                    T.paper,
                  border: `1px solid ${T.rule}`,
                })}
              >
                <Upload
                  size={17}
                />
                Import / Restore

                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={
                    handleRestoreFile
                  }
                  style={{
                    display:
                      "none",
                  }}
                />
              </label>

              <div
                style={{
                  padding: 12,
                  background:
                    T.paper,
                  borderRadius: 10,
                  fontSize: 12,
                  color:
                    T.inkSoft,
                }}
              >
                Penyimpanan utama
                menggunakan
                IndexedDB pada
                perangkat ini.
                Backup berkala
                tetap disarankan.
              </div>
            </div>
          </section>
        )}

        {/* ================= SETTINGS ================= */}

        {page ===
          "settings" && (
          <section
            style={cardStyle}
          >
            <h2
              style={{
                fontFamily:
                  displayFont,
                marginTop: 0,
              }}
            >
              Pengaturan
            </h2>

            <label
              style={{
                fontSize: 12,
                color:
                  T.inkSoft,
              }}
            >
              Nama toko

              <input
                value={
                  settings.storeName
                }
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    storeName:
                      event.target
                        .value,
                  })
                }
                style={{
                  ...inputStyle,
                  marginTop: 5,
                }}
              />
            </label>

            <button
              onClick={
                saveSettings
              }
              style={buttonStyle({
                marginTop: 12,
                background:
                  T.ink,
                color:
                  T.paper,
              })}
            >
              Simpan
            </button>
          </section>
        )}

        {/* ================= TRANSACTION DETAIL ================= */}

        {selectedTransaction && (
          <TransactionModal
            transaction={
              selectedTransaction
            }
            close={() =>
              setSelectedTransaction(
                null
              )
            }
            voidTransaction={
              voidTransaction
            }
            print={(transaction) =>
              printReceipt(
                transaction,
                settings.storeName
              )
            }
          />
        )}

        {/* ================= PAYMENT ================= */}

        {showPayment &&
          cart.length > 0 && (
            <PaymentModal
              total={
                cartTotal
              }
              paid={
                paymentAmount
              }
              setPaid={
                setPaymentAmount
              }
              method={
                paymentMethod
              }
              setMethod={
                setPaymentMethod
              }
              change={
                change
              }
              cancel={() =>
                setShowPayment(
                  false
                )
              }
              confirm={
                finishTransaction
              }
            />
          )}
      </main>

      {/* NAVIGATION */}

      <nav
        style={{
          position:
            "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          background:
            T.card,
          borderTop: `1px solid ${T.rule}`,
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display:
              "grid",
            gridTemplateColumns:
              "repeat(6,1fr)",
          }}
        >
          <NavButton
            icon={
              <ShoppingBag
                size={18}
              />
            }
            label="Kasir"
            active={
              page === "kasir"
            }
            onClick={() =>
              setPage(
                "kasir"
              )
            }
          />

          <NavButton
            icon={
              <Package
                size={18}
              />
            }
            label="Produk"
            active={
              page === "produk"
            }
            onClick={() =>
              setPage(
                "produk"
              )
            }
          />

          <NavButton
            icon={
              <History
                size={18}
              />
            }
            label="Transaksi"
            active={
              page ===
              "transaksi"
            }
            onClick={() =>
              setPage(
                "transaksi"
              )
            }
          />

          <NavButton
            icon={
              <BarChart3
                size={18}
              />
            }
            label="Laporan"
            active={
              page ===
              "dashboard"
            }
            onClick={() =>
              setPage(
                "dashboard"
              )
            }
          />

          <NavButton
            icon={
              <Download
                size={18}
              />
            }
            label="Backup"
            active={
              page === "backup"
            }
            onClick={() =>
              setPage(
                "backup"
              )
            }
          />

          <NavButton
            icon={
              <Settings
                size={18}
              />
            }
            label="Setelan"
            active={
              page ===
              "settings"
            }
            onClick={() =>
              setPage(
                "settings"
              )
            }
          />
        </div>
      </nav>
    </div>
  );
}

/* =========================
   SMALL COMPONENTS
========================= */

function NavButton({
  icon,
  label,
  active,
  onClick,
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "none",
        background:
          "transparent",
        color: active
          ? T.ink
          : T.inkSoft,
        padding:
          "9px 2px 8px",
        display: "flex",
        flexDirection:
          "column",
        alignItems:
          "center",
        gap: 3,
        cursor:
          "pointer",
        fontSize: 10,
        fontWeight:
          active
            ? 700
            : 500,
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Stat({
  label,
  value,
  icon,
}) {
  return (
    <div
      style={{
        ...cardStyle,
        padding: 13,
      }}
    >
      <div
        style={{
          display:
            "flex",
          alignItems:
            "center",
          gap: 6,
          color:
            T.inkSoft,
          fontSize: 11,
        }}
      >
        {icon}
        {label}
      </div>

      <div
        style={{
          fontFamily:
            monoFont,
          fontWeight:
            700,
          fontSize: 18,
          marginTop: 5,
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* =========================
   PRODUCTS PAGE
========================= */

function ProductsPage({
  products,
  filteredProducts,
  categories,
  search,
  setSearch,
  category,
  setCategory,
  form,
  setForm,
  editing,
  save,
  edit,
  remove,
  reset,
  addToCart,
}) {
  const field = (
    key,
    label,
    type = "text",
    placeholder = ""
  ) => (
    <label
      style={{
        fontSize: 12,
        color:
          T.inkSoft,
      }}
    >
      {label}

      <input
        type={type}
        value={form[key]}
        onChange={(event) =>
          setForm({
            ...form,
            [key]:
              event.target
                .value,
          })
        }
        placeholder={
          placeholder
        }
        style={{
          ...inputStyle,
          marginTop: 5,
        }}
      />
    </label>
  );

  return (
    <div>
      <section
        style={cardStyle}
      >
        <div
          style={{
            display:
              "flex",
            justifyContent:
              "space-between",
            alignItems:
              "center",
          }}
        >
          <h2
            style={{
              fontFamily:
                displayFont,
              margin:
                "0 0 12px",
            }}
          >
            {editing
              ? "Edit Produk"
              : "Tambah Produk"}
          </h2>

          {editing && (
            <button
              onClick={reset}
              style={buttonStyle({
                background:
                  T.paper,
              })}
            >
              <X size={15} />
              Batal
            </button>
          )}
        </div>

        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(150px,1fr))",
            gap: 9,
          }}
        >
          {field(
            "name",
            "Nama *",
            "text",
            "Indomie Goreng"
          )}

          {field(
            "category",
            "Kategori",
            "text",
            "Makanan"
          )}

          {field(
            "sku",
            "SKU",
            "text",
            "SKU-001"
          )}

          {field(
            "barcode",
            "Barcode",
            "text",
            "899..."
          )}

          {field(
            "costPrice",
            "Harga beli",
            "number",
            "0"
          )}

          {field(
            "sellPrice",
            "Harga jual *",
            "number",
            "0"
          )}

          {field(
            "stock",
            "Stok *",
            "number",
            "0"
          )}

          {field(
            "minStock",
            "Stok minimum",
            "number",
            "0"
          )}

          <label
            style={{
              fontSize: 12,
              color:
                T.inkSoft,
            }}
          >
            Satuan

            <select
              value={
                form.unit
              }
              onChange={(event) =>
                setForm({
                  ...form,
                  unit:
                    event.target
                      .value,
                })
              }
              style={{
                ...inputStyle,
                marginTop: 5,
              }}
            >
              {[
                "pcs",
                "bungkus",
                "botol",
                "kotak",
                "kg",
                "gram",
                "liter",
                "pak",
                "renceng",
                "sachet",
                "dus",
                "kaleng",
                "buah",
              ].map(
                (unit) => (
                  <option
                    key={unit}
                  >
                    {unit}
                  </option>
                )
              )}
            </select>
          </label>

          {field(
            "aliases",
            "Alias",
            "text",
            "mie, indomie"
          )}
        </div>

        <button
          onClick={save}
          style={buttonStyle({
            marginTop: 12,
            background:
              T.ink,
            color:
              T.paper,
          })}
        >
          {editing ? (
            <Pencil size={16} />
          ) : (
            <Plus size={16} />
          )}

          {editing
            ? "Simpan Perubahan"
            : "Tambah Barang"}
        </button>
      </section>

      <section
        style={{
          ...cardStyle,
          marginTop: 16,
        }}
      >
        <div
          style={{
            display:
              "flex",
            gap: 8,
            marginBottom:
              10,
          }}
        >
          <div
            style={{
              position:
                "relative",
              flex: 1,
            }}
          >
            <Search
              size={16}
              style={{
                position:
                  "absolute",
                left: 10,
                top: 10,
                color:
                  T.inkSoft,
              }}
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target
                    .value
                )
              }
              placeholder="Cari nama / SKU / barcode"
              style={{
                ...inputStyle,
                paddingLeft:
                  32,
              }}
            />
          </div>

          <select
            value={
              category
            }
            onChange={(event) =>
              setCategory(
                event.target
                  .value
              )
            }
            style={{
              ...inputStyle,
              width: 140,
            }}
          >
            {categories.map(
              (item) => (
                <option
                  key={item}
                >
                  {item}
                </option>
              )
            )}
          </select>
        </div>

        <div
          style={{
            fontSize: 12,
            color:
              T.inkSoft,
            marginBottom: 8,
          }}
        >
          {
            filteredProducts.length
          }{" "}
          produk
        </div>

        <div
          style={{
            display:
              "grid",
            gap: 8,
          }}
        >
          {filteredProducts.map(
            (product) => {
              const isLowStock =
                Number(
                  product.stock
                ) <=
                Number(
                  product.minStock ||
                    0
                );

              return (
                <div
                  key={
                    product.id
                  }
                  style={{
                    border: `1px solid ${T.rule}`,
                    borderRadius: 10,
                    padding: 10,
                    background:
                      isLowStock
                        ? "#FFF4E6"
                        : T.white,
                  }}
                >
                  <div
                    style={{
                      display:
                        "flex",
                      justifyContent:
                        "space-between",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          fontWeight:
                            700,
                        }}
                      >
                        {
                          product.name
                        }
                      </div>

                      <div
                        style={{
                          fontSize: 11,
                          color:
                            T.inkSoft,
                        }}
                      >
                        {
                          product.category
                        }{" "}
                        •{" "}
                        {product.sku ||
                          "tanpa SKU"}

                        {product.barcode
                          ? ` • ${product.barcode}`
                          : ""}
                      </div>

                      <div
                        style={{
                          fontFamily:
                            monoFont,
                          fontSize: 12,
                          marginTop: 4,
                        }}
                      >
                        {rupiah(
                          product.sellPrice
                        )}{" "}
                        • stok{" "}
                        {
                          product.stock
                        }{" "}
                        {
                          product.unit
                        }
                      </div>

                      {isLowStock && (
                        <div
                          style={{
                            fontSize: 11,
                            color:
                              T.stampDark,
                            marginTop: 3,
                          }}
                        >
                          <AlertTriangle
                            size={
                              12
                            }
                            style={{
                              verticalAlign:
                                "middle",
                            }}
                          />{" "}
                          Stok menipis
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        display:
                          "flex",
                        gap: 5,
                        alignItems:
                          "flex-start",
                      }}
                    >
                      <button
                        onClick={() =>
                          addToCart(
                            product
                          )
                        }
                        style={buttonStyle({
                          padding: 7,
                          background:
                            T.ink,
                          color:
                            T.paper,
                        })}
                      >
                        <ShoppingBag
                          size={14}
                        />
                      </button>

                      <button
                        onClick={() =>
                          edit(
                            product
                          )
                        }
                        style={buttonStyle({
                          padding: 7,
                          background:
                            T.paper,
                        })}
                      >
                        <Pencil
                          size={14}
                        />
                      </button>

                      <button
                        onClick={() =>
                          remove(
                            product.id
                          )
                        }
                        style={buttonStyle({
                          padding: 7,
                          background:
                            "#F7E7E5",
                          color:
                            T.stamp,
                        })}
                      >
                        <Trash2
                          size={14}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              );
            }
          )}

          {!filteredProducts.length && (
            <div
              style={{
                padding: 20,
                textAlign:
                  "center",
                color:
                  T.inkSoft,
              }}
            >
              Produk tidak
              ditemukan.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* =========================
   PAYMENT MODAL
========================= */

function PaymentModal({
  total,
  paid,
  setPaid,
  method,
  setMethod,
  change,
  cancel,
  confirm,
}) {
  const isCash =
    method === "Tunai";

  const canConfirm =
    !isCash ||
    Number(paid || 0) >=
      Number(total || 0);

  return (
    <div
      style={{
        position:
          "fixed",
        inset: 0,
        background:
          "#0008",
        zIndex: 100,
        display: "grid",
        placeItems:
          "center",
        padding: 16,
      }}
    >
      <div
        className="rd-pop"
        style={{
          ...cardStyle,
          width:
            "min(440px,100%)",
          maxHeight:
            "90vh",
          overflowY:
            "auto",
        }}
      >
        <div
          style={{
            display:
              "flex",
            justifyContent:
              "space-between",
            alignItems:
              "center",
          }}
        >
          <h2
            style={{
              fontFamily:
                displayFont,
              margin: 0,
            }}
          >
            Pembayaran
          </h2>

          <button
            onClick={cancel}
            style={buttonStyle({
              padding: 7,
              background:
                T.paper,
            })}
          >
            <X size={17} />
          </button>
        </div>

        <div
          style={{
            display:
              "flex",
            justifyContent:
              "space-between",
            marginTop: 15,
            fontSize: 18,
            fontFamily:
              monoFont,
            fontWeight:
              700,
          }}
        >
          <span>Total</span>
          <span>
            {rupiah(total)}
          </span>
        </div>

        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "1fr 1fr",
            gap: 8,
            marginTop: 14,
          }}
        >
          {[
            "Tunai",
            "QRIS",
            "Transfer",
            "Debit/Kartu",
          ].map(
            (methodName) => (
              <button
                key={
                  methodName
                }
                onClick={() =>
                  setMethod(
                    methodName
                  )
                }
                style={buttonStyle({
                  background:
                    method ===
                    methodName
                      ? T.ink
                      : T.paper,
                  color:
                    method ===
                    methodName
                      ? T.paper
                      : T.ink,
                  border: `1px solid ${T.rule}`,
                })}
              >
                {methodName ===
                "Tunai" ? (
                  <Banknote
                    size={15}
                  />
                ) : (
                  <WalletCards
                    size={15}
                  />
                )}

                {
                  methodName
                }
              </button>
            )
          )}
        </div>

        <label
          style={{
            display:
              "block",
            marginTop: 14,
            fontSize: 12,
            color:
              T.inkSoft,
          }}
        >
          Uang pelanggan

          <input
            value={paid}
            onChange={(event) =>
              setPaid(
                event.target
                  .value.replace(
                    /[^\d]/g,
                    ""
                  )
              )
            }
            inputMode="numeric"
            placeholder={
              isCash
                ? "Contoh 50000"
                : "Opsional untuk non-tunai"
            }
            style={{
              ...inputStyle,
              marginTop: 5,
              fontSize: 18,
              fontFamily:
                monoFont,
            }}
          />
        </label>

        <div
          style={{
            display:
              "flex",
            justifyContent:
              "space-between",
            marginTop: 15,
            fontSize: 15,
          }}
        >
          <span>
            Kembalian
          </span>

          <strong
            style={{
              fontFamily:
                monoFont,
              fontSize: 20,
              color:
                !isCash ||
                Number(paid) >=
                  Number(total)
                  ? T.ink
                  : T.stamp,
            }}
          >
            {rupiah(
              isCash
                ? change
                : 0
            )}
          </strong>
        </div>

        <button
          disabled={!canConfirm}
          onClick={
            confirm
          }
          style={buttonStyle({
            width:
              "100%",
            marginTop: 16,
            background:
              canConfirm
                ? T.ink
                : T.rule,
            color:
              T.paper,
          })}
        >
          <Check size={17} />
          Konfirmasi Bayar
        </button>

        <button
          onClick={
            cancel
          }
          style={buttonStyle({
            width:
              "100%",
            marginTop: 8,
            background:
              T.paper,
          })}
        >
          Batal
        </button>
      </div>
    </div>
  );
}

/* =========================
   TRANSACTIONS
========================= */

function TransactionsPage({
  transactions,
  search,
  setSearch,
  select,
}) {
  return (
    <section
      style={cardStyle}
    >
      <h2
        style={{
          fontFamily:
            displayFont,
          margin:
            "0 0 12px",
        }}
      >
        Riwayat Transaksi
      </h2>

      <input
        value={search}
        onChange={(event) =>
          setSearch(
            event.target
              .value
          )
        }
        placeholder="Cari nomor, barang, metode..."
        style={{
          ...inputStyle,
          marginBottom: 10,
        }}
      />

      <div
        style={{
          display:
            "grid",
          gap: 8,
        }}
      >
        {transactions.map(
          (transaction) => (
            <button
              key={
                transaction.id
              }
              onClick={() =>
                select(
                  transaction
                )
              }
              style={{
                textAlign:
                  "left",
                background:
                  transaction.voided
                    ? "#F7E7E5"
                    : T.white,
                border: `1px solid ${T.rule}`,
                borderRadius: 10,
                padding: 11,
                cursor:
                  "pointer",
              }}
            >
              <div
                style={{
                  display:
                    "flex",
                  justifyContent:
                    "space-between",
                  gap: 8,
                }}
              >
                <b>
                  {
                    transaction.number
                  }
                </b>

                <b
                  style={{
                    fontFamily:
                      monoFont,
                  }}
                >
                  {rupiah(
                    transaction.total
                  )}
                </b>
              </div>

              <div
                style={{
                  fontSize: 11,
                  color:
                    T.inkSoft,
                  marginTop: 3,
                }}
              >
                {new Date(
                  transaction.createdAt
                ).toLocaleString(
                  "id-ID"
                )}{" "}
                •{" "}
                {
                  transaction.paymentMethod
                }{" "}
                •{" "}
                {
                  transaction
                    .items
                    ?.length || 0
                }{" "}
                item

                {transaction.voided
                  ? " • DIBATALKAN"
                  : ""}
              </div>
            </button>
          )
        )}

        {!transactions.length && (
          <div
            style={{
              textAlign:
                "center",
              padding: 20,
              color:
                T.inkSoft,
            }}
          >
            Belum ada
            transaksi.
          </div>
        )}
      </div>
    </section>
  );
}

/* =========================
   TRANSACTION MODAL
========================= */

function TransactionModal({
  transaction,
  close,
  voidTransaction,
  print,
}) {
  return (
    <div
      style={{
        position:
          "fixed",
        inset: 0,
        background:
          "#0008",
        zIndex: 100,
        display: "grid",
        placeItems:
          "center",
        padding: 16,
      }}
    >
      <div
        className="rd-pop"
        style={{
          ...cardStyle,
          width:
            "min(500px,100%)",
          maxHeight:
            "90vh",
          overflowY:
            "auto",
        }}
      >
        <div
          style={{
            display:
              "flex",
            justifyContent:
              "space-between",
            alignItems:
              "center",
          }}
        >
          <div>
            <h2
              style={{
                fontFamily:
                  displayFont,
                margin: 0,
              }}
            >
              {
                transaction.number
              }
            </h2>

            <div
              style={{
                fontSize: 11,
                color:
                  T.inkSoft,
              }}
            >
              {new Date(
                transaction.createdAt
              ).toLocaleString(
                "id-ID"
              )}
            </div>
          </div>

          <button
            onClick={close}
            style={buttonStyle({
              padding: 7,
              background:
                T.paper,
            })}
          >
            <X size={17} />
          </button>
        </div>

        <div
          style={{
            marginTop: 12,
          }}
        >
          {(
            transaction.items ||
            []
          ).map(
            (item, index) => (
              <div
                key={index}
                style={{
                  display:
                    "flex",
                  justifyContent:
                    "space-between",
                  padding:
                    "7px 0",
                  borderBottom:
                    `1px dashed ${T.rule}`,
                }}
              >
                <span>
                  {
                    item.name
                  }{" "}
                  ×{" "}
                  {item.qty}
                </span>

                <b
                  style={{
                    fontFamily:
                      monoFont,
                  }}
                >
                  {rupiah(
                    Number(
                      item.price
                    ) *
                      Number(
                        item.qty
                      )
                  )}
                </b>
              </div>
            )
          )}
        </div>

        <div
          style={{
            marginTop: 12,
            display:
              "grid",
            gap: 5,
            fontSize: 13,
          }}
        >
          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
            }}
          >
            <span>
              Total
            </span>
            <b>
              {rupiah(
                transaction.total
              )}
            </b>
          </div>

          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
            }}
          >
            <span>
              Dibayar
            </span>
            <span>
              {rupiah(
                transaction.paid
              )}
            </span>
          </div>

          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
            }}
          >
            <span>
              Kembalian
            </span>
            <span>
              {rupiah(
                transaction.change
              )}
            </span>
          </div>

          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
            }}
          >
            <span>
              Metode
            </span>
            <span>
              {
                transaction.paymentMethod
              }
            </span>
          </div>
        </div>

        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "1fr 1fr",
            gap: 8,
            marginTop: 15,
          }}
        >
          <button
            onClick={() =>
              print(
                transaction
              )
            }
            style={buttonStyle({
              background:
                T.ink,
              color:
                T.paper,
            })}
          >
            <Printer
              size={16}
            />
            Cetak Struk
          </button>

          {!transaction.voided && (
            <button
              onClick={() =>
                voidTransaction(
                  transaction
                )
              }
              style={buttonStyle({
                background:
                  "#F7E7E5",
                color:
                  T.stamp,
              })}
            >
              <RotateCcw
                size={16}
              />
              Batalkan
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================
   DASHBOARD
========================= */

function DashboardPage({
  todayRevenue,
  todayProfit,
  todayCount,
  monthRevenue,
  topProducts,
  lowStock,
}) {
  return (
    <div>
      <section
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(180px,1fr))",
          gap: 10,
        }}
      >
        <Stat
          label="Omzet Hari Ini"
          value={rupiah(
            todayRevenue
          )}
          icon={
            <WalletCards
              size={17}
            />
          }
        />

        <Stat
          label="Laba Hari Ini"
          value={rupiah(
            todayProfit
          )}
          icon={
            <BarChart3
              size={17}
            />
          }
        />

        <Stat
          label="Transaksi Hari Ini"
          value={
            todayCount
          }
          icon={
            <History
              size={17}
            />
          }
        />

        <Stat
          label="Omzet Bulan Ini"
          value={rupiah(
            monthRevenue
          )}
          icon={
            <Banknote
              size={17}
            />
          }
        />
      </section>

      <section
        style={{
          ...cardStyle,
          marginTop: 16,
        }}
      >
        <h3
          style={{
            marginTop: 0,
          }}
        >
          Produk Terlaris
        </h3>

        {topProducts.length ? (
          topProducts.map(
            (
              [name, quantity],
              index
            ) => (
              <div
                key={name}
                style={{
                  display:
                    "flex",
                  justifyContent:
                    "space-between",
                  padding:
                    "8px 0",
                  borderBottom:
                    `1px dashed ${T.rule}`,
                }}
              >
                <span>
                  {index + 1}.{" "}
                  {name}
                </span>

                <b>
                  {quantity}{" "}
                  terjual
                </b>
              </div>
            )
          )
        ) : (
          <div
            style={{
              color:
                T.inkSoft,
            }}
          >
            Belum ada data.
          </div>
        )}
      </section>

      <section
        style={{
          ...cardStyle,
          marginTop: 16,
        }}
      >
        <h3
          style={{
            marginTop: 0,
          }}
        >
          Stok Menipis
        </h3>

        {lowStock.length ? (
          lowStock.map(
            (product) => (
              <div
                key={
                  product.id
                }
                style={{
                  display:
                    "flex",
                  justifyContent:
                    "space-between",
                  padding:
                    "8px 0",
                  borderBottom:
                    `1px dashed ${T.rule}`,
                }}
              >
                <span>
                  {
                    product.name
                  }
                </span>

                <b
                  style={{
                    color:
                      T.stampDark,
                  }}
                >
                  {
                    product.stock
                  }{" "}
                  {
                    product.unit
                  }
                </b>
              </div>
            )
          )
        ) : (
          <div
            style={{
              color:
                T.inkSoft,
            }}
          >
            Semua stok aman.
          </div>
        )}
      </section>
    </div>
  );
}

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";

import {
  Mic,
  MicOff,
  Plus,
  Trash2,
  X,
  ShoppingBag,
  Check,
  ChevronDown,
  ChevronUp,
  Store,
  Keyboard,
  Send,
} from "lucide-react";

// ============================================================
// THEME
// ============================================================

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
};

const displayFont =
  "'Georgia', 'Times New Roman', serif";

const monoFont =
  "'Courier New', Courier, monospace";

const bodyFont =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// ============================================================
// HELPERS
// ============================================================

const rupiah = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(Number(n) || 0);

const todayKey = () => {
  const d = new Date();

  return `${d.getFullYear()}-${String(
    d.getMonth() + 1
  ).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
};

const todayLabel = () =>
  new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

// ============================================================
// INDEXED DB
// ============================================================

const DB_NAME = "rd-kasir-db";
const DB_VERSION = 1;
const STORE_NAME = "products";

function openProductDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(
        new Error("IndexedDB tidak tersedia")
      );
      return;
    }

    const request = indexedDB.open(
      DB_NAME,
      DB_VERSION
    );

    request.onupgradeneeded = () => {
      const db = request.result;

      if (
        !db.objectStoreNames.contains(
          STORE_NAME
        )
      ) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
        });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function loadProductsDB() {
  const db = await openProductDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      STORE_NAME,
      "readonly"
    );

    const store =
      tx.objectStore(STORE_NAME);

    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function saveProductsDB(products) {
  const db = await openProductDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      STORE_NAME,
      "readwrite"
    );

    const store =
      tx.objectStore(STORE_NAME);

    const clearRequest = store.clear();

    clearRequest.onsuccess = () => {
      for (const product of products) {
        store.put(product);
      }
    };

    clearRequest.onerror = () => {
      reject(clearRequest.error);
    };

    tx.oncomplete = () => {
      resolve();
    };

    tx.onerror = () => {
      reject(tx.error);
    };
  });
}

// ============================================================
// VOICE PARSER
// ============================================================

const ANGKA = {
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
};

const UNIT_WORDS = [
  "bungkus",
  "botol",
  "kilo",
  "kg",
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
];

function extractQty(segment) {
  const words = segment
    .trim()
    .split(/\s+/);

  const first = (
    words[0] || ""
  ).toLowerCase();

  if (/^\d+$/.test(first)) {
    return {
      qty: parseInt(first, 10),
      rest: words
        .slice(1)
        .join(" "),
    };
  }

  if (ANGKA[first] !== undefined) {
    return {
      qty: ANGKA[first],
      rest: words
        .slice(1)
        .join(" "),
    };
  }

  return {
    qty: 1,
    rest: segment.trim(),
  };
}

function stripUnits(text) {
  return text
    .split(/\s+/)
    .filter(
      (w) =>
        !UNIT_WORDS.includes(
          w.toLowerCase()
        )
    )
    .join(" ")
    .trim();
}

function matchProduct(text, products) {
  const clean = stripUnits(text)
    .toLowerCase()
    .trim();

  if (!clean) return null;

  let best = null;
  let bestScore = 0;

  for (const p of products) {
    const name = String(
      p.name || ""
    ).toLowerCase();

    let score = 0;

    if (
      clean.includes(name) ||
      name.includes(clean)
    ) {
      score = Math.min(
        name.length,
        clean.length
      );
    } else {
      const nameWords =
        name.split(/\s+/);

      const cleanWords =
        clean.split(/\s+/);

      const overlap =
        nameWords.filter((w) =>
          cleanWords.includes(w)
        ).length;

      if (overlap > 0) {
        score = overlap * 3;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  return bestScore > 0
    ? best
    : null;
}

function parseTranscript(
  transcript,
  products
) {
  const parts = transcript
    .toLowerCase()
    .split(
      /\s*,\s*|\s+dan\s+|\s+sama\s+|\s+plus\s+/i
    )
    .map((s) => s.trim())
    .filter(Boolean);

  const matched = [];
  const unmatched = [];

  for (const part of parts) {
    const {
      qty,
      rest,
    } = extractQty(part);

    const product =
      matchProduct(
        rest,
        products
      );

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

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function KasirSuara() {
  // PRODUCTS
  const [products, setProducts] =
    useState([]);

  // CART
  const [cart, setCart] =
    useState([]);

  // DAILY
  const [dayTotal, setDayTotal] =
    useState(0);

  const [dayTx, setDayTx] =
    useState([]);

  // VOICE
  const [listening, setListening] =
    useState(false);

  const [liveText, setLiveText] =
    useState("");

  const [
    lastUnmatched,
    setLastUnmatched,
  ] = useState([]);

  const [
    supportsVoice,
    setSupportsVoice,
  ] = useState(true);

  const recognitionRef =
    useRef(null);

  const productsRef =
    useRef(products);

  // UI
  const [showProducts, setShowProducts] =
    useState(false);

  const [showHistory, setShowHistory] =
    useState(false);

  const [showPayment, setShowPayment] =
    useState(false);

  const [flash, setFlash] =
    useState(null);

  const [loaded, setLoaded] =
    useState(false);

  // INPUT
  const [typedText, setTypedText] =
    useState("");

  // PRODUCT FORM
  const [newName, setNewName] =
    useState("");

  const [
    newCategory,
    setNewCategory,
  ] = useState("");

  const [
    newCostPrice,
    setNewCostPrice,
  ] = useState("");

  const [
    newSellPrice,
    setNewSellPrice,
  ] = useState("");

  const [newStock, setNewStock] =
    useState("");

  const [newUnit, setNewUnit] =
    useState("pcs");

  // PAYMENT
  const [
    paymentAmount,
    setPaymentAmount,
  ] = useState("");

  // ==========================================================
  // KEEP PRODUCTS REF UPDATED
  // ==========================================================

  useEffect(() => {
    productsRef.current =
      products;
  }, [products]);

  // ==========================================================
  // LOAD DATA
  // ==========================================================

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      // PRODUCTS
      try {
        const savedProducts =
          await loadProductsDB();

        if (mounted) {
          setProducts(
            savedProducts
          );
        }
      } catch (e) {
        console.error(
          "IndexedDB gagal:",
          e
        );

        // FALLBACK
        try {
          const saved =
            localStorage.getItem(
              "products"
            );

          if (saved && mounted) {
            setProducts(
              JSON.parse(saved)
            );
          }
        } catch (err) {
          console.error(
            "Fallback produk gagal:",
            err
          );
        }
      }

      // DAILY TRANSACTIONS
      try {
        const savedDay =
          localStorage.getItem(
            `day:${todayKey()}`
          );

        if (
          savedDay &&
          mounted
        ) {
          const parsed =
            JSON.parse(savedDay);

          setDayTotal(
            Number(parsed.total) ||
              0
          );

          setDayTx(
            parsed.transactions ||
              []
          );
        }
      } catch (e) {
        console.error(
          "Gagal memuat transaksi:",
          e
        );
      }

      if (mounted) {
        setLoaded(true);
      }
    };

    loadData();

    // SPEECH RECOGNITION
    const SR =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SR) {
      setSupportsVoice(false);

      return () => {
        mounted = false;
      };
    }

    const rec = new SR();

    rec.lang = "id-ID";
    rec.continuous = false;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let text = "";

      for (
        let i = 0;
        i < e.results.length;
        i++
      ) {
        text +=
          e.results[i][0]
            .transcript;
      }

      setLiveText(text);

      if (
        e.results[
          e.results.length - 1
        ].isFinal
      ) {
        handleFinalTranscript(
          text
        );
      }
    };

    rec.onend = () => {
      setListening(false);
    };

    rec.onerror = () => {
      setListening(false);
    };

    recognitionRef.current =
      rec;

    return () => {
      mounted = false;

      try {
        rec.stop();
      } catch (e) {}
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==========================================================
  // SAVE PRODUCTS
  // ==========================================================

  const saveProducts =
    async (list) => {
      setProducts(list);

      try {
        await saveProductsDB(
          list
        );
      } catch (e) {
        console.error(
          "Gagal menyimpan IndexedDB:",
          e
        );

        // FALLBACK
        try {
          localStorage.setItem(
            "products",
            JSON.stringify(list)
          );
        } catch (err) {
          console.error(
            "Fallback penyimpanan gagal:",
            err
          );
        }
      }
    };

  // ==========================================================
  // PROCESS VOICE / TEXT
  // ==========================================================

  const handleFinalTranscript =
    useCallback(
      (text) => {
        const {
          matched,
          unmatched,
        } = parseTranscript(
          text,
          productsRef.current
        );

        if (matched.length) {
          setCart((prev) => {
            const next = [...prev];

            for (const m of matched) {
              const idx =
                next.findIndex(
                  (c) =>
                    c.productId ===
                    m.product.id
                );

              if (idx >= 0) {
                next[idx] = {
                  ...next[idx],
                  qty:
                    next[idx].qty +
                    m.qty,
                };
              } else {
                next.push({
                  productId:
                    m.product.id,
                  name:
                    m.product.name,
                  price:
                    Number(
                      m.product
                        .sellPrice ||
                        m.product
                          .price ||
                        0
                    ),
                  qty: m.qty,
                });
              }
            }

            return next;
          });
        }

        setLastUnmatched(
          unmatched
        );

        setLiveText("");
      },
      []
    );

  // ==========================================================
  // VOICE BUTTON
  // ==========================================================

  const toggleListen = () => {
    if (!recognitionRef.current)
      return;

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
    } catch (e) {
      console.error(e);
    }
  };

  // ==========================================================
  // TYPED INPUT
  // ==========================================================

  const submitTyped = () => {
    if (!typedText.trim())
      return;

    handleFinalTranscript(
      typedText
    );

    setTypedText("");
  };

  // ==========================================================
  // ADD PRODUCT
  // ==========================================================

  const addProduct = async () => {
    const costPrice =
      parseInt(
        newCostPrice.replace(
          /[^\d]/g,
          ""
        ),
        10
      ) || 0;

    const sellPrice =
      parseInt(
        newSellPrice.replace(
          /[^\d]/g,
          ""
        ),
        10
      ) || 0;

    const stock =
      parseInt(
        newStock,
        10
      );

    if (
      !newName.trim() ||
      sellPrice <= 0 ||
      Number.isNaN(stock) ||
      stock < 0
    ) {
      alert(
        "Lengkapi nama, harga jual, dan stok dengan benar."
      );
      return;
    }

    const product = {
      id: Date.now().toString(),
      name: newName.trim(),
      category:
        newCategory.trim() ||
        "Umum",
      costPrice,
      sellPrice,
      price: sellPrice,
      stock,
      unit:
        newUnit || "pcs",
    };

    const list = [
      ...products,
      product,
    ];

    await saveProducts(list);

    setNewName("");
    setNewCategory("");
    setNewCostPrice("");
    setNewSellPrice("");
    setNewStock("");
    setNewUnit("pcs");
  };

  // ==========================================================
  // REMOVE PRODUCT
  // ==========================================================

  const removeProduct =
    async (id) => {
      const product =
        products.find(
          (p) => p.id === id
        );

      if (!product) return;

      const confirmed =
        window.confirm(
          `Hapus barang "${product.name}"?`
        );

      if (!confirmed)
        return;

      const list =
        products.filter(
          (p) => p.id !== id
        );

      await saveProducts(list);

      // Bersihkan dari keranjang
      setCart((prev) =>
        prev.filter(
          (c) =>
            c.productId !== id
        )
      );
    };

  // ==========================================================
  // CART
  // ==========================================================

  const removeFromCart =
    (productId) => {
      setCart((prev) =>
        prev.filter(
          (c) =>
            c.productId !==
            productId
        )
      );
    };

  const changeQty = (
    productId,
    delta
  ) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (
            c.productId !==
            productId
          ) {
            return c;
          }

          const product =
            products.find(
              (p) =>
                p.id ===
                productId
            );

          const maxStock =
            Number(
              product?.stock
            ) || 0;

          const newQty =
            Math.max(
              0,
              c.qty + delta
            );

          if (
            newQty > maxStock
          ) {
            return {
              ...c,
              qty: maxStock,
            };
          }

          return {
            ...c,
            qty: newQty,
          };
        })
        .filter(
          (c) => c.qty > 0
        )
    );
  };

  const cartTotal =
    cart.reduce(
      (sum, c) =>
        sum +
        Number(c.price || 0) *
          Number(c.qty || 0),
      0
    );

  // ==========================================================
  // PAYMENT
  // ==========================================================

  const paidAmount =
    Number(paymentAmount) ||
    0;

  const changeAmount =
    Math.max(
      0,
      paidAmount -
        cartTotal
    );

  const canPay =
    cart.length > 0 &&
    cartTotal > 0 &&
    paidAmount >=
      cartTotal;

  // ==========================================================
  // FINISH TRANSACTION
  // ==========================================================

  const finishTransaction =
    async () => {
      if (!cart.length)
        return false;

      // CHECK STOCK
      for (const item of cart) {
        const product =
          products.find(
            (p) =>
              p.id ===
              item.productId
          );

        if (!product) {
          alert(
            `Barang "${item.name}" tidak ditemukan.`
          );

          return false;
        }

        const currentStock =
          Number(
            product.stock
          ) || 0;

        if (
          item.qty >
          currentStock
        ) {
          alert(
            `Stok "${product.name}" tidak cukup.\n\n` +
              `Tersedia: ${currentStock} ${
                product.unit ||
                "pcs"
              }\n` +
              `Diminta: ${item.qty}`
          );

          return false;
        }
      }

      // UPDATE STOCK
      const updatedProducts =
        products.map(
          (product) => {
            const item =
              cart.find(
                (c) =>
                  c.productId ===
                  product.id
              );

            if (!item) {
              return product;
            }

            return {
              ...product,
              stock: Math.max(
                0,
                (Number(
                  product.stock
                ) || 0) -
                  item.qty
              ),
            };
          }
        );

      // SAVE STOCK
      try {
        await saveProductsDB(
          updatedProducts
        );

        setProducts(
          updatedProducts
        );
      } catch (e) {
        console.error(e);

        alert(
          "Gagal menyimpan perubahan stok. Transaksi dibatalkan."
        );

        return false;
      }

      // TRANSACTION
      const tx = {
        time:
          new Date().toLocaleTimeString(
            "id-ID",
            {
              hour: "2-digit",
              minute:
                "2-digit",
            }
          ),

        total: cartTotal,

        items: cart,

        payment:
          paidAmount,

        change:
          changeAmount,
      };

      const newTotal =
        dayTotal +
        cartTotal;

      const newTx = [
        tx,
        ...dayTx,
      ];

      setDayTotal(
        newTotal
      );

      setDayTx(newTx);

      setCart([]);

      setShowPayment(false);

      setPaymentAmount("");

      setFlash(cartTotal);

      setTimeout(() => {
        setFlash(null);
      }, 1800);

      // SAVE DAILY DATA
      try {
        localStorage.setItem(
          `day:${todayKey()}`,
          JSON.stringify({
        

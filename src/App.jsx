import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Plus, Trash2, X, ShoppingBag, Check, ChevronDown, ChevronUp, Store, Keyboard, Send } from "lucide-react";

// ---------- palette / tokens ----------
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

const displayFont = "'Georgia', 'Times New Roman', serif";
const monoFont = "'Courier New', Courier, monospace";
const bodyFont = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const rupiah = (n) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n || 0);

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const todayLabel = () =>
  new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

// ---------- indonesian voice parsing ----------
const ANGKA = {
  satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9,
  sepuluh: 10, sebelas: 11,
};
const UNIT_WORDS = ["bungkus", "botol", "kilo", "kg", "kotak", "pcs", "buah", "ekor", "lembar", "pak", "renceng", "sachet", "liter", "gram", "biji"];

function extractQty(segment) {
  const words = segment.trim().split(/\s+/);
  const first = (words[0] || "").toLowerCase();
  if (/^\d+$/.test(first)) {
    return { qty: parseInt(first, 10), rest: words.slice(1).join(" ") };
  }
  if (ANGKA[first] !== undefined) {
    return { qty: ANGKA[first], rest: words.slice(1).join(" ") };
  }
  if (first.startsWith("se") && first.length > 2) {
    const stem = first.slice(2);
    if (UNIT_WORDS.includes(stem) || stem.length <= 8) {
      return { qty: 1, rest: [stem, ...words.slice(1)].join(" ") };
    }
  }
  return { qty: 1, rest: segment.trim() };
}

function stripUnits(text) {
  return text
    .split(/\s+/)
    .filter((w) => !UNIT_WORDS.includes(w.toLowerCase()))
    .join(" ")
    .trim();
}

function matchProduct(text, products) {
  const clean = stripUnits(text).toLowerCase().trim();
  if (!clean) return null;
  let best = null;
  let bestScore = 0;
  for (const p of products) {
    const name = p.name.toLowerCase();
    let score = 0;
    if (clean.includes(name) || name.includes(clean)) {
      score = Math.min(name.length, clean.length);
    } else {
      const nameWords = name.split(/\s+/);
      const cleanWords = clean.split(/\s+/);
      const overlap = nameWords.filter((w) => cleanWords.includes(w)).length;
      if (overlap > 0) score = overlap * 3;
    }
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return bestScore > 0 ? best : null;
}

function parseTranscript(transcript, products) {
  const parts = transcript
    .toLowerCase()
    .split(/\s*,\s*|\s+dan\s+|\s+sama\s+|\s+plus\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const matched = [];
  const unmatched = [];

  for (const part of parts) {
    const { qty, rest } = extractQty(part);
    const product = matchProduct(rest, products);
    if (product) {
      matched.push({ product, qty });
    } else if (rest) {
      unmatched.push(part);
    }
  }
  return { matched, unmatched };
}

// ---------- main component ----------
export default function KasirSuara() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [dayTotal, setDayTotal] = useState(0);
  const [dayTx, setDayTx] = useState([]);
  const [listening, setListening] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [lastUnmatched, setLastUnmatched] = useState([]);
  const [flash, setFlash] = useState(null);
  const [showProducts, setShowProducts] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [supportsVoice, setSupportsVoice] = useState(true);
  const [typedText, setTypedText] = useState("");
  const recognitionRef = useRef(null);

  // load persisted data
  useEffect(() => {
    (async () => {
      try {
        const p = Promise.resolve({ value: localStorage.getItem("products") });
        if (p) setProducts(JSON.parse(p.value));
      } catch (e) {}
      try {
        const d = Promise.resolve({ value: localStorage.getItem(`day:${todayKey()}`) });
        if (d) {
          const parsed = JSON.parse(d.value);
          setDayTotal(parsed.total || 0);
          setDayTx(parsed.transactions || []);
        }
      } catch (e) {}
      setLoaded(true);
    })();

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setSupportsVoice(false);
      return;
    }
    const rec = new SR();
    rec.lang = "id-ID";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setLiveText(text);
      if (e.results[e.results.length - 1].isFinal) {
        handleFinalTranscript(text);
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const productsRef = useRef(products);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const handleFinalTranscript = useCallback((text) => {
    const { matched, unmatched } = parseTranscript(text, productsRef.current);
    if (matched.length) {
      setCart((prev) => {
        const next = [...prev];
        for (const m of matched) {
          const idx = next.findIndex((c) => c.productId === m.product.id);
          if (idx >= 0) next[idx] = { ...next[idx], qty: next[idx].qty + m.qty };
          else next.push({ productId: m.product.id, name: m.product.name, price: m.product.price, qty: m.qty });
        }
        return next;
      });
    }
    setLastUnmatched(unmatched);
    setLiveText("");
  }, []);

  const toggleListen = () => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      setLastUnmatched([]);
      setLiveText("");
      try {
        recognitionRef.current.start();
        setListening(true);
      } catch (e) {}
    }
  };

  const submitTyped = () => {
    if (!typedText.trim()) return;
    handleFinalTranscript(typedText);
    setTypedText("");
  };

  const saveProducts = async (list) => {
    setProducts(list);
    try {
      localStorage.setItem("products", JSON.stringify(list));
    } catch (e) {}
  };

  const addProduct = () => {
    const price = parseInt(newPrice.replace(/[^\d]/g, ""), 10);
    if (!newName.trim() || !price) return;
    const list = [...products, { id: Date.now().toString(), name: newName.trim(), price }];
    saveProducts(list);
    setNewName("");
    setNewPrice("");
  };

  const removeProduct = (id) => {
    saveProducts(products.filter((p) => p.id !== id));
  };

  const removeFromCart = (productId) => {
    setCart((prev) => prev.filter((c) => c.productId !== productId));
  };

  const changeQty = (productId, delta) => {
    setCart((prev) =>
      prev
        .map((c) => (c.productId === productId ? { ...c, qty: Math.max(0, c.qty + delta) } : c))
        .filter((c) => c.qty > 0)
    );
  };

  const cartTotal = cart.reduce((s, c) => s + c.price * c.qty, 0);

  const finishTransaction = async () => {
    if (!cart.length) return;
    const tx = { time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }), total: cartTotal, items: cart };
    const newTotal = dayTotal + cartTotal;
    const newTx = [tx, ...dayTx];
    setDayTotal(newTotal);
    setDayTx(newTx);
    setCart([]);
    setFlash(cartTotal);
    setTimeout(() => setFlash(null), 1800);
    try {
      localStorage.setItem(`day:${todayKey()}`, JSON.stringify({ total: newTotal, transactions: newTx }));
    } catch (e) {}
  };

  return (
    <div style={{ background: T.paper, minHeight: "100vh", fontFamily: bodyFont, color: T.ink }}>
      <style>{`
        @keyframes pulseRing { 0% { box-shadow: 0 0 0 0 rgba(178,58,46,0.45);} 70% { box-shadow: 0 0 0 22px rgba(178,58,46,0);} 100% { box-shadow: 0 0 0 0 rgba(178,58,46,0);} }
        @keyframes popIn { from { opacity:0; transform: scale(0.85) rotate(-8deg);} to { opacity:1; transform: scale(1) rotate(-6deg);} }
        .stamp-anim { animation: popIn 0.35s ease-out; }
        .mic-listening { animation: pulseRing 1.4s infinite; }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px 100px" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: T.ink, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Store size={20} color={T.paper} />
          </div>
          <div>
            <div style={{ fontFamily: displayFont, fontWeight: 700, fontSize: 21, letterSpacing: 0.2 }}>RD Kasir</div>
            <div style={{ fontSize: 12, color: T.inkSoft, fontFamily: monoFont }}>{todayLabel()}</div>
          </div>
        </div>

        {/* today summary — stamp style */}
        <div
          style={{
            background: T.card,
            border: `1px solid ${T.rule}`,
            borderRadius: 14,
            padding: "18px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: T.inkSoft, fontFamily: monoFont }}>
              Omset Hari Ini
            </div>
            <div style={{ fontFamily: monoFont, fontWeight: 700, fontSize: 26, color: T.ink, marginTop: 2 }}>
              {rupiah(dayTotal)}
            </div>
            <button
              onClick={() => setShowHistory((s) => !s)}
              style={{ background: "none", border: "none", padding: 0, marginTop: 4, fontSize: 12, color: T.brass, fontFamily: bodyFont, display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}
            >
              {dayTx.length} transaksi {showHistory ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
          <div
            style={{
              width: 62,
              height: 62,
              borderRadius: "50%",
              border: `2.5px dashed ${T.stamp}`,
              color: T.stamp,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: "rotate(-6deg)",
              flexShrink: 0,
              fontFamily: displayFont,
              fontWeight: 700,
              fontSize: 10,
              textAlign: "center",
              lineHeight: 1.1,
            }}
          >
            LUNAS<br />TOKO
          </div>
        </div>

        {showHistory && (
          <div style={{ background: T.card, border: `1px solid ${T.rule}`, borderRadius: 12, padding: 12, marginBottom: 16, maxHeight: 220, overflowY: "auto" }}>
            {dayTx.length === 0 && <div style={{ fontSize: 13, color: T.inkSoft }}>Belum ada transaksi hari ini.</div>}
            {dayTx.map((tx, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < dayTx.length - 1 ? `1px dashed ${T.rule}` : "none", fontSize: 13 }}>
                <span style={{ fontFamily: monoFont, color: T.inkSoft }}>{tx.time}</span>
                <span style={{ color: T.inkSoft }}>{tx.items.length} item</span>
                <span style={{ fontFamily: monoFont, fontWeight: 700 }}>{rupiah(tx.total)}</span>
              </div>
            ))}
          </div>
        )}

        {/* mic button */}
        {!supportsVoice && (
          <div style={{ background: "#F7E7E5", border: `1px solid ${T.stamp}`, color: T.stampDark, borderRadius: 10, padding: 12, fontSize: 12.5, marginBottom: 16 }}>
            Browser ini belum mendukung input suara. Coba buka di Chrome versi terbaru.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "22px 0 18px" }}>
          <button
            onClick={toggleListen}
            disabled={!supportsVoice}
            className={listening ? "mic-listening" : ""}
            style={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              border: "none",
              background: listening ? T.stamp : T.ink,
              color: T.paper,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: supportsVoice ? "pointer" : "not-allowed",
              opacity: supportsVoice ? 1 : 0.5,
              boxShadow: "0 6px 18px rgba(30,42,34,0.25)",
            }}
          >
            {listening ? <MicOff size={34} /> : <Mic size={34} />}
          </button>
          <div style={{ marginTop: 10, fontSize: 13, color: T.inkSoft, fontFamily: bodyFont, textAlign: "center", minHeight: 18 }}>
            {listening ? (liveText || "Mendengarkan...") : "Tekan lalu sebutkan barang, atau ketik di bawah"}
          </div>
          {lastUnmatched.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: T.stampDark, textAlign: "center" }}>
              Tidak dikenali: {lastUnmatched.join(", ")}
            </div>
          )}
        </div>

        {/* typed input — alternative for users who can't speak */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0 0 16px" }}>
          <div style={{ flexShrink: 0, color: T.inkSoft }}>
            <Keyboard size={16} />
          </div>
          <input
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitTyped();
            }}
            placeholder='Atau ketik di sini, mis. "dua indomie sama satu aqua"'
            style={{ ...inputStyle, fontSize: 13.5 }}
          />
          <button
            onClick={submitTyped}
            style={{
              background: T.ink,
              border: "none",
              borderRadius: 8,
              width: 38,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Send size={15} color={T.paper} />
          </button>
        </div>

        {/* current cart */}
        <div
          style={{
            background: T.card,
            border: `1px solid ${T.rule}`,
            borderRadius: 14,
            padding: "14px 16px",
            marginBottom: 16,
            backgroundImage: `repeating-linear-gradient(${T.card}, ${T.card} 33px, ${T.rule}55 34px)`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <ShoppingBag size={15} color={T.brass} />
            <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: T.inkSoft, fontFamily: monoFont }}>
              Transaksi Berjalan
            </span>
          </div>
          {cart.length === 0 ? (
            <div style={{ fontSize: 13, color: T.inkSoft, padding: "10px 0" }}>Belum ada barang. Coba bicara dulu.</div>
          ) : (
            cart.map((c) => (
              <div key={c.productId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                  <div style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: monoFont }}>
                    {c.qty} x {rupiah(c.price)}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => changeQty(c.productId, -1)} style={qtyBtnStyle}>−</button>
                  <span style={{ fontFamily: monoFont, fontSize: 13, width: 18, textAlign: "center" }}>{c.qty}</span>
                  <button onClick={() => changeQty(c.productId, 1)} style={qtyBtnStyle}>+</button>
                  <button onClick={() => removeFromCart(c.productId)} style={{ ...qtyBtnStyle, color: T.stamp, marginLeft: 4 }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
          {cart.length > 0 && (
            <>
              <div style={{ borderTop: `1px dashed ${T.rule}`, margin: "10px 0 8px" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Total</span>
                <span style={{ fontFamily: monoFont, fontWeight: 700, fontSize: 19 }}>{rupiah(cartTotal)}</span>
              </div>
              <button
                onClick={finishTransaction}
                style={{
                  width: "100%",
                  marginTop: 12,
                  background: T.ink,
                  color: T.paper,
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 0",
                  fontSize: 14,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  cursor: "pointer",
                }}
              >
                <Check size={16} /> Selesai Transaksi
              </button>
            </>
          )}
        </div>

        {/* product management */}
        <div style={{ background: T.card, border: `1px solid ${T.rule}`, borderRadius: 14, padding: "14px 16px" }}>
          <button
            onClick={() => setShowProducts((s) => !s)}
            style={{ background: "none", border: "none", width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: 0, cursor: "pointer" }}
          >
            <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: T.inkSoft, fontFamily: monoFont }}>
              Daftar Barang & Harga ({products.length})
            </span>
            {showProducts ? <ChevronUp size={15} color={T.inkSoft} /> : <ChevronDown size={15} color={T.inkSoft} />}
          </button>

          {showProducts && (
            <div style={{ marginTop: 12 }}>
              {products.length === 0 && loaded && (
                <div style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 10 }}>
                  Tambahkan barang dulu supaya AI bisa mengenali ucapanmu.
                </div>
              )}
              {products.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${T.rule}55` }}>
                  <span style={{ fontSize: 13.5 }}>{p.name}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: monoFont, fontSize: 13 }}>{rupiah(p.price)}</span>
                    <button onClick={() => removeProduct(p.id)} style={{ ...qtyBtnStyle, color: T.stamp }}>
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}

              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nama barang"
                  style={inputStyle}
                />
                <input
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="Harga"
                  inputMode="numeric"
                  style={{ ...inputStyle, width: 90, flex: "none" }}
                />
                <button onClick={addProduct} style={{ background: T.brass, border: "none", borderRadius: 8, width: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <Plus size={17} color="#fff" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {flash !== null && (
        <div
          className="stamp-anim"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%) rotate(-6deg)",
            background: T.stamp,
            color: "#fff",
            padding: "12px 22px",
            borderRadius: 10,
            fontFamily: displayFont,
            fontWeight: 700,
            fontSize: 15,
            boxShadow: "0 8px 20px rgba(140,44,34,0.35)",
            border: "2px dashed rgba(255,255,255,0.6)",
          }}
        >
          Transaksi {rupiah(flash)} tersimpan ✓
        </div>
      )}
    </div>
  );
}

const qtyBtnStyle = {
  width: 24,
  height: 24,
  borderRadius: 6,
  border: `1px solid ${T.rule}`,
  background: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  fontSize: 14,
  color: T.ink,
  padding: 0,
};

const inputStyle = {
  flex: 1,
  border: `1px solid ${T.rule}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: bodyFont,
  outline: "none",
  background: "#fff",
  color: T.ink,
};

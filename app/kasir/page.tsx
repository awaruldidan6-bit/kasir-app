'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
  category?: string;
}

interface CartItem extends Product {
  quantity: number;
}

interface TransactionHistory {
  id: number;
  invoice_number: string;
  customer_name: string;
  total_amount: number;
  cash_received: number;
  change_returned: number;
  payment_method: string;
  status?: string;
  created_at: string;
  transaction_items?: {
    id: number;
    product_name: string;
    price: number;
    quantity: number;
    subtotal: number;
  }[];
}

interface LastReceipt {
  invoiceNumber: string;
  customerName: string;
  items: { name: string; quantity: number; price: number }[];
  totalAmount: number;
  cashReceived: number;
  changeReturned: number;
  paymentMethod: string;
  date: string;
}

// ==========================================
// 🔑 GANTI PIN KASIR KAMU DI BAWAH INI:
const CASHIER_PIN = '1234'; 
// ==========================================

function playNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, audioCtx.currentTime);
    gain1.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(audioCtx.currentTime);
    osc1.stop(audioCtx.currentTime + 0.5);

    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, audioCtx.currentTime + 0.18);
    gain2.gain.setValueAtTime(0.4, audioCtx.currentTime + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.9);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(audioCtx.currentTime + 0.18);
    osc2.stop(audioCtx.currentTime + 0.9);
  } catch (e) {
    console.log('Audio error:', e);
  }
}

function terbilangIndonesia(nominal: number): string {
  if (nominal <= 0) return 'Nol Rupiah';
  const satuan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];

  function konversi(n: number): string {
    if (n < 12) return satuan[n];
    if (n < 20) return konversi(n - 10) + ' Belas';
    if (n < 100) return konversi(Math.floor(n / 10)) + ' Puluh ' + konversi(n % 10);
    if (n < 200) return 'Seratus ' + konversi(n - 100);
    if (n < 1000) return konversi(Math.floor(n / 100)) + ' Ratus ' + konversi(n % 100);
    if (n < 2000) return 'Seribu ' + konversi(n - 1000);
    if (n < 1000000) return konversi(Math.floor(n / 1000)) + ' Ribu ' + konversi(n % 1000);
    if (n < 1000000000) return konversi(Math.floor(n / 1000000)) + ' Juta ' + konversi(n % 1000000);
    if (n < 1000000000000) return konversi(Math.floor(n / 1000000000)) + ' Miliar ' + konversi(n % 1000000000);
    return '';
  }

  const hasil = konversi(Math.floor(nominal)).replace(/\s+/g, ' ').trim();
  return hasil ? `${hasil} Rupiah` : '';
}

export default function KasirPanelPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'pos' | 'riwayat'>('pos');
  const [paymentMethod, setPaymentMethod] = useState<'Tunai' | 'QRIS'>('Tunai');

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState<string>('');
  const [cash, setCash] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [historyList, setHistoryList] = useState<TransactionHistory[]>([]);
  const [lastReceipt, setLastReceipt] = useState<LastReceipt | null>(null);
  const [newOrderToast, setNewOrderToast] = useState<string | null>(null);

  // State untuk Bayar dari Riwayat
  const [payingOrder, setPayingOrder] = useState<TransactionHistory | null>(null);
  const [payingCash, setPayingCash] = useState<number>(0);
  const [payingMethod, setPayingMethod] = useState<'Tunai' | 'QRIS'>('Tunai');

  useEffect(() => {
    if (isAuthenticated) {
      fetchProducts();
      fetchTodayHistory();

      const channel = supabase
        .channel('realtime-transactions')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'transactions' },
          (payload) => {
            playNotificationSound();
            setNewOrderToast(`🔔 Pesanan baru: ${payload.new.customer_name} (Rp ${Number(payload.new.total_amount).toLocaleString('id-ID')})`);
            fetchTodayHistory();
            fetchProducts();

            setTimeout(() => {
              setNewOrderToast(null);
            }, 6000);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [isAuthenticated]);

  function handleLoginPin(e: React.FormEvent) {
    e.preventDefault();
    if (pinInput === CASHIER_PIN) {
      setIsAuthenticated(true);
      setPinError('');
      playNotificationSound();
    } else {
      setPinError('PIN Kasir salah! Silakan coba lagi.');
      setPinInput('');
    }
  }

  async function fetchProducts() {
    setLoading(true);
    const { data } = await supabase.from('products').select('*');
    if (data) setProducts(data);
    setLoading(false);
  }

  async function fetchTodayHistory() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('transactions')
      .select('*, transaction_items(*)')
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false });

    if (!error && data) {
      setHistoryList(data);
    }
  }

  async function handleResetHistory() {
    const isConfirm = window.confirm('Apakah Anda yakin ingin me-reset (menghapus) semua riwayat transaksi hari ini?');
    if (!isConfirm) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { error } = await supabase
      .from('transactions')
      .delete()
      .gte('created_at', today.toISOString());

    if (error) {
      alert('Gagal me-reset: ' + error.message);
    } else {
      alert('Riwayat hari ini berhasil di-reset!');
      setHistoryList([]);
      fetchProducts();
    }
  }

  function addToCart(product: Product) {
    if (product.stock <= 0) {
      alert('Stok produk ini habis!');
      return;
    }

    setCart((prev) => {
      const exists = prev.find((item) => item.id === product.id);
      if (exists) {
        if (exists.quantity >= product.stock) {
          alert('Jumlah melebihi stok yang tersedia!');
          return prev;
        }
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  }

  function removeFromCart(productId: number) {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === productId ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const changeReturned = paymentMethod === 'QRIS' ? 0 : cash - totalAmount;

  // Checkout Transaksi Baru dari POS
  async function handleCheckout() {
    if (paymentMethod === 'Tunai' && cash < totalAmount) {
      alert('Uang pembayaran masih kurang!');
      return;
    }

    const finalCustomerName = customerName.trim() || 'Pelanggan Umum';
    const invoiceNumber = `INV-${Date.now()}`;
    const currentDate = new Date().toLocaleString('id-ID');
    const finalCash = paymentMethod === 'QRIS' ? totalAmount : cash;

    const { data: transData, error: transError } = await supabase
      .from('transactions')
      .insert([
        {
          invoice_number: invoiceNumber,
          customer_name: finalCustomerName,
          total_amount: totalAmount,
          cash_received: finalCash,
          change_returned: changeReturned,
          payment_method: paymentMethod,
          status: 'Lunas',
        },
      ])
      .select()
      .single();

    if (transError) {
      alert('Gagal menyimpan transaksi: ' + transError.message);
      return;
    }

    const itemsToInsert = cart.map((item) => ({
      transaction_id: transData.id,
      product_id: item.id,
      product_name: item.name,
      price: item.price,
      quantity: item.quantity,
      subtotal: item.price * item.quantity,
    }));

    await supabase.from('transaction_items').insert(itemsToInsert);

    setLastReceipt({
      invoiceNumber,
      customerName: finalCustomerName,
      items: cart.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
      totalAmount,
      cashReceived: finalCash,
      changeReturned,
      paymentMethod,
      date: currentDate,
    });

    setCart([]);
    setCash(0);
    setCustomerName('');
    fetchProducts();
    fetchTodayHistory();
  }

  // ================= BAYAR DARI DAFTAR RIWAYAT =================
  async function handleSelesaikanBayarRiwayat() {
    if (!payingOrder) return;
    const orderTotal = Number(payingOrder.total_amount);

    if (payingMethod === 'Tunai' && payingCash < orderTotal) {
      alert('Uang pembayaran masih kurang!');
      return;
    }

    const finalCash = payingMethod === 'QRIS' ? orderTotal : payingCash;
    const finalChange = payingMethod === 'QRIS' ? 0 : payingCash - orderTotal;

    // Update Status Transaksi di Supabase menjadi Lunas
    const { error } = await supabase
      .from('transactions')
      .update({
        status: 'Lunas',
        cash_received: finalCash,
        change_returned: finalChange,
        payment_method: payingMethod,
      })
      .eq('id', payingOrder.id);

    if (error) {
      alert('Gagal update pembayaran: ' + error.message);
      return;
    }

    // Tampilkan Struk
    setLastReceipt({
      invoiceNumber: payingOrder.invoice_number,
      customerName: payingOrder.customer_name,
      items: payingOrder.transaction_items?.map((i) => ({
        name: i.product_name,
        quantity: i.quantity,
        price: i.price,
      })) || [],
      totalAmount: orderTotal,
      cashReceived: finalCash,
      changeReturned: finalChange,
      paymentMethod: payingMethod,
      date: new Date().toLocaleString('id-ID'),
    });

    setPayingOrder(null);
    setPayingCash(0);
    fetchTodayHistory();
  }

  const totalOmsetHariIni = historyList
    .filter((t) => t.status === 'Lunas' || Number(t.cash_received) > 0)
    .reduce((sum, item) => sum + Number(item.total_amount), 0);

  // ================= TAMPILAN KUNCI PIN =================
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center space-y-5">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center text-3xl mx-auto shadow-sm">
            🔒
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">Akses Masuk Kasir</h2>
            <p className="text-xs text-slate-400 mt-1">Masukkan PIN keamanan untuk membuka panel kasir</p>
          </div>

          <form onSubmit={handleLoginPin} className="space-y-4">
            <input
              type="password"
              maxLength={8}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="Ketik PIN..."
              className="w-full text-center tracking-widest text-2xl font-black p-3.5 border-2 border-slate-200 rounded-2xl outline-none focus:border-blue-600 transition"
              autoFocus
            />

            {pinError && <p className="text-xs text-red-500 font-bold">{pinError}</p>}

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-2xl font-bold text-sm shadow-lg shadow-blue-200 transition"
            >
              Buka Panel Kasir 🔓
            </button>
          </form>

          <Link href="/" className="inline-block text-xs font-bold text-slate-400 hover:text-slate-600">
            ← Kembali ke Menu Pelanggan
          </Link>
        </div>
      </div>
    );
  }

  // ================= TAMPILAN PANEL KASIR =================
  return (
    <div className="flex flex-col h-screen bg-slate-100 text-slate-800 font-sans relative">
      {/* BANNER NOTIFIKASI REALTIME */}
      {newOrderToast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl font-bold text-sm flex items-center gap-3 animate-bounce">
          <span>{newOrderToast}</span>
          <button onClick={() => setNewOrderToast(null)} className="text-emerald-200 hover:text-white">✕</button>
        </div>
      )}

      <header className="bg-white border-b px-6 py-3.5 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏪</span>
          <div>
            <h1 className="text-xl font-black text-blue-700 leading-tight">PANEL KASIR</h1>
            <p className="text-xs text-slate-400">Kasir & Monitoring Toko Aktif</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-xl border text-xs font-bold">
            <button
              onClick={() => setActiveTab('pos')}
              className={`px-3.5 py-1.5 rounded-lg transition ${
                activeTab === 'pos' ? 'bg-blue-600 text-white shadow' : 'text-slate-600'
              }`}
            >
              🛒 Kasir POS
            </button>
            <button
              onClick={() => {
                setActiveTab('riwayat');
                fetchTodayHistory();
              }}
              className={`px-3.5 py-1.5 rounded-lg transition ${
                activeTab === 'riwayat' ? 'bg-blue-600 text-white shadow' : 'text-slate-600'
              }`}
            >
              📊 Riwayat ({historyList.length})
            </button>
          </div>

          <button
            onClick={() => setIsAuthenticated(false)}
            className="text-xs text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg font-bold border border-red-200 transition"
          >
            🔒 Kunci Kasir
          </button>
        </div>
      </header>

      {/* Konten Utama */}
      <div className="flex-1 flex overflow-hidden">
        {/* ================= TAB 1: POS KASIR ================= */}
        {activeTab === 'pos' && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Daftar Menu Makanan & Minuman</h2>
                  <p className="text-xs text-slate-500">Klik menu untuk memasukkan ke transaksi</p>
                </div>
                <button
                  onClick={fetchProducts}
                  className="px-3.5 py-1.5 bg-white border rounded-xl text-xs font-semibold hover:bg-blue-50 transition"
                >
                  🔄 Refresh Menu
                </button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="p-5 bg-white rounded-2xl shadow-sm hover:shadow-md cursor-pointer border hover:border-blue-500 transition flex flex-col justify-between"
                  >
                    <div>
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium">
                        {p.category || 'Umum'}
                      </span>
                      <h3 className="font-bold text-slate-800 text-base mt-2">{p.name}</h3>
                      <p className="text-blue-600 font-extrabold text-lg mt-1">
                        Rp {p.price.toLocaleString('id-ID')}
                      </p>
                    </div>
                    <div className="flex justify-between items-center mt-4 pt-3 border-t text-xs">
                      <span className="text-slate-400">Stok: {p.stock}</span>
                      <span className="text-blue-600 font-bold bg-blue-50 px-2.5 py-1 rounded-lg">+ Tambah</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Panel Checkout POS */}
            <div className="w-full md:w-[440px] bg-white p-6 shadow-2xl border-l flex flex-col justify-between overflow-y-auto">
              <div>
                <h2 className="text-lg font-bold border-b pb-3 mb-3">Transaksi Kasir</h2>

                <div className="mb-3">
                  <label className="text-xs font-bold text-slate-600 mb-1 block">👤 Nama Pelanggan / No. Meja:</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Contoh: Meja 3 / Kak Budi"
                    className="w-full p-2.5 bg-slate-50 border rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-2 max-h-[18vh] overflow-y-auto pr-1">
                  {cart.map((item) => (
                    <div key={item.id} className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border">
                      <div>
                        <p className="font-bold text-slate-800 text-xs">{item.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {item.quantity} × Rp {item.price.toLocaleString('id-ID')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => removeFromCart(item.id)} className="w-6 h-6 bg-red-100 text-red-600 rounded-lg font-bold text-xs">-</button>
                        <span className="font-bold text-xs">{item.quantity}</span>
                        <button onClick={() => addToCart(item)} className="w-6 h-6 bg-blue-100 text-blue-600 rounded-lg font-bold text-xs">+</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Kalkulator Kasir */}
              <div className="border-t pt-3 space-y-2.5 mt-2">
                <div className="flex justify-between font-extrabold text-xl">
                  <span>Total Tagihan:</span>
                  <span className="text-blue-600">Rp {totalAmount.toLocaleString('id-ID')}</span>
                </div>

                <div className="flex gap-2 bg-slate-100 p-1 rounded-xl border">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Tunai')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                      paymentMethod === 'Tunai' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    💵 Tunai (Cash)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('QRIS')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                      paymentMethod === 'QRIS' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    📱 QRIS
                  </button>
                </div>

                {paymentMethod === 'Tunai' && (
                  <>
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-slate-500">Tambah Pecahan Uang:</span>
                        {cash > 0 && (
                          <button onClick={() => setCash(0)} className="text-[11px] font-bold text-red-500 hover:underline">
                            🔄 Reset (0)
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button onClick={() => setCash(totalAmount)} className="px-2 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-bold">💵 Uang Pas</button>
                        <button onClick={() => setCash((prev) => prev + 10000)} className="px-2 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold">+ 10.000</button>
                        <button onClick={() => setCash((prev) => prev + 20000)} className="px-2 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold">+ 20.000</button>
                        <button onClick={() => setCash((prev) => prev + 50000)} className="px-2 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold">+ 50.000</button>
                        <button onClick={() => setCash((prev) => prev + 100000)} className="px-2 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold">+ 100.000</button>
                        <button onClick={() => setCash((prev) => prev + 1000)} className="px-2 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold">+ 1.000</button>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-600">Uang Diterima (Rp):</label>
                      <input
                        type="number"
                        value={cash || ''}
                        onChange={(e) => setCash(Number(e.target.value))}
                        placeholder="0"
                        className="w-full p-2.5 border rounded-xl mt-1 font-black text-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                      <p className="text-[11px] font-semibold text-blue-700 bg-blue-50 p-2 rounded-lg mt-1 italic border border-blue-100">
                        🗣️ Terbilang: <span className="font-bold">{terbilangIndonesia(cash)}</span>
                      </p>
                    </div>

                    <div className="flex justify-between text-sm py-1 bg-slate-50 p-2 rounded-lg border">
                      <span className="text-slate-600">Kembalian:</span>
                      <span className={changeReturned < 0 ? 'text-red-500 font-bold' : 'text-emerald-600 font-extrabold text-base'}>
                        Rp {changeReturned >= 0 ? changeReturned.toLocaleString('id-ID') : 0}
                      </span>
                    </div>

                    <button
                      onClick={handleCheckout}
                      disabled={cart.length === 0 || totalAmount <= 0}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-bold text-base shadow-lg shadow-blue-200 disabled:bg-slate-300 disabled:shadow-none transition"
                    >
                      Bayar Tunai & Cetak Struk 🧾
                    </button>
                  </>
                )}

                {paymentMethod === 'QRIS' && (
                  <div className="space-y-3 pt-1">
                    <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl text-center space-y-2">
                      <p className="text-xs font-bold text-emerald-800">Scan QRIS untuk Membayar</p>
                      <div className="bg-white p-3 rounded-xl inline-block shadow-sm border border-emerald-100">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=KASIRKITA-QRIS-${totalAmount}`}
                          alt="QRIS Code"
                          className="w-36 h-36 mx-auto rounded-lg"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500">Mendukung GoPay, OVO, DANA, BCA, ShopeePay</p>
                    </div>

                    <button
                      onClick={handleCheckout}
                      disabled={cart.length === 0 || totalAmount <= 0}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-xl font-bold text-base shadow-lg shadow-emerald-200 disabled:bg-slate-300 disabled:shadow-none transition"
                    >
                      Konfirmasi QRIS Berhasil & Cetak Struk 📱
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: RIWAYAT & BAYAR DARI DAFTAR ================= */}
        {activeTab === 'riwayat' && (
          <div className="flex-1 p-6 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl border shadow-sm">
              <div>
                <h2 className="text-2xl font-black text-slate-800">📊 Laporan & Antrean Pesanan</h2>
                <p className="text-xs text-slate-400 mt-1">Kelola pesanan masuk dan pantau omset harian</p>
              </div>
              <div className="flex gap-2">
                <button onClick={fetchTodayHistory} className="px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold">🔄 Refresh</button>
                <button onClick={handleResetHistory} className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold">🗑️ Reset Riwayat</button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-6 rounded-2xl shadow-lg">
                <p className="text-xs font-semibold text-blue-100">Total Pendapatan Hari Ini (Lunas)</p>
                <h3 className="text-3xl font-black mt-2">Rp {totalOmsetHariIni.toLocaleString('id-ID')}</h3>
              </div>
              <div className="bg-white p-6 rounded-2xl border shadow-sm">
                <p className="text-xs font-semibold text-slate-400">Total Transaksi Masuk</p>
                <h3 className="text-3xl font-black text-slate-800 mt-2">{historyList.length} Transaksi</h3>
              </div>
            </div>

            {/* DAFTAR TRANSAKSI DENGAN STATUS & TOMBOL BAYAR */}
            <div className="space-y-4">
              {historyList.map((tx) => {
                const isPaid = tx.status === 'Lunas' || Number(tx.cash_received) > 0;

                return (
                  <div key={tx.id} className="bg-white p-5 rounded-2xl border shadow-sm space-y-3">
                    <div className="flex flex-wrap justify-between items-start gap-2 border-b pb-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-blue-700 text-sm">{tx.invoice_number}</span>
                          <span className="bg-blue-50 text-blue-700 text-xs px-2.5 py-0.5 rounded-md font-bold">
                            👤 {tx.customer_name}
                          </span>
                          
                          {/* STATUS BADGE: LUNAS ATAU BELUM DIBAYAR */}
                          {isPaid ? (
                            <span className="bg-emerald-100 text-emerald-700 text-xs px-2.5 py-0.5 rounded-md font-extrabold flex items-center gap-1">
                              🟢 LUNAS ({tx.payment_method || 'Tunai'})
                            </span>
                          ) : (
                            <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-md font-extrabold flex items-center gap-1 animate-pulse">
                              🟡 Belum Dibayar
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">⏰ {new Date(tx.created_at).toLocaleTimeString('id-ID')} WIB</p>
                      </div>

                      <div className="text-right">
                        <span className="font-black text-lg text-slate-900">
                          Rp {Number(tx.total_amount).toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>

                    {/* Rincian Menu */}
                    <div className="bg-slate-50 p-3 rounded-xl text-xs space-y-1">
                      {tx.transaction_items?.map((item) => (
                        <div key={item.id} className="flex justify-between text-slate-600 font-medium">
                          <span>{item.product_name} × {item.quantity}</span>
                          <span>Rp {Number(item.subtotal).toLocaleString('id-ID')}</span>
                        </div>
                      ))}
                    </div>

                    {/* Tombol Aksi: Bayar Sekarang (Jika Belum Lunas) atau Cetak Struk (Jika Lunas) */}
                    <div className="flex justify-end gap-2 pt-1">
                      {!isPaid ? (
                        <button
                          onClick={() => {
                            setPayingOrder(tx);
                            setPayingCash(0);
                            setPayingMethod('Tunai');
                          }}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-200 transition flex items-center gap-1.5"
                        >
                          💳 Proses Pembayaran Pesanan Ini
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setLastReceipt({
                              invoiceNumber: tx.invoice_number,
                              customerName: tx.customer_name,
                              items: tx.transaction_items?.map((i) => ({
                                name: i.product_name,
                                quantity: i.quantity,
                                price: i.price,
                              })) || [],
                              totalAmount: Number(tx.total_amount),
                              cashReceived: Number(tx.cash_received),
                              changeReturned: Number(tx.change_returned),
                              paymentMethod: tx.payment_method || 'Tunai',
                              date: new Date(tx.created_at).toLocaleString('id-ID'),
                            });
                          }}
                          className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                        >
                          🧾 Cetak Ulang Struk
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ================= MODAL POP-UP KALKULATOR BAYAR DARI RIWAYAT ================= */}
      {payingOrder && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-800">Pembayaran Pesanan</h3>
                <p className="text-xs text-blue-600 font-bold">{payingOrder.invoice_number} • 👤 {payingOrder.customer_name}</p>
              </div>
              <button onClick={() => setPayingOrder(null)} className="text-slate-400 hover:text-slate-600 text-lg font-bold">✕</button>
            </div>

            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl border">
              <span className="text-sm font-bold text-slate-600">Total yang Harus Dibayar:</span>
              <span className="text-2xl font-black text-blue-700">Rp {Number(payingOrder.total_amount).toLocaleString('id-ID')}</span>
            </div>

            {/* Metode Bayar */}
            <div className="flex gap-2 bg-slate-100 p-1 rounded-xl border">
              <button
                type="button"
                onClick={() => setPayingMethod('Tunai')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                  payingMethod === 'Tunai' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'
                }`}
              >
                💵 Tunai (Cash)
              </button>
              <button
                type="button"
                onClick={() => setPayingMethod('QRIS')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                  payingMethod === 'QRIS' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'
                }`}
              >
                📱 QRIS
              </button>
            </div>

            {payingMethod === 'Tunai' && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-1.5">
                  <button onClick={() => setPayingCash(Number(payingOrder.total_amount))} className="px-2 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-bold">💵 Uang Pas</button>
                  <button onClick={() => setPayingCash((prev) => prev + 10000)} className="px-2 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold">+ 10.000</button>
                  <button onClick={() => setPayingCash((prev) => prev + 20000)} className="px-2 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold">+ 20.000</button>
                  <button onClick={() => setPayingCash((prev) => prev + 50000)} className="px-2 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold">+ 50.000</button>
                  <button onClick={() => setPayingCash((prev) => prev + 100000)} className="px-2 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold">+ 100.000</button>
                  <button onClick={() => setPayingCash(0)} className="px-2 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold">🔄 Reset (0)</button>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600">Uang Diterima Kasir (Rp):</label>
                  <input
                    type="number"
                    value={payingCash || ''}
                    onChange={(e) => setPayingCash(Number(e.target.value))}
                    placeholder="0"
                    className="w-full p-2.5 border rounded-xl mt-1 font-black text-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <p className="text-[11px] font-semibold text-blue-700 bg-blue-50 p-2 rounded-lg mt-1 italic border border-blue-100">
                    🗣️ Terbilang: <span className="font-bold">{terbilangIndonesia(payingCash)}</span>
                  </p>
                </div>

                <div className="flex justify-between text-sm py-1 bg-slate-50 p-2.5 rounded-lg border">
                  <span className="text-slate-600">Uang Kembalian:</span>
                  <span className={payingCash - Number(payingOrder.total_amount) < 0 ? 'text-red-500 font-bold' : 'text-emerald-600 font-extrabold text-base'}>
                    Rp {payingCash - Number(payingOrder.total_amount) >= 0 ? (payingCash - Number(payingOrder.total_amount)).toLocaleString('id-ID') : 0}
                  </span>
                </div>
              </div>
            )}

            {payingMethod === 'QRIS' && (
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl text-center space-y-2">
                <p className="text-xs font-bold text-emerald-800">Scan QRIS untuk Membayar</p>
                <div className="bg-white p-3 rounded-xl inline-block shadow-sm border border-emerald-100">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=KASIRKITA-QRIS-${payingOrder.total_amount}`}
                    alt="QRIS Code"
                    className="w-32 h-32 mx-auto rounded-lg"
                  />
                </div>
                <p className="text-[11px] text-slate-500">Mendukung GoPay, OVO, DANA, BCA, ShopeePay</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setPayingOrder(null)}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition"
              >
                Batal
              </button>
              <button
                onClick={handleSelesaikanBayarRiwayat}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-200 transition"
              >
                Selesaikan Pembayaran & Cetak Struk 🧾
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL STRUK PEMBAYARAN ================= */}
      {lastReceipt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="text-center border-b pb-4">
              <span className="text-3xl">🧾</span>
              <h3 className="text-xl font-black text-slate-800 mt-1">STRUK PEMBAYARAN</h3>
              <p className="text-xs text-slate-400">{lastReceipt.invoiceNumber} • {lastReceipt.date}</p>
              <div className="mt-2 flex justify-center gap-2">
                <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs font-bold">
                  Pelanggan: {lastReceipt.customerName}
                </span>
                <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200">
                  {lastReceipt.paymentMethod}
                </span>
              </div>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto text-sm border-b pb-4">
              {lastReceipt.items.map((item, index) => (
                <div key={index} className="flex justify-between items-center text-slate-700">
                  <span>{item.name} ×{item.quantity}</span>
                  <span className="font-semibold">Rp {(item.price * item.quantity).toLocaleString('id-ID')}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between font-bold"><span>Total Tagihan:</span><span>Rp {lastReceipt.totalAmount.toLocaleString('id-ID')}</span></div>
              <div className="flex justify-between text-slate-500"><span>Uang Diterima:</span><span>Rp {lastReceipt.cashReceived.toLocaleString('id-ID')}</span></div>
              <div className="flex justify-between font-extrabold text-emerald-600 border-t pt-1"><span>Kembalian:</span><span>Rp {lastReceipt.changeReturned.toLocaleString('id-ID')}</span></div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button onClick={() => window.print()} className="w-full py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm">🖨️ Cetak Struk</button>
              <button onClick={() => setLastReceipt(null)} className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm">Tutup</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
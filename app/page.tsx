'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

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
  date: string;
}

export default function KasirPage() {
  const [activeTab, setActiveTab] = useState<'kasir' | 'riwayat'>('kasir');
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState<string>('');
  const [cash, setCash] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [historyList, setHistoryList] = useState<TransactionHistory[]>([]);
  const [lastReceipt, setLastReceipt] = useState<LastReceipt | null>(null);

  useEffect(() => {
    fetchProducts();
    fetchTodayHistory();
  }, []);

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
    const isConfirm = window.confirm(
      'Apakah Anda yakin ingin me-reset (menghapus) semua riwayat transaksi hari ini?'
    );

    if (!isConfirm) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { error } = await supabase
      .from('transactions')
      .delete()
      .gte('created_at', today.toISOString());

    if (error) {
      alert('Gagal me-reset riwayat: ' + error.message);
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
  const changeReturned = cash - totalAmount;

  async function handleCheckout() {
    if (cash < totalAmount) {
      alert('Uang pembayaran masih kurang!');
      return;
    }

    const finalCustomerName = customerName.trim() || 'Pelanggan Umum';
    const invoiceNumber = `INV-${Date.now()}`;
    const currentDate = new Date().toLocaleString('id-ID');

    // 1. Simpan Transaksi dengan Nama Pelanggan
    const { data: transData, error: transError } = await supabase
      .from('transactions')
      .insert([
        {
          invoice_number: invoiceNumber,
          customer_name: finalCustomerName,
          total_amount: totalAmount,
          cash_received: cash,
          change_returned: changeReturned,
          payment_method: 'Tunai',
        },
      ])
      .select()
      .single();

    if (transError) {
      alert('Gagal menyimpan transaksi: ' + transError.message);
      return;
    }

    // 2. Simpan Detail Item
    const itemsToInsert = cart.map((item) => ({
      transaction_id: transData.id,
      product_id: item.id,
      product_name: item.name,
      price: item.price,
      quantity: item.quantity,
      subtotal: item.price * item.quantity,
    }));

    await supabase.from('transaction_items').insert(itemsToInsert);

    // Tampilkan Struk
    setLastReceipt({
      invoiceNumber,
      customerName: finalCustomerName,
      items: cart.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
      totalAmount,
      cashReceived: cash,
      changeReturned,
      date: currentDate,
    });

    setCart([]);
    setCash(0);
    setCustomerName('');
    fetchProducts();
    fetchTodayHistory();
  }

  const totalOmsetHariIni = historyList.reduce((sum, item) => sum + Number(item.total_amount), 0);

  return (
    <div className="flex flex-col h-screen bg-slate-100 text-slate-800 font-sans">
      {/* NAVBAR ATAS */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏪</span>
          <div>
            <h1 className="text-xl font-black text-blue-700 leading-tight">KASIR KITA</h1>
            <p className="text-xs text-slate-400">Sistem Kasir & Pemantauan Penjualan</p>
          </div>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('kasir')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'kasir'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🛒 Menu Kasir
          </button>
          <button
            onClick={() => {
              setActiveTab('riwayat');
              fetchTodayHistory();
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === 'riwayat'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📊 Riwayat Hari Ini ({historyList.length})
          </button>
        </div>
      </header>

      {/* KONTEN UTAMA */}
      <div className="flex-1 flex overflow-hidden">
        {/* ================= TAB 1: KASIR ================= */}
        {activeTab === 'kasir' && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Kolom Kiri: Menu */}
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Daftar Menu Makanan & Minuman</h2>
                  <p className="text-xs text-slate-500">Klik menu untuk menambahkan ke pesanan</p>
                </div>
                <button
                  onClick={fetchProducts}
                  className="px-3.5 py-1.5 bg-white border border-slate-200 text-blue-600 rounded-xl text-xs font-semibold hover:bg-blue-50 shadow-sm transition"
                >
                  🔄 Refresh Menu
                </button>
              </div>

              {loading ? (
                <p className="text-slate-500 text-center py-10">Memuat menu...</p>
              ) : products.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl border text-center text-slate-500 shadow-sm">
                  Belum ada menu di database.
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {products.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => addToCart(p)}
                      className="p-5 bg-white rounded-2xl shadow-sm hover:shadow-md cursor-pointer border border-slate-200 hover:border-blue-500 transition flex flex-col justify-between"
                    >
                      <div>
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-md font-medium">
                          {p.category || 'Umum'}
                        </span>
                        <h3 className="font-bold text-slate-800 text-base mt-2">{p.name}</h3>
                        <p className="text-blue-600 font-extrabold text-lg mt-1">
                          Rp {p.price.toLocaleString('id-ID')}
                        </p>
                      </div>
                      <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-100 text-xs">
                        <span className={p.stock > 10 ? 'text-slate-400' : 'text-amber-600 font-semibold'}>
                          Stok: {p.stock}
                        </span>
                        <span className="text-blue-600 font-bold bg-blue-50 px-2.5 py-1 rounded-lg">
                          + Tambah
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Kolom Kanan: Pesanan & Pembayaran */}
            <div className="w-full md:w-[420px] bg-white p-6 shadow-2xl border-l border-slate-200 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center border-b pb-3 mb-4">
                  <h2 className="text-lg font-bold text-slate-800">Daftar Pesanan</h2>
                  <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">
                    {cart.reduce((s, i) => s + i.quantity, 0)} Item
                  </span>
                </div>

                {/* Kolom Input Nama Pelanggan */}
                <div className="mb-3">
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1 mb-1">
                    👤 Nama Pelanggan / No. Meja:
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Contoh: Meja 3 / Budi"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                  />
                </div>

                {/* Daftar Item di Keranjang */}
                <div className="space-y-2.5 max-h-[26vh] overflow-y-auto pr-1">
                  {cart.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">Keranjang belanja kosong</p>
                  ) : (
                    cart.map((item) => (
                      <div key={item.id} className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                          <p className="text-xs text-slate-500">
                            {item.quantity} × Rp {item.price.toLocaleString('id-ID')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="w-7 h-7 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg flex items-center justify-center font-bold transition"
                          >
                            -
                          </button>
                          <span className="font-bold text-sm w-4 text-center">{item.quantity}</span>
                          <button
                            onClick={() => addToCart(item)}
                            className="w-7 h-7 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-lg flex items-center justify-center font-bold transition"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Panel Pembayaran & Nominal Cepat */}
              <div className="border-t border-slate-200 pt-3 space-y-2.5">
                <div className="flex justify-between font-extrabold text-xl text-slate-900">
                  <span>Total Tagihan:</span>
                  <span className="text-blue-600">Rp {totalAmount.toLocaleString('id-ID')}</span>
                </div>

                {totalAmount > 0 && (
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-500">Pilih Nominal Cepat:</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCash(totalAmount)}
                        className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-bold transition"
                      >
                        💵 Uang Pas
                      </button>
                      <button
                        type="button"
                        onClick={() => setCash(10000)}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                      >
                        10.000
                      </button>
                      <button
                        type="button"
                        onClick={() => setCash(20000)}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                      >
                        20.000
                      </button>
                      <button
                        type="button"
                        onClick={() => setCash(50000)}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                      >
                        50.000
                      </button>
                      <button
                        type="button"
                        onClick={() => setCash(100000)}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                      >
                        100.000
                      </button>
                      <button
                        type="button"
                        onClick={() => setCash(Math.ceil(totalAmount / 50000) * 50000)}
                        className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition"
                      >
                        Bulat 50rb
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-slate-600">Uang Diterima (Rp):</label>
                  <input
                    type="number"
                    value={cash || ''}
                    onChange={(e) => setCash(Number(e.target.value))}
                    placeholder="0"
                    className="w-full p-2.5 border border-slate-300 rounded-xl mt-1 font-bold text-base focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="flex justify-between text-sm py-1 bg-slate-50 p-2.5 rounded-lg">
                  <span className="text-slate-600 font-medium">Uang Kembalian:</span>
                  <span className={changeReturned < 0 ? 'text-red-500 font-bold' : 'text-emerald-600 font-extrabold text-base'}>
                    Rp {changeReturned >= 0 ? changeReturned.toLocaleString('id-ID') : 0}
                  </span>
                </div>

                <button
                  onClick={handleCheckout}
                  disabled={cart.length === 0 || totalAmount <= 0}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-bold text-base shadow-lg shadow-blue-200 disabled:bg-slate-300 disabled:shadow-none transition"
                >
                  Bayar Sekarang (Checkout)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: RIWAYAT HARI INI ================= */}
        {activeTab === 'riwayat' && (
          <div className="flex-1 p-6 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div>
                <h2 className="text-2xl font-black text-slate-800">📊 Laporan & Riwayat Hari Ini</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Catatan seluruh transaksi kasir yang masuk pada hari ini
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={fetchTodayHistory}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  🔄 Refresh
                </button>
                <button
                  onClick={handleResetHistory}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-md shadow-red-200 transition flex items-center gap-1.5"
                >
                  🗑️ Reset / Restart Riwayat
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-6 rounded-2xl shadow-lg shadow-blue-100">
                <p className="text-xs font-semibold text-blue-100 uppercase tracking-wider">Total Pendapatan Hari Ini</p>
                <h3 className="text-3xl font-black mt-2">Rp {totalOmsetHariIni.toLocaleString('id-ID')}</h3>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Transaksi Selesai</p>
                <h3 className="text-3xl font-black text-slate-800 mt-2">{historyList.length} Transaksi</h3>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-bold text-slate-800 text-lg">Daftar Transaksi:</h3>

              {historyList.length === 0 ? (
                <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-400">
                  <span className="text-4xl">📭</span>
                  <p className="font-semibold mt-2">Belum ada transaksi untuk hari ini.</p>
                  <p className="text-xs">Lakukan transaksi di menu kasir untuk melihatnya di sini.</p>
                </div>
              ) : (
                historyList.map((tx) => (
                  <div
                    key={tx.id}
                    className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition space-y-3"
                  >
                    <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-blue-700 text-sm">{tx.invoice_number}</span>
                          <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-md font-bold">
                            👤 {tx.customer_name}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          ⏰ {new Date(tx.created_at).toLocaleTimeString('id-ID')} WIB
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-slate-900 text-base">
                          Rp {Number(tx.total_amount).toLocaleString('id-ID')}
                        </span>
                        <p className="text-xs text-emerald-600 font-semibold">Tunai / Selesai</p>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl space-y-1.5 text-xs">
                      <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Item Dipesan:</p>
                      {tx.transaction_items?.map((item) => (
                        <div key={item.id} className="flex justify-between text-slate-700 font-medium">
                          <span>{item.product_name} × {item.quantity}</span>
                          <span>Rp {Number(item.subtotal).toLocaleString('id-ID')}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between items-center text-xs text-slate-500 pt-1">
                      <div>
                        <span>Dibayar: Rp {Number(tx.cash_received).toLocaleString('id-ID')}</span>
                        <span className="mx-2">•</span>
                        <span className="text-emerald-600 font-semibold">
                          Kembalian: Rp {Number(tx.change_returned).toLocaleString('id-ID')}
                        </span>
                      </div>
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
                            date: new Date(tx.created_at).toLocaleString('id-ID'),
                          });
                        }}
                        className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg font-bold transition"
                      >
                        🧾 Lihat Struk
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL STRUK CETAK */}
      {lastReceipt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="text-center border-b pb-4">
              <span className="text-3xl">🧾</span>
              <h3 className="text-xl font-black text-slate-800 mt-1">STRUK PEMBAYARAN</h3>
              <p className="text-xs text-slate-400 mt-0.5">{lastReceipt.invoiceNumber}</p>
              <p className="text-xs text-slate-400">{lastReceipt.date}</p>
              <div className="mt-2 inline-block bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs font-bold">
                Pelanggan: {lastReceipt.customerName}
              </div>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto text-sm border-b pb-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Rincian Menu:</p>
              {lastReceipt.items.map((item, index) => (
                <div key={index} className="flex justify-between items-center text-slate-700">
                  <span>{item.name} <span className="text-slate-400 text-xs">×{item.quantity}</span></span>
                  <span className="font-semibold">Rp {(item.price * item.quantity).toLocaleString('id-ID')}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between font-bold text-slate-800">
                <span>Total Tagihan:</span>
                <span>Rp {lastReceipt.totalAmount.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Uang Diterima:</span>
                <span>Rp {lastReceipt.cashReceived.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between font-extrabold text-emerald-600 text-base pt-1 border-t">
                <span>Kembalian:</span>
                <span>Rp {lastReceipt.changeReturned.toLocaleString('id-ID')}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => window.print()}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition"
              >
                🖨️ Cetak Struk
              </button>
              <button
                onClick={() => setLastReceipt(null)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
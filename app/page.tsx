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

export default function PelangganPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState<string>('');
  const [orderSuccess, setOrderSuccess] = useState<boolean>(false);
  const [lastInvoice, setLastInvoice] = useState<string>('');

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    const { data } = await supabase.from('products').select('*');
    if (data) setProducts(data);
  }

  function addToCart(product: Product) {
    if (product.stock <= 0) {
      alert('Maaf, stok produk ini habis!');
      return;
    }

    setCart((prev) => {
      const exists = prev.find((item) => item.id === product.id);
      if (exists) {
        if (exists.quantity >= product.stock) {
          alert('Jumlah pesanan melebihi stok yang tersedia!');
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

  async function handleSendOrder() {
    if (!customerName.trim()) {
      alert('Silakan masukkan Nama / No. Meja Anda terlebih dahulu!');
      return;
    }

    const invoiceNumber = `ORD-${Date.now()}`;

    // Simpan Pesanan ke Supabase
    const { data: transData, error: transError } = await supabase
      .from('transactions')
      .insert([
        {
          invoice_number: invoiceNumber,
          customer_name: customerName.trim(),
          total_amount: totalAmount,
          cash_received: 0,
          change_returned: 0,
          payment_method: 'Pesan Mandiri (Bayar di Kasir)',
        },
      ])
      .select()
      .single();

    if (transError) {
      alert('Gagal mengirim pesanan: ' + transError.message);
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

    setLastInvoice(invoiceNumber);
    setOrderSuccess(true);
    setCart([]);
    fetchProducts();
  }

  const categories = ['Semua', ...Array.from(new Set(products.map((p) => p.category || 'Umum')))];
  const filteredProducts =
    selectedCategory === 'Semua'
      ? products
      : products.filter((p) => (p.category || 'Umum') === selectedCategory);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Header Pelanggan */}
      <header className="bg-white border-b px-6 py-4 flex justify-between items-center sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-3xl">☕</span>
          <div>
            <h1 className="text-xl font-black text-emerald-700 leading-tight">E-MENU KAFE KITA</h1>
            <p className="text-xs text-slate-400">Pesan makanan & minuman langsung dari mejamu</p>
          </div>
        </div>

        {/* Tombol Akses Kasir (Gembok) */}
        <Link
          href="/kasir"
          className="text-xs font-bold text-slate-400 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 px-3 py-2 rounded-xl transition flex items-center gap-1"
        >
          🔒 Akses Kasir
        </Link>
      </header>

      {/* Konten Menu Pelanggan */}
      <div className="flex-1 flex flex-col md:flex-row max-w-7xl mx-auto w-full p-4 md:p-6 gap-6">
        {/* Katalog Menu */}
        <div className="flex-1 flex flex-col">
          <div className="mb-4">
            <h2 className="text-2xl font-black text-slate-800">🍽️ Mau Pesan Apa Hari Ini?</h2>
            
            {/* Filter Kategori */}
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                    selectedCategory === cat
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map((p) => (
              <div
                key={p.id}
                onClick={() => addToCart(p)}
                className="bg-white p-5 rounded-3xl border border-slate-200 hover:border-emerald-500 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold">
                    {p.category || 'Umum'}
                  </span>
                  <h3 className="font-bold text-slate-800 text-base mt-2">{p.name}</h3>
                  <p className="text-emerald-600 font-black text-lg mt-1">
                    Rp {p.price.toLocaleString('id-ID')}
                  </p>
                </div>
                <button className="w-full mt-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-xl text-xs font-bold transition">
                  + Tambah ke Pesanan
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Keranjang Pesanan Pelanggan */}
        <div className="w-full md:w-96 bg-white rounded-3xl p-6 shadow-xl border flex flex-col justify-between h-fit sticky top-24">
          <div>
            <h3 className="text-lg font-bold border-b pb-3 mb-4">🛒 Pesanan Anda</h3>

            <div className="mb-4">
              <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                👤 Nama / Nomor Meja:
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Contoh: Meja 5 / Kak Rian"
                className="w-full p-3 bg-slate-50 border rounded-2xl text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-3 max-h-[30vh] overflow-y-auto pr-1">
              {cart.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">Belum ada menu yang dipilih</p>
              ) : (
                cart.map((item) => (
                  <div key={item.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl border">
                    <div>
                      <p className="font-bold text-slate-800 text-xs">{item.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {item.quantity} × Rp {item.price.toLocaleString('id-ID')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => removeFromCart(item.id)} className="w-6 h-6 bg-red-100 text-red-600 rounded-lg font-bold text-xs">-</button>
                      <span className="font-bold text-xs">{item.quantity}</span>
                      <button onClick={() => addToCart(item)} className="w-6 h-6 bg-emerald-100 text-emerald-600 rounded-lg font-bold text-xs">+</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="border-t pt-4 space-y-3 mt-4">
            <div className="flex justify-between font-extrabold text-xl">
              <span>Total:</span>
              <span className="text-emerald-600">Rp {totalAmount.toLocaleString('id-ID')}</span>
            </div>

            <button
              onClick={handleSendOrder}
              disabled={cart.length === 0}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-2xl font-bold text-sm shadow-lg shadow-emerald-200 disabled:bg-slate-300 disabled:shadow-none transition"
            >
              Kirim Pesanan ke Kasir 🚀
            </button>
          </div>
        </div>
      </div>

      {/* Pop-up Sukses Pesan */}
      {orderSuccess && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
            <div className="text-5xl">🎉</div>
            <h3 className="text-xl font-black text-slate-800">Pesanan Berhasil Dikirim!</h3>
            <p className="text-xs text-slate-500">
              Nomor Pesanan: <span className="font-bold text-emerald-600">{lastInvoice}</span>
            </p>
            <p className="text-xs text-slate-400">
              Silakan menunggu pesanan Anda atau lakukan pembayaran di meja kasir.
            </p>
            <button
              onClick={() => setOrderSuccess(false)}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm"
            >
              Pesan Lagi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
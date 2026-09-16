'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

// Inisialisasi Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rmtinkpblyzbyazbmnia.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtdGlua3BibHl6YnlhemJtbmlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzczMDY0NDEsImV4cCI6MjA1Mjg4MjQ0MX0.m9V_0qXy98G9ZqQe-t5Q_wQp7eK3N9e1p6F-qR7wYxM'
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Format Rupiah
const formatRupiah = (val: number | string) => {
  const num = Number(val) || 0
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num).replace('IDR', 'Rp')
}

interface MenuItem {
  id: string | number
  name: string
  price: number
  description?: string
  category?: string
  image_url?: string
}

interface CartItem extends MenuItem {
  qty: number
  notes?: string
}

export default function PelangganPage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua')
  const [cart, setCart] = useState<CartItem[]>([])
  const [customerName, setCustomerName] = useState<string>('')
  const [tableNumber, setTableNumber] = useState<string>('')
  const [orderNotes, setOrderNotes] = useState<string>('')
  
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [orderSuccess, setOrderSuccess] = useState<boolean>(false)
  const [lastOrderId, setLastOrderId] = useState<string>('')

  // Auto-detect Nomor Meja dari URL (Contoh: https://kasir-d1itsme.vercel.app/?meja=5)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const mejaParam = params.get('meja') || params.get('table')
      if (mejaParam) {
        setTableNumber(`Meja ${mejaParam}`)
      }
    }
    fetchMenu()
  }, [])

  // Ambil Data Menu dari Supabase (Tabel menu_items dengan fallback products)
  async function fetchMenu() {
    let { data, error } = await supabase.from('menu_items').select('*').order('name')
    if (error || !data || data.length === 0) {
      const { data: prodData } = await supabase.from('products').select('*')
      if (prodData) data = prodData
    }
    if (data) {
      setMenuItems(
        data.map((item: any) => ({
          id: item.id,
          name: item.name || item.nama || 'Menu',
          price: Number(item.price || item.harga || 0),
          description: item.description || item.deskripsi || '',
          category: item.category || item.kategori || 'Umum',
          image_url: item.image_url || ''
        }))
      )
    }
  }

  // Tambah ke Keranjang
  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const exists = prev.find((i) => i.id === item.id)
      if (exists) {
        return prev.map((i) => (i.id === item.id ? { ...i, qty: i.qty + 1 } : i))
      }
      return [...prev, { ...item, qty: 1, notes: '' }]
    })
  }

  function updateQty(id: string | number, delta: number) {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.qty + delta
            return newQty > 0 ? { ...item, qty: newQty } : null
          }
          return item
        })
        .filter(Boolean) as CartItem[]
    )
  }

  function updateItemNotes(id: string | number, notes: string) {
    setCart((prev) => prev.map((item) => (item.id === id ? { ...item, notes } : item)))
  }

  // Hitung Total Tagihan Keranjang
  const totalAmount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.qty, 0)
  }, [cart])

  // Kirim Pesanan ke Kasir
  async function handleSendOrder() {
    if (!customerName.trim() && !tableNumber.trim()) {
      alert('Silakan masukkan Nama Anda atau Nomor Meja terlebih dahulu!')
      return
    }
    if (cart.length === 0) {
      alert('Keranjang pesanan masih kosong!')
      return
    }

    setIsSubmitting(true)
    try {
      const finalTableName = tableNumber.trim() || 'Takeaway'
      const finalCustomer = customerName.trim() || 'Pelanggan'

      // 1. Simpan ke tabel orders
      const { data: newOrder, error: orderErr } = await supabase
        .from('orders')
        .insert({
          customer_name: finalCustomer,
          table_number: finalTableName,
          total_amount: totalAmount,
          status: 'Menunggu Konfirmasi',
          payment_method: 'Bayar di Kasir',
          cash_received: 0,
          change_amount: 0,
          notes: orderNotes
        })
        .select()
        .single()

      if (orderErr) throw orderErr

      // 2. Simpan item pesanan ke order_items
      const itemsToInsert = cart.map((item) => ({
        order_id: newOrder.id,
        menu_item_id: item.id,
        quantity: item.qty,
        price_per_unit: item.price,
        subtotal: item.price * item.qty,
        notes: item.notes || ''
      }))

      await supabase.from('order_items').insert(itemsToInsert)

      // Sukses
      setLastOrderId(`ORD-${newOrder.id.toString().slice(0, 6)}`)
      setOrderSuccess(true)
      setCart([])
      setOrderNotes('')
    } catch (err: any) {
      alert('Gagal mengirim pesanan: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Kategori Menu
  const categories = useMemo(() => {
    const set = new Set(menuItems.map((m) => m.category || 'Umum'))
    return ['Semua', ...Array.from(set)]
  }, [menuItems])

  const filteredItems = useMemo(() => {
    if (selectedCategory === 'Semua') return menuItems
    return menuItems.filter((m) => (m.category || 'Umum') === selectedCategory)
  }, [menuItems, selectedCategory])

  return (
    <div className="flex flex-col min-h-screen bg-slate-100 text-slate-900 font-sans">
      {/* Header Pelanggan */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-3xl">☕</span>
          <div>
            <h1 className="text-xl font-black text-slate-900 leading-tight">E-MENU KAFE</h1>
            <p className="text-xs text-slate-500">Pesan langsung dari meja Anda</p>
          </div>
        </div>

        <Link
          href="/kasir"
          className="text-xs font-bold text-slate-500 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 px-3 py-2 rounded-xl transition flex items-center gap-1 border border-slate-200"
        >
          🔒 Akses Kasir
        </Link>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl mx-auto w-full p-4 lg:p-6 gap-6 items-start">
        {/* Katalog Menu (Kiri) */}
        <div className="flex-1 w-full space-y-4">
          <div>
            <h2 className="text-2xl font-black text-slate-900">🍽️ Pilih Menu Favorit Anda</h2>
            
            {/* Filter Kategori */}
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                    selectedCategory === cat
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Grid Menu */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => addToCart(item)}
                className="bg-white p-4 rounded-3xl border border-slate-200 hover:border-blue-500 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-bold">
                    {item.category || 'Umum'}
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm mt-2">{item.name}</h3>
                  <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{item.description}</p>
                </div>
                <div className="mt-4 flex justify-between items-center">
                  <span className="text-blue-600 font-extrabold text-sm">{formatRupiah(item.price)}</span>
                  <button className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 font-bold flex items-center justify-center hover:bg-blue-600 hover:text-white transition">
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Keranjang Belanja Pelanggan (Kanan) */}
        <div className="w-full lg:w-96 bg-white rounded-3xl p-5 shadow-xl border border-slate-200 flex flex-col justify-between sticky top-20">
          <div>
            <h3 className="text-lg font-black text-slate-900 border-b border-slate-100 pb-3 mb-4">
              🛒 Keranjang Pesanan
            </h3>

            {/* Input Nama & No Meja */}
            <div className="space-y-2 mb-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">📍 Nomor Meja:</label>
                <input
                  type="text"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="Contoh: Meja 03"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">👤 Nama Pemesan:</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Contoh: Kak Danu"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* List Item Keranjang */}
            <div className="space-y-2.5 max-h-[35vh] overflow-y-auto pr-1">
              {cart.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-slate-200 rounded-2xl">
                  <p className="text-xs text-slate-400">Belum ada menu yang dipilih</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.id} className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex-1 pr-2">
                        <p className="font-bold text-slate-900 text-xs">{item.name}</p>
                        <p className="text-[11px] text-blue-600 font-bold">{formatRupiah(item.price)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQty(item.id, -1)}
                          className="w-6 h-6 bg-rose-100 text-rose-600 rounded-lg font-bold text-xs"
                        >
                          -
                        </button>
                        <span className="font-bold text-xs w-4 text-center">{item.qty}</span>
                        <button
                          onClick={() => updateQty(item.id, 1)}
                          className="w-6 h-6 bg-blue-100 text-blue-600 rounded-lg font-bold text-xs"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    {/* Catatan Per Menu (Less sugar, es sedikit, dll) */}
                    <input
                      type="text"
                      placeholder="Catatan (opsional: less sugar, pedas, dll)"
                      value={item.notes || ''}
                      onChange={(e) => updateItemNotes(item.id, e.target.value)}
                      className="w-full text-[11px] bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 outline-none focus:border-blue-400"
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Checkout Bar */}
          <div className="border-t border-slate-100 pt-4 space-y-3 mt-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-slate-600">Total Tagihan:</span>
              <span className="text-2xl font-black text-blue-600">{formatRupiah(totalAmount)}</span>
            </div>

            <button
              onClick={handleSendOrder}
              disabled={cart.length === 0 || isSubmitting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-2xl font-bold text-sm shadow-lg shadow-blue-200 disabled:opacity-40 transition flex items-center justify-center gap-2"
            >
              {isSubmitting ? 'Mengirim Pesanan...' : '🚀 Kirim Pesanan ke Kasir'}
            </button>
          </div>
        </div>
      </div>

      {/* Pop-up Sukses Pesan */}
      {orderSuccess && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
            <div className="text-5xl">🎉</div>
            <h3 className="text-xl font-black text-slate-900">Pesanan Berhasil Dikirim!</h3>
            <p className="text-xs text-slate-500">
              ID Pesanan: <span className="font-bold text-blue-600">{lastOrderId}</span>
            </p>
            <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border">
              Pesanan Anda sudah masuk ke antrean kasir. Silakan santai di meja atau lakukan pembayaran saat pesanan diantar.
            </p>
            <button
              onClick={() => setOrderSuccess(false)}
              className="w-full py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm hover:bg-blue-700 transition shadow"
            >
              Pesan Tambahan Lagi
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
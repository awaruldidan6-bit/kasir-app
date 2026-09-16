'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'

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

// Konversi Angka ke Terbilang
function terbilang(nominal: number): string {
  if (nominal <= 0) return 'Nol Rupiah'
  const bilangan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas']
  
  function sebut(n: number): string {
    if (n < 12) return bilangan[n]
    if (n < 20) return sebut(n - 10) + ' Belas'
    if (n < 100) return sebut(Math.floor(n / 10)) + ' Puluh ' + sebut(n % 10)
    if (n < 200) return 'Seratus ' + sebut(n - 100)
    if (n < 1000) return sebut(Math.floor(n / 100)) + ' Ratus ' + sebut(n % 100)
    if (n < 2000) return 'Seribu ' + sebut(n - 1000)
    if (n < 1000000) return sebut(Math.floor(n / 1000)) + ' Ribu ' + sebut(n % 1000)
    if (n < 1000000000) return sebut(Math.floor(n / 1000000)) + ' Juta ' + sebut(n % 1000000)
    return ''
  }
  return (sebut(nominal).trim().replace(/\s+/g, ' ') + ' Rupiah').trim()
}

export default function KasirPage() {
  // Autentikasi PIN
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)

  // Tab & Data
  const [activeTab, setActiveTab] = useState<'pos' | 'orders' | 'history'>('pos')
  const [menuItems, setMenuItems] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  
  // State Form Kasir POS
  const [customerName, setCustomerName] = useState('')
  const [tableNumber, setTableNumber] = useState('')
  const [cart, setCart] = useState<any[]>([])
  const [paymentMethod, setPaymentMethod] = useState<'Tunai' | 'QRIS'>('Tunai')
  const [uangDiterima, setUangDiterima] = useState<number>(0)

  // State Modal Bayar Riwayat Pesanan
  const [payingOrder, setPayingOrder] = useState<any | null>(null)
  const [payingCash, setPayingCash] = useState<number>(0)

  // State Modal Cetak Struk
  const [receiptOrder, setReceiptOrder] = useState<any | null>(null)
  const [isPrintingBluetooth, setIsPrintingBluetooth] = useState(false)

  // Suara Notifikasi Pesanan Masuk
  const playNotificationSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime)
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15)
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start()
      osc.stop(audioCtx.currentTime + 0.4)
    } catch (e) {
      console.log('Audio disabled')
    }
  }

  // Load Data Menu & Pesanan
  const fetchData = async () => {
    const { data: menu } = await supabase.from('menu_items').select('*').order('name')
    if (menu) setMenuItems(menu)

    const { data: ord } = await supabase
      .from('orders')
      .select('*, order_items(*, menu_items(*))')
      .order('created_at', { ascending: false })
    if (ord) setOrders(ord)
  }

  useEffect(() => {
    fetchData()

    // Realtime listener Supabase
    const channel = supabase
      .channel('schema-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        fetchData()
        if (payload.eventType === 'INSERT') {
          playNotificationSound()
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Handler Login PIN
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (pinInput === '1234') {
      setIsAuthenticated(true)
      setPinError(false)
    } else {
      setPinError(true)
      setPinInput('')
    }
  }

  // Operasi Keranjang POS
  const addToCart = (item: any) => {
    const itemPrice = Number(item.price || item.harga || 0)
    setCart((prev) => {
      const exist = prev.find((i) => i.id === item.id)
      if (exist) {
        return prev.map((i) => (i.id === item.id ? { ...i, qty: i.qty + 1 } : i))
      }
      return [...prev, { ...item, price: itemPrice, qty: 1 }]
    })
  }

  const updateCartQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.qty + delta
            return newQty > 0 ? { ...item, qty: newQty } : null
          }
          return item
        })
        .filter(Boolean)
    )
  }

  // Hitung Total Tagihan POS (Aman dari bug NaN)
  const totalTagihan = useMemo(() => {
    return cart.reduce((total, item) => {
      const price = Number(item.price ?? item.harga ?? 0)
      const qty = Number(item.qty ?? item.quantity ?? 1)
      return total + price * qty
    }, 0)
  }, [cart])

  // Hitung Uang Kembalian POS
  const kembalian = useMemo(() => {
    if (paymentMethod === 'QRIS') return 0
    return Math.max(0, Number(uangDiterima || 0) - totalTagihan)
  }, [uangDiterima, totalTagihan, paymentMethod])

  // Checkout POS Langsung
  const handleCheckoutPOS = async (withReceipt: boolean) => {
    if (cart.length === 0) return alert('Keranjang masih kosong!')
    if (paymentMethod === 'Tunai' && uangDiterima < totalTagihan) {
      return alert('Uang yang diterima kasir masih kurang dari total tagihan!')
    }

    try {
      // 1. Simpan order ke Supabase
      const { data: newOrder, error: orderErr } = await supabase
        .from('orders')
        .insert({
          customer_name: customerName || 'Pelanggan Kasir',
          table_number: tableNumber || 'Kasir',
          total_amount: totalTagihan,
          status: 'Lunas',
          payment_method: paymentMethod,
          cash_received: paymentMethod === 'Tunai' ? uangDiterima : totalTagihan,
          change_amount: kembalian
        })
        .select()
        .single()

      if (orderErr) throw orderErr

      // 2. Simpan item pesanan
      const itemsToInsert = cart.map((item) => ({
        order_id: newOrder.id,
        menu_item_id: item.id,
        quantity: item.qty,
        price_per_unit: Number(item.price || item.harga || 0),
        subtotal: Number(item.price || item.harga || 0) * item.qty
      }))

      await supabase.from('order_items').insert(itemsToInsert)

      // Simpan data untuk struk
      const completedOrderData = {
        ...newOrder,
        order_items: cart.map((c) => ({
          quantity: c.qty,
          price_per_unit: Number(c.price || c.harga || 0),
          menu_items: { name: c.name || c.nama }
        })),
        cash_received: paymentMethod === 'Tunai' ? uangDiterima : totalTagihan,
        change_amount: kembalian
      }

      // Reset form
      setCart([])
      setCustomerName('')
      setTableNumber('')
      setUangDiterima(0)
      fetchData()

      if (withReceipt) {
        setReceiptOrder(completedOrderData)
      } else {
        alert('✅ Transaksi Berhasil Disimpan!')
      }
    } catch (err: any) {
      alert('Gagal memproses transaksi: ' + err.message)
    }
  }

  // Buka Modal Pembayaran dari Riwayat Pesanan
  const openPayOrderModal = (order: any) => {
    setPayingOrder(order)
    setPayingCash(Number(order.total_amount || 0))
  }

  // Selesaikan Pembayaran Riwayat (Opsi Struk & Tanpa Struk)
  const handleCompleteOrderPayment = async (withReceipt: boolean) => {
    if (!payingOrder) return
    const orderTotal = Number(payingOrder.total_amount || 0)
    if (payingCash < orderTotal) {
      return alert('Uang diterima kurang dari total tagihan!')
    }

    const change = Math.max(0, payingCash - orderTotal)

    await supabase.from('orders').update({
      status: 'Lunas',
      cash_received: payingCash,
      change_amount: change
    }).eq('id', payingOrder.id)

    fetchData()

    const finishedOrder = {
      ...payingOrder,
      cash_received: payingCash,
      change_amount: change
    }

    setPayingOrder(null)
    setPayingCash(0)

    if (withReceipt) {
      setReceiptOrder(finishedOrder)
    } else {
      alert('✅ Pesanan berhasil diselesaikan & Lunas!')
    }
  }

  // Cetak Bluetooth Thermal 58mm
  const printBluetooth = async () => {
    if (!receiptOrder) return
    setIsPrintingBluetooth(true)
    try {
      const nav: any = navigator
      if (!nav.bluetooth) {
        alert('Web Bluetooth tidak didukung di browser ini. Gunakan Google Chrome di Android / Laptop.')
        setIsPrintingBluetooth(false)
        return
      }

      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2']
      })

      const server = await device.gatt.connect()
      const services = await server.getPrimaryServices()
      let writeChar: any = null

      for (const service of services) {
        const chars = await service.getCharacteristics()
        for (const char of chars) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            writeChar = char
            break
          }
        }
        if (writeChar) break
      }

      if (!writeChar) throw new Error('Karakteristik Bluetooth printer tidak ditemukan.')

      const encoder = new TextEncoder()
      let text = '\x1B\x40' // Init printer
      text += '\x1B\x61\x01' // Align Center
      text += 'WARUNG KOPI / KASIR\n'
      text += 'STRUK PEMBAYARAN\n'
      text += '================================\n'
      text += '\x1B\x61\x00' // Align Left
      text += `Meja      : ${receiptOrder.table_number || '-'}\n`
      text += `Pelanggan : ${receiptOrder.customer_name || '-'}\n`
      text += `Waktu     : ${new Date(receiptOrder.created_at || Date.now()).toLocaleTimeString('id-ID')}\n`
      text += '--------------------------------\n'

      receiptOrder.order_items?.forEach((item: any) => {
        const name = item.menu_items?.name || item.name || 'Item'
        const qty = item.quantity || item.qty || 1
        const price = Number(item.price_per_unit || item.price || 0)
        text += `${name}\n`
        text += `  ${qty} x ${formatRupiah(price)} = ${formatRupiah(qty * price)}\n`
      })

      text += '--------------------------------\n'
      text += `TOTAL     : ${formatRupiah(receiptOrder.total_amount)}\n`
      text += `TUNAI     : ${formatRupiah(receiptOrder.cash_received || receiptOrder.total_amount)}\n`
      text += `KEMBALIAN : ${formatRupiah(receiptOrder.change_amount || 0)}\n`
      text += '================================\n'
      text += '\x1B\x61\x01' // Align Center
      text += 'Terima Kasih Atas Kunjungan Anda!\n\n\n\n'

      await writeChar.writeValue(encoder.encode(text))
      alert('✅ Struk berhasil dikirim ke printer!')
    } catch (err: any) {
      alert('Gagal cetak Bluetooth: ' + err.message)
    } finally {
      setIsPrintingBluetooth(false)
    }
  }

  // Tampilan Login Kunci PIN
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 p-8 rounded-3xl max-w-sm w-full shadow-2xl text-center">
          <div className="w-16 h-16 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl font-bold">
            🔒
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Akses Kasir</h1>
          <p className="text-slate-400 text-xs mb-6">Masukkan PIN keamanan kasir</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              maxLength={4}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="PIN (Default: 1234)"
              className="w-full text-center tracking-[1em] text-2xl font-bold py-3 bg-slate-900 border border-slate-700 rounded-2xl text-white focus:outline-none focus:border-blue-500"
              autoFocus
            />
            {pinError && <p className="text-rose-400 text-xs">PIN salah! Gunakan 1234.</p>}
            <button
              type="submit"
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg transition-all"
            >
              Masuk Kasir
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Kembalian modal bayar riwayat
  const payingOrderTotal = Number(payingOrder?.total_amount || 0)
  const payingOrderChange = Math.max(0, Number(payingCash || 0) - payingOrderTotal)

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      {/* Header Kasir */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex justify-between items-center sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-white text-xl shadow">
            🛒
          </div>
          <div>
            <h1 className="font-bold text-lg text-slate-900 leading-tight">Kasir Pintar POS</h1>
            <p className="text-xs text-slate-500">Sistem Kasir & Cetak Struk Realtime</p>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('pos')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'pos' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🛒 Kasir Langsung (POS)
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'orders' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📋 Pesanan Masuk
            <span className="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
              {orders.filter((o) => o.status !== 'Lunas' && o.status !== 'Selesai').length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'history' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📜 Riwayat Transaksi
          </button>
        </div>

        <button
          onClick={() => setIsAuthenticated(false)}
          className="text-xs font-semibold bg-slate-100 hover:bg-rose-50 hover:text-rose-600 border border-slate-300 px-3.5 py-2 rounded-xl text-slate-700 transition-all"
        >
          🔒 Kunci
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
        {/* ================= TAB 1: KASIR POS LANGSUNG ================= */}
        {activeTab === 'pos' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Katalog Menu (7 Kolom) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-extrabold text-slate-800">Daftar Menu</h2>
                <span className="text-xs text-slate-500">{menuItems.length} Menu Tersedia</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {menuItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className="bg-white border border-slate-200 hover:border-blue-500 p-4 rounded-2xl cursor-pointer transition-all hover:shadow-md flex flex-col justify-between"
                  >
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{item.name || item.nama}</h4>
                      <p className="text-[11px] text-slate-500 line-clamp-2 mt-1">{item.description}</p>
                    </div>
                    <div className="mt-4 flex justify-between items-center">
                      <span className="font-extrabold text-blue-600 text-sm">
                        {formatRupiah(Number(item.price || item.harga || 0))}
                      </span>
                      <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white font-bold flex items-center justify-center text-sm transition-colors">
                        +
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Panel Transaksi Kasir (5 Kolom) */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-3xl p-5 shadow-lg space-y-4 sticky top-20">
              <h3 className="font-extrabold text-xl text-slate-900 pb-2 border-b border-slate-100">Transaksi Kasir</h3>

              {/* Input Nama & Meja */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">👤 Nama Pelanggan / No. Meja:</label>
                <input
                  type="text"
                  placeholder="Contoh: Meja 05 / Pak Budi"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>

              {/* List Keranjang */}
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-sm"
                  >
                    <div className="flex-1 pr-2">
                      <p className="font-bold text-slate-900 text-xs">{item.name || item.nama}</p>
                      <p className="text-[11px] text-slate-500">
                        {item.qty} × {formatRupiah(Number(item.price || item.harga || 0))}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateCartQty(item.id, -1)}
                        className="w-6 h-6 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-600 font-bold text-xs flex items-center justify-center"
                      >
                        -
                      </button>
                      <span className="font-bold text-xs w-5 text-center">{item.qty}</span>
                      <button
                        onClick={() => updateCartQty(item.id, 1)}
                        className="w-6 h-6 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-600 font-bold text-xs flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}

                {cart.length === 0 && (
                  <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl">
                    <p className="text-xs text-slate-400">Keranjang masih kosong</p>
                  </div>
                )}
              </div>

              {/* Total Tagihan */}
              <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                <span className="text-base font-extrabold text-slate-800">Total Tagihan:</span>
                <span className="text-2xl font-black text-blue-600">{formatRupiah(totalTagihan)}</span>
              </div>

              {/* Pilihan Metode Bayar */}
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('Tunai')}
                  className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    paymentMethod === 'Tunai' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  💵 Tunai (Cash)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('QRIS')
                    setUangDiterima(totalTagihan)
                  }}
                  className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    paymentMethod === 'QRIS' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  📱 QRIS
                </button>
              </div>

              {paymentMethod === 'Tunai' && (
                <div className="space-y-3">
                  {/* Tombol Cepat Uang */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[11px] font-bold text-slate-600">Tambah Pecahan Uang:</span>
                      <button
                        type="button"
                        onClick={() => setUangDiterima(0)}
                        className="text-[11px] text-rose-500 font-bold hover:underline flex items-center gap-1"
                      >
                        🔄 Reset (0)
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setUangDiterima(totalTagihan)}
                        className="py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-700 font-bold rounded-xl text-xs"
                      >
                        💵 Uang Pas
                      </button>
                      <button
                        type="button"
                        onClick={() => setUangDiterima((prev) => prev + 10000)}
                        className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs"
                      >
                        + 10.000
                      </button>
                      <button
                        type="button"
                        onClick={() => setUangDiterima((prev) => prev + 20000)}
                        className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs"
                      >
                        + 20.000
                      </button>
                      <button
                        type="button"
                        onClick={() => setUangDiterima((prev) => prev + 50000)}
                        className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs"
                      >
                        + 50.000
                      </button>
                      <button
                        type="button"
                        onClick={() => setUangDiterima((prev) => prev + 100000)}
                        className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs"
                      >
                        + 100.000
                      </button>
                      <button
                        type="button"
                        onClick={() => setUangDiterima((prev) => prev + 1000)}
                        className="py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs"
                      >
                        + 1.000
                      </button>
                    </div>
                  </div>

                  {/* Input Uang Diterima */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Uang Diterima (Rp):</label>
                    <input
                      type="number"
                      value={uangDiterima || ''}
                      onChange={(e) => setUangDiterima(Number(e.target.value))}
                      placeholder="Masukkan nominal uang..."
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 font-black text-xl focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Badge Terbilang */}
                  {uangDiterima > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-xs text-blue-700 font-medium italic flex items-center gap-1.5">
                      <span>🔔</span>
                      <span>Terbilang: {terbilang(uangDiterima)}</span>
                    </div>
                  )}

                  {/* Kotak Kembalian Real-Time */}
                  <div className="bg-slate-50 border border-slate-300 p-3 rounded-xl flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-600">Kembalian:</span>
                    <span className={`text-lg font-black ${kembalian > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                      {formatRupiah(kembalian)}
                    </span>
                  </div>
                </div>
              )}

              {/* 2 Opsi Tombol Selesai */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleCheckoutPOS(false)}
                  disabled={cart.length === 0 || (paymentMethod === 'Tunai' && uangDiterima < totalTagihan)}
                  className="py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold rounded-xl text-xs transition-all shadow"
                >
                  ✓ Bayar & Selesai
                  <span className="block text-[10px] font-normal opacity-80">(Tanpa Struk)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCheckoutPOS(true)}
                  disabled={cart.length === 0 || (paymentMethod === 'Tunai' && uangDiterima < totalTagihan)}
                  className="py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold rounded-xl text-xs transition-all shadow flex flex-col items-center justify-center"
                >
                  <span>Bayar & Cetak Struk 📄</span>
                  <span className="text-[10px] font-normal opacity-80">(Bluetooth / Print)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: DAFTAR ANTRIAN & PESANAN MASUK ================= */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Antrean Pesanan Masuk</h2>
                <p className="text-xs text-slate-500">Kelola status dan terima pembayaran pesanan pelanggan</p>
              </div>
              <button
                onClick={fetchData}
                className="px-4 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                🔄 Refresh
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {orders
                .filter((o) => o.status !== 'Lunas' && o.status !== 'Selesai')
                .map((order) => (
                  <div key={order.id} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-md flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          Meja: {order.table_number || '-'}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(order.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <h4 className="font-extrabold text-slate-900 text-base">{order.customer_name || 'Pelanggan'}</h4>

                      {/* Items */}
                      <div className="divide-y divide-slate-100 my-3 py-2 border-y border-slate-100 text-xs space-y-1.5">
                        {order.order_items?.map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between pt-1">
                            <span className="text-slate-700">
                              {item.quantity}× {item.menu_items?.name || 'Item'}
                            </span>
                            <span className="font-bold text-slate-900">
                              {formatRupiah(Number(item.price_per_unit || 0) * item.quantity)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-bold text-slate-500">Total Tagihan:</span>
                        <span className="text-lg font-black text-blue-600">{formatRupiah(order.total_amount)}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => openPayOrderModal(order)}
                      className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-2xl text-xs shadow"
                    >
                      💵 Bayar / Selesaikan Pesanan
                    </button>
                  </div>
                ))}

              {orders.filter((o) => o.status !== 'Lunas' && o.status !== 'Selesai').length === 0 && (
                <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-dashed border-slate-200">
                  <p className="text-sm text-slate-400">Tidak ada antrean pesanan yang belum lunas. 🎉</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: RIWAYAT TRANSAKSI ================= */}
        {activeTab === 'history' && (
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-md">
            <h3 className="font-bold text-lg text-slate-800 mb-4">Riwayat Semua Transaksi</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                  <tr>
                    <th className="p-3">Waktu</th>
                    <th className="p-3">Pelanggan</th>
                    <th className="p-3">Meja</th>
                    <th className="p-3">Total</th>
                    <th className="p-3">Metode</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50">
                      <td className="p-3 text-slate-500">
                        {new Date(order.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="p-3 font-bold text-slate-900">{order.customer_name || '-'}</td>
                      <td className="p-3">{order.table_number || '-'}</td>
                      <td className="p-3 font-extrabold text-blue-600">{formatRupiah(order.total_amount)}</td>
                      <td className="p-3">{order.payment_method || 'Tunai'}</td>
                      <td className="p-3">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {order.status || 'Lunas'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => setReceiptOrder(order)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-bold text-[11px]"
                        >
                          🧾 Cetak Ulang
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ================= MODAL BAYAR PESANAN DARI RIWAYAT ================= */}
      {payingOrder && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-black text-lg text-slate-900">Pembayaran Pesanan</h3>
                <p className="text-xs text-slate-500">
                  Meja: {payingOrder.table_number || '-'} • {payingOrder.customer_name || 'Pelanggan'}
                </p>
              </div>
              <button
                onClick={() => setPayingOrder(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Total Tagihan */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-600">Total Tagihan:</span>
                <span className="text-2xl font-black text-blue-600">{formatRupiah(payingOrderTotal)}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 italic">{terbilang(payingOrderTotal)}</p>
            </div>

            {/* Input Nominal Diterima */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Uang Diterima (Rp):</label>
              <input
                type="number"
                value={payingCash || ''}
                onChange={(e) => setPayingCash(Number(e.target.value))}
                placeholder="Nominal uang..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xl font-black text-slate-900 focus:outline-none focus:border-blue-500"
                autoFocus
              />

              {/* Tombol Cepat */}
              <div className="grid grid-cols-3 gap-1.5 mt-2">
                <button
                  type="button"
                  onClick={() => setPayingCash(payingOrderTotal)}
                  className="py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-700 font-bold rounded-lg text-xs"
                >
                  Uang Pas
                </button>
                <button
                  type="button"
                  onClick={() => setPayingCash((prev) => prev + 20000)}
                  className="py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-xs"
                >
                  + 20.000
                </button>
                <button
                  type="button"
                  onClick={() => setPayingCash((prev) => prev + 50000)}
                  className="py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-xs"
                >
                  + 50.000
                </button>
                <button
                  type="button"
                  onClick={() => setPayingCash((prev) => prev + 100000)}
                  className="py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-xs"
                >
                  + 100.000
                </button>
                <button
                  type="button"
                  onClick={() => setPayingCash(100000)}
                  className="py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-xs"
                >
                  Pas 100k
                </button>
                <button
                  type="button"
                  onClick={() => setPayingCash(0)}
                  className="py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 font-bold rounded-lg text-xs"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Kotak Kembalian Real-Time */}
            <div
              className={`p-3.5 rounded-2xl border ${
                payingCash >= payingOrderTotal
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold">Uang Kembalian:</span>
                <span className="text-xl font-black">{formatRupiah(payingOrderChange)}</span>
              </div>
              {payingCash >= payingOrderTotal && (
                <p className="text-[11px] text-emerald-600 mt-1 italic">{terbilang(payingOrderChange)}</p>
              )}
              {payingCash < payingOrderTotal && (
                <p className="text-[11px] text-rose-600 mt-1">Uang kurang: {formatRupiah(payingOrderTotal - payingCash)}</p>
              )}
            </div>

            {/* Tombol Selesai / Struk */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleCompleteOrderPayment(false)}
                disabled={payingCash < payingOrderTotal}
                className="py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold rounded-xl text-xs shadow"
              >
                ✓ Selesai Saja
              </button>

              <button
                type="button"
                onClick={() => handleCompleteOrderPayment(true)}
                disabled={payingCash < payingOrderTotal}
                className="py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold rounded-xl text-xs shadow"
              >
                🧾 Selesai & Cetak Struk
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL CETAK STRUK ================= */}
      {receiptOrder && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            {/* Template Struk */}
            <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl font-mono text-xs text-slate-800">
              <div className="text-center mb-3">
                <h4 className="font-extrabold text-sm">WARUNG KOPI / KASIR</h4>
                <p className="text-[10px] text-slate-500">Struk Pembayaran Sah</p>
                <div className="border-b border-dashed border-slate-300 my-2"></div>
              </div>

              <div className="space-y-1 mb-2 text-[11px]">
                <div className="flex justify-between">
                  <span>Meja:</span>
                  <span className="font-bold">{receiptOrder.table_number || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pelanggan:</span>
                  <span>{receiptOrder.customer_name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Waktu:</span>
                  <span>{new Date(receiptOrder.created_at || Date.now()).toLocaleTimeString('id-ID')}</span>
                </div>
              </div>

              <div className="border-b border-dashed border-slate-300 my-2"></div>

              <div className="space-y-1.5 my-2">
                {receiptOrder.order_items?.map((item: any, idx: number) => (
                  <div key={idx}>
                    <div className="font-semibold text-slate-900">{item.menu_items?.name || item.name || 'Item'}</div>
                    <div className="flex justify-between text-slate-500 text-[11px]">
                      <span>
                        {item.quantity || item.qty} × {formatRupiah(Number(item.price_per_unit || item.price || 0))}
                      </span>
                      <span className="font-bold text-slate-900">
                        {formatRupiah((item.quantity || item.qty) * Number(item.price_per_unit || item.price || 0))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-b border-dashed border-slate-300 my-2"></div>

              <div className="space-y-1 font-bold">
                <div className="flex justify-between text-sm text-slate-900">
                  <span>TOTAL:</span>
                  <span>{formatRupiah(receiptOrder.total_amount)}</span>
                </div>
                <div className="flex justify-between font-normal text-slate-600">
                  <span>Tunai:</span>
                  <span>{formatRupiah(receiptOrder.cash_received || receiptOrder.total_amount)}</span>
                </div>
                <div className="flex justify-between font-normal text-slate-600">
                  <span>Kembalian:</span>
                  <span>{formatRupiah(receiptOrder.change_amount || 0)}</span>
                </div>
              </div>

              <div className="text-center mt-4 pt-2 border-t border-dashed border-slate-300 text-[10px] text-slate-500">
                Terima Kasih Atas Kunjungan Anda!
              </div>
            </div>

            {/* Tombol Cetak */}
            <div className="space-y-2">
              <button
                onClick={printBluetooth}
                disabled={isPrintingBluetooth}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow flex items-center justify-center gap-2"
              >
                📶 {isPrintingBluetooth ? 'Menghubungkan...' : 'Cetak via Bluetooth Thermal'}
              </button>

              <button
                onClick={() => window.print()}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                🖨️ Cetak Standar / Simpan PDF
              </button>

              <button
                onClick={() => setReceiptOrder(null)}
                className="w-full py-2 text-slate-400 hover:text-slate-600 text-xs font-semibold"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
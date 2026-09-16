'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

// Inisialisasi Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rmtinkpblyzbyazbmnia.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtdGlua3BibHl6YnlhemJtbmlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzczMDY0NDEsImV4cCI6MjA1Mjg4MjQ0MX0.m9V_0qXy98G9ZqQe-t5Q_wQp7eK3N9e1p6F-qR7wYxM'
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Format Rupiah
const formatRupiah = (number: number) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(number || 0)
}

// Konversi Angka ke Terbilang Bahasa Indonesia
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

export default function KasirDashboard() {
  // Autentikasi PIN
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)

  // Data & State
  const [activeTab, setActiveTab] = useState<'pos' | 'orders' | 'history'>('orders')
  const [orders, setOrders] = useState<any[]>([])
  const [menuItems, setMenuItems] = useState<any[]>([])
  const [cart, setCart] = useState<any[]>([])
  const [customerName, setCustomerName] = useState('')
  const [tableNumber, setTableNumber] = useState('')
  
  // State Pembayaran di POS
  const [posCashReceived, setPosCashReceived] = useState<number>(0)
  
  // State Pembayaran dari Riwayat Pesanan
  const [payingOrder, setPayingOrder] = useState<any | null>(null)
  const [payingCash, setPayingCash] = useState<number>(0)

  // State Modal Struk
  const [receiptOrder, setReceiptOrder] = useState<any | null>(null)
  const [isPrintingBluetooth, setIsPrintingBluetooth] = useState(false)

  // Web Audio Alarm untuk Pesanan Baru
  const playNotificationSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime) // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15) // A5
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start()
      osc.stop(audioCtx.currentTime + 0.4)
    } catch (e) {
      console.log('Audio not allowed yet')
    }
  }

  // Load Menu & Pesanan
  const fetchMenu = async () => {
    const { data } = await supabase.from('menu_items').select('*').order('name')
    if (data) setMenuItems(data)
  }

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*, menu_items(*))')
      .order('created_at', { ascending: false })
    if (data) setOrders(data)
  }

  useEffect(() => {
    fetchMenu()
    fetchOrders()

    // Realtime subscription
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          fetchOrders()
          if (payload.eventType === 'INSERT') {
            playNotificationSound()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Handler Login PIN (Default: 1234)
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

  // Handler POS Langsung
  const addToCart = (item: any) => {
    const existing = cart.find(i => i.id === item.id)
    if (existing) {
      setCart(cart.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i))
    } else {
      setCart([...cart, { ...item, qty: 1 }])
    }
  }

  const updateCartQty = (id: string, delta: number) => {
    setCart(cart.map(i => {
      if (i.id === id) {
        const newQty = i.qty + delta
        return newQty > 0 ? { ...i, qty: newQty } : null
      }
      return i
    }).filter(Boolean))
  }

  const cartTotal = cart.reduce((sum, item) => sum + (Number(item.price) * item.qty), 0)
  const posKembalian = Math.max(0, posCashReceived - cartTotal)

  // Submit Order dari Tab POS
  const handlePosCheckout = async (withReceipt: boolean) => {
    if (cart.length === 0) return alert('Keranjang masih kosong!')
    if (posCashReceived < cartTotal) return alert('Uang pembayaran masih kurang!')

    try {
      // 1. Simpan order baru
      const { data: newOrder, error: orderErr } = await supabase
        .from('orders')
        .insert({
          customer_name: customerName || 'Pelanggan Kasir',
          table_number: tableNumber || 'Kasir',
          total_amount: cartTotal,
          status: 'Lunas',
          payment_method: 'Tunai',
          cash_received: posCashReceived,
          change_amount: posKembalian
        })
        .select()
        .single()

      if (orderErr) throw orderErr

      // 2. Simpan order items
      const itemsToInsert = cart.map(item => ({
        order_id: newOrder.id,
        menu_item_id: item.id,
        quantity: item.qty,
        price_per_unit: item.price,
        subtotal: item.price * item.qty
      }))

      await supabase.from('order_items').insert(itemsToInsert)

      // Reset form POS
      setCart([])
      setCustomerName('')
      setTableNumber('')
      const finalPaid = posCashReceived
      setPosCashReceived(0)

      // Refresh data
      await fetchOrders()

      if (withReceipt) {
        setReceiptOrder({
          ...newOrder,
          order_items: cart.map(c => ({
            quantity: c.qty,
            price_per_unit: c.price,
            menu_items: { name: c.name }
          })),
          cash_received: finalPaid,
          change_amount: finalPaid - cartTotal
        })
      } else {
        alert('✅ Pembayaran Berhasil Disimpan!')
      }
    } catch (err: any) {
      alert('Gagal memproses pesanan: ' + err.message)
    }
  }

  // Update Status Pesanan di Tab Riwayat
  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
    fetchOrders()
  }

  // Buka Modal Pembayaran untuk Pesanan dari Riwayat
  const openPayModal = (order: any) => {
    setPayingOrder(order)
    setPayingCash(Number(order.total_amount || 0)) // Default set ke Uang Pas
  }

  // Selesaikan Pembayaran dari Modal Riwayat (Dengan Opsi Struk / Tanpa Struk)
  const handleCompletePayment = async (withReceipt: boolean) => {
    if (!payingOrder) return
    const total = Number(payingOrder.total_amount || 0)
    if (payingCash < total) {
      return alert('Uang diterima kurang dari total tagihan!')
    }

    const kembalian = Math.max(0, payingCash - total)

    // Update status ke Lunas dan catat uang diterima & kembalian
    await supabase.from('orders').update({
      status: 'Lunas',
      cash_received: payingCash,
      change_amount: kembalian
    }).eq('id', payingOrder.id)

    await fetchOrders()

    const orderToPrint = {
      ...payingOrder,
      cash_received: payingCash,
      change_amount: kembalian
    }

    setPayingOrder(null)
    setPayingCash(0)

    if (withReceipt) {
      setReceiptOrder(orderToPrint)
    } else {
      alert('✅ Pesanan berhasil diselesaikan & ditandai Lunas!')
    }
  }

  // Cetak Bluetooth ESC/POS Thermal Printer (58mm)
  const printViaBluetooth = async () => {
    if (!receiptOrder) return
    setIsPrintingBluetooth(true)

    try {
      const nav: any = navigator
      if (!nav.bluetooth) {
        alert('Browser Anda tidak mendukung Web Bluetooth. Silakan gunakan Google Chrome di Android / PC.')
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

      if (!writeChar) {
        throw new Error('Karakteristik printer Bluetooth tidak ditemukan.')
      }

      // Format Teks ESC/POS
      const encoder = new TextEncoder()
      let text = '\x1B\x40' // Init printer
      text += '\x1B\x61\x01' // Align Center
      text += 'WARUNG KOPI / KASIR\n'
      text += 'Struk Pembayaran\n'
      text += '--------------------------------\n'
      text += '\x1B\x61\x00' // Align Left
      text += `No. Meja  : ${receiptOrder.table_number || '-'}\n`
      text += `Pelanggan : ${receiptOrder.customer_name || '-'}\n`
      text += `Waktu     : ${new Date(receiptOrder.created_at || Date.now()).toLocaleTimeString('id-ID')}\n`
      text += '--------------------------------\n'

      receiptOrder.order_items?.forEach((item: any) => {
        const name = item.menu_items?.name || 'Item'
        const qty = item.quantity || 1
        const price = Number(item.price_per_unit || 0)
        text += `${name}\n`
        text += `  ${qty}x ${formatRupiah(price).padEnd(12)} = ${formatRupiah(qty * price)}\n`
      })

      text += '--------------------------------\n'
      text += `TOTAL       : ${formatRupiah(receiptOrder.total_amount)}\n`
      text += `TUNAI       : ${formatRupiah(receiptOrder.cash_received || receiptOrder.total_amount)}\n`
      text += `KEMBALIAN   : ${formatRupiah(receiptOrder.change_amount || 0)}\n`
      text += '--------------------------------\n'
      text += '\x1B\x61\x01' // Align Center
      text += 'Terima Kasih Atas Kunjungan Anda!\n\n\n\n'

      const dataBytes = encoder.encode(text)
      await writeChar.writeValue(dataBytes)
      alert('✅ Berhasil mengirim cetak ke Printer Bluetooth!')
    } catch (err: any) {
      console.error(err)
      alert('Gagal cetak Bluetooth: ' + err.message)
    } finally {
      setIsPrintingBluetooth(false)
    }
  }

  // Cetak Standar Browser / PDF
  const printStandard = () => {
    window.print()
  }

  // Screen Kunci PIN
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 p-8 rounded-2xl max-w-sm w-full shadow-2xl text-center">
          <div className="w-16 h-16 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
            🔒
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Akses Kasir</h1>
          <p className="text-slate-400 text-sm mb-6">Masukkan PIN keamanan untuk masuk</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              maxLength={4}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="PIN (Default: 1234)"
              className="w-full text-center tracking-[1em] text-2xl font-bold py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-amber-500"
              autoFocus
            />
            {pinError && <p className="text-rose-500 text-sm">PIN salah, silakan coba lagi (1234).</p>}
            <button
              type="submit"
              className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl shadow-lg transition-all"
            >
              Masuk Dashboard
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Menghitung kembalian modal bayar secara real-time
  const payingTotal = Number(payingOrder?.total_amount || 0)
  const payingKembalian = Math.max(0, Number(payingCash || 0) - payingTotal)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center font-bold text-slate-950 text-xl shadow-lg">
            ⚡
          </div>
          <div>
            <h1 className="font-bold text-lg text-white">Kasir Smart POS</h1>
            <p className="text-xs text-slate-400">Mode Kasir Aktif • PIN Keamanan Terkunci</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'orders' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            📋 Pesanan Masuk
            <span className="bg-slate-900 text-white text-xs px-2 py-0.5 rounded-full border border-slate-700">
              {orders.filter(o => o.status !== 'Lunas' && o.status !== 'Selesai').length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('pos')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'pos' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            🛒 Kasir Langsung (POS)
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'history' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            📜 Riwayat Transaksi
          </button>
        </div>

        <button
          onClick={() => setIsAuthenticated(false)}
          className="text-xs bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 border border-slate-700 px-3 py-2 rounded-lg text-slate-300 transition-all"
        >
          🔒 Kunci Kasir
        </button>
      </header>

      {/* Konten Utama Berdasarkan Tab */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
        {/* ================= TAB 1: PESANAN MASUK ================= */}
        {activeTab === 'orders' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">Daftar Antrean & Pembayaran</h2>
                <p className="text-sm text-slate-400">Kelola status pesanan dari pelanggan atau terima pembayaran di sini</p>
              </div>
              <button
                onClick={fetchOrders}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-medium rounded-xl flex items-center gap-2"
              >
                🔄 Refresh
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {orders
                .filter(o => o.status !== 'Lunas' && o.status !== 'Selesai')
                .map((order) => (
                  <div
                    key={order.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Meja {order.table_number || '-'}
                          </span>
                          <h3 className="font-bold text-lg text-white mt-1">{order.customer_name || 'Pelanggan'}</h3>
                        </div>
                        <span className="text-xs text-slate-400">
                          {new Date(order.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Item List */}
                      <div className="space-y-2 py-3 border-y border-slate-800 my-3 text-sm">
                        {order.order_items?.map((item: any, idx: number) => (
                          <div key={idx} className="flex justify-between text-slate-300">
                            <span>{item.quantity}x {item.menu_items?.name || 'Item'}</span>
                            <span className="font-medium text-slate-400">{formatRupiah(Number(item.price_per_unit) * item.quantity)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between items-center mb-4">
                        <span className="text-slate-400 text-sm">Total Tagihan:</span>
                        <span className="text-lg font-extrabold text-amber-400">{formatRupiah(order.total_amount)}</span>
                      </div>
                    </div>

                    {/* Tombol Aksi Pesanan */}
                    <div className="space-y-2 pt-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleUpdateStatus(order.id, 'Sedang Dimasak')}
                          className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                            order.status === 'Sedang Dimasak'
                              ? 'bg-blue-600 border-blue-500 text-white'
                              : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          👨‍🍳 Dimasak
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(order.id, 'Siap Disajikan')}
                          className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                            order.status === 'Siap Disajikan'
                              ? 'bg-emerald-600 border-emerald-500 text-white'
                              : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          🍽️ Siap
                        </button>
                      </div>

                      {/* Tombol Bayar / Selesaikan */}
                      <button
                        onClick={() => openPayModal(order)}
                        className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 text-sm"
                      >
                        💵 Bayar / Selesaikan Pesanan
                      </button>
                    </div>
                  </div>
                ))}

              {orders.filter(o => o.status !== 'Lunas' && o.status !== 'Selesai').length === 0 && (
                <div className="col-span-full py-16 text-center bg-slate-900/50 rounded-2xl border border-slate-800">
                  <p className="text-slate-400">Tidak ada antrean pesanan yang belum lunas. 🎉</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: KASIR LANGSUNG (POS) ================= */}
        {activeTab === 'pos' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Katalog Menu */}
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-xl font-bold text-white">Katalog Menu</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {menuItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 p-4 rounded-2xl cursor-pointer transition-all hover:scale-[1.02] flex flex-col justify-between shadow-md"
                  >
                    <div>
                      <h4 className="font-bold text-white text-base">{item.name}</h4>
                      <p className="text-xs text-slate-400 line-clamp-2 mt-1">{item.description}</p>
                    </div>
                    <div className="mt-4 flex justify-between items-center">
                      <span className="font-bold text-amber-400 text-sm">{formatRupiah(item.price)}</span>
                      <span className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 font-bold flex items-center justify-center text-sm shadow">
                        +
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Keranjang & Checkout POS */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col justify-between h-fit">
              <div>
                <h3 className="font-bold text-lg text-white mb-4 pb-2 border-b border-slate-800">Keranjang Kasir</h3>
                
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <input
                    type="text"
                    placeholder="Nama Pelanggan"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                  <input
                    type="text"
                    placeholder="No. Meja / Takeaway"
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Items in Cart */}
                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {cart.map((item) => (
                    <div key={item.id} className="flex justify-between items-center bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-sm">
                      <div className="flex-1 pr-2">
                        <p className="font-medium text-white">{item.name}</p>
                        <p className="text-xs text-amber-400">{formatRupiah(item.price)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateCartQty(item.id, -1)}
                          className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                        >
                          -
                        </button>
                        <span className="font-bold w-4 text-center">{item.qty}</span>
                        <button
                          onClick={() => updateCartQty(item.id, 1)}
                          className="w-7 h-7 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                  {cart.length === 0 && (
                    <p className="text-center text-slate-500 text-sm py-6">Keranjang masih kosong</p>
                  )}
                </div>

                {/* Summary Total */}
                <div className="border-t border-slate-800 pt-4 mt-4 space-y-3">
                  <div className="flex justify-between items-center text-base">
                    <span className="text-slate-400">Total Tagihan:</span>
                    <span className="text-xl font-extrabold text-amber-400">{formatRupiah(cartTotal)}</span>
                  </div>

                  {/* Input Uang Tunai Diterima */}
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Uang Diterima Kasir:</label>
                    <input
                      type="number"
                      value={posCashReceived || ''}
                      onChange={(e) => setPosCashReceived(Number(e.target.value))}
                      placeholder="Masukkan nominal..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white font-bold text-lg focus:outline-none focus:border-amber-500"
                    />

                    {/* Tombol Cepat Nominal */}
                    <div className="grid grid-cols-4 gap-1.5 mt-2">
                      <button
                        onClick={() => setPosCashReceived(cartTotal)}
                        className="py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg text-xs font-semibold"
                      >
                        Pas
                      </button>
                      <button
                        onClick={() => setPosCashReceived(prev => prev + 20000)}
                        className="py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold"
                      >
                        +20k
                      </button>
                      <button
                        onClick={() => setPosCashReceived(prev => prev + 50000)}
                        className="py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold"
                      >
                        +50k
                      </button>
                      <button
                        onClick={() => setPosCashReceived(prev => prev + 100000)}
                        className="py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold"
                      >
                        +100k
                      </button>
                    </div>
                  </div>

                  {/* Uang Kembalian */}
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                    <span className="text-xs text-slate-400">Kembalian:</span>
                    <span className={`text-base font-bold ${posKembalian >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                      {formatRupiah(posKembalian)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tombol Checkout POS (2 Opsi) */}
              <div className="grid grid-cols-2 gap-2 mt-4">
                <button
                  onClick={() => handlePosCheckout(false)}
                  disabled={cart.length === 0 || posCashReceived < cartTotal}
                  className="py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all shadow"
                >
                  ✓ Selesai Saja
                </button>
                <button
                  onClick={() => handlePosCheckout(true)}
                  disabled={cart.length === 0 || posCashReceived < cartTotal}
                  className="py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs transition-all shadow flex items-center justify-center gap-1"
                >
                  🧾 Selesai & Struk
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: RIWAYAT TRANSAKSI ================= */}
        {activeTab === 'history' && (
          <div>
            <h2 className="text-xl font-bold text-white mb-4">Semua Riwayat Transaksi</h2>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-4">Waktu</th>
                    <th className="p-4">Pelanggan</th>
                    <th className="p-4">Meja</th>
                    <th className="p-4">Total</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-800/40">
                      <td className="p-4 text-slate-400">
                        {new Date(order.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="p-4 font-semibold text-white">{order.customer_name || '-'}</td>
                      <td className="p-4">{order.table_number || '-'}</td>
                      <td className="p-4 font-bold text-amber-400">{formatRupiah(order.total_amount)}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          order.status === 'Lunas' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {order.status || 'Menunggu'}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => setReceiptOrder(order)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium rounded-lg text-slate-200"
                        >
                          🧾 Cetak Ulang Struk
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

      {/* ================= MODAL PEMBAYARAN DARI RIWAYAT ================= */}
      {payingOrder && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5">
            {/* Header Modal */}
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <div>
                <h3 className="font-bold text-xl text-white">Pembayaran Pesanan</h3>
                <p className="text-xs text-slate-400">
                  Meja {payingOrder.table_number || '-'} • {payingOrder.customer_name || 'Pelanggan'}
                </p>
              </div>
              <button
                onClick={() => setPayingOrder(null)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Rincian Tagihan */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Total Tagihan:</span>
                <span className="text-2xl font-black text-amber-400">{formatRupiah(payingTotal)}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 italic">{terbilang(payingTotal)}</p>
            </div>

            {/* Input Uang Kasir & Kalkulator Kembalian */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300">Uang Diterima Kasir (Rp):</label>
              <input
                type="number"
                value={payingCash || ''}
                onChange={(e) => setPayingCash(Number(e.target.value))}
                placeholder="Masukkan nominal uang..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-xl font-bold text-white focus:outline-none focus:border-amber-500"
                autoFocus
              />

              {/* Tombol Cepat Penambahan Uang */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPayingCash(payingTotal)}
                  className="py-2 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-bold hover:bg-amber-500/30"
                >
                  Uang Pas
                </button>
                <button
                  type="button"
                  onClick={() => setPayingCash(prev => prev + 20000)}
                  className="py-2 bg-slate-800 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-700"
                >
                  +20.000
                </button>
                <button
                  type="button"
                  onClick={() => setPayingCash(prev => prev + 50000)}
                  className="py-2 bg-slate-800 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-700"
                >
                  +50.000
                </button>
                <button
                  type="button"
                  onClick={() => setPayingCash(prev => prev + 100000)}
                  className="py-2 bg-slate-800 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-700"
                >
                  +100.000
                </button>
                <button
                  type="button"
                  onClick={() => setPayingCash(100000)}
                  className="py-2 bg-slate-800 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-700"
                >
                  Pas 100k
                </button>
                <button
                  type="button"
                  onClick={() => setPayingCash(0)}
                  className="py-2 bg-rose-500/20 border border-rose-500/40 text-rose-400 rounded-xl text-xs font-bold hover:bg-rose-500/30"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Kotak Uang Kembalian Real-Time */}
            <div className={`p-4 rounded-2xl border ${
              payingCash >= payingTotal
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-400'
            }`}>
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-300">Uang Kembalian:</span>
                <span className="text-2xl font-black">{formatRupiah(payingKembalian)}</span>
              </div>
              {payingCash >= payingTotal && (
                <p className="text-xs text-emerald-300/80 mt-1 italic">{terbilang(payingKembalian)}</p>
              )}
              {payingCash < payingTotal && (
                <p className="text-xs text-rose-400 mt-1">Uang kurang: {formatRupiah(payingTotal - payingCash)}</p>
              )}
            </div>

            {/* 2 Opsi Tombol Selesai */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleCompletePayment(false)}
                disabled={payingCash < payingTotal}
                className="py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition-all shadow-lg flex flex-col items-center justify-center"
              >
                <span>✓ Selesai</span>
                <span className="text-[10px] font-normal opacity-80">(Tanpa Struk)</span>
              </button>

              <button
                type="button"
                onClick={() => handleCompletePayment(true)}
                disabled={payingCash < payingTotal}
                className="py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-40 text-slate-950 font-bold rounded-xl text-sm transition-all shadow-lg flex flex-col items-center justify-center"
              >
                <span>🧾 Selesaikan</span>
                <span className="text-[10px] font-normal opacity-90">& Cetak Struk</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL CETAK STRUK ================= */}
      {receiptOrder && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl">
            {/* Tampilan Struk */}
            <div className="bg-white text-black p-5 rounded-2xl font-mono text-xs shadow-inner mb-5">
              <div className="text-center mb-3">
                <h4 className="font-bold text-base">WARUNG KOPI / KASIR</h4>
                <p className="text-[10px] text-gray-600">Jl. Utama No. 123 • Telp: 0812-xxxx</p>
                <div className="border-b border-dashed border-gray-400 my-2"></div>
              </div>

              <div className="space-y-1 mb-2">
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

              <div className="border-b border-dashed border-gray-400 my-2"></div>

              {/* Items */}
              <div className="space-y-1.5 my-2">
                {receiptOrder.order_items?.map((item: any, idx: number) => (
                  <div key={idx}>
                    <div className="font-semibold">{item.menu_items?.name || 'Item'}</div>
                    <div className="flex justify-between text-gray-600">
                      <span>{item.quantity} x {formatRupiah(Number(item.price_per_unit || 0))}</span>
                      <span className="font-bold text-black">{formatRupiah(Number(item.price_per_unit || 0) * item.quantity)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-b border-dashed border-gray-400 my-2"></div>

              <div className="space-y-1 font-bold">
                <div className="flex justify-between text-sm">
                  <span>TOTAL:</span>
                  <span>{formatRupiah(receiptOrder.total_amount)}</span>
                </div>
                <div className="flex justify-between font-normal text-gray-700">
                  <span>Tunai:</span>
                  <span>{formatRupiah(receiptOrder.cash_received || receiptOrder.total_amount)}</span>
                </div>
                <div className="flex justify-between font-normal text-gray-700">
                  <span>Kembalian:</span>
                  <span>{formatRupiah(receiptOrder.change_amount || 0)}</span>
                </div>
              </div>

              <div className="text-center mt-4 pt-2 border-t border-dashed border-gray-400 text-[10px] text-gray-600">
                Terima Kasih Atas Kunjungan Anda!
              </div>
            </div>

            {/* Action Buttons Cetak */}
            <div className="space-y-2">
              <button
                onClick={printViaBluetooth}
                disabled={isPrintingBluetooth}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow flex items-center justify-center gap-2"
              >
                📶 {isPrintingBluetooth ? 'Menghubungkan...' : 'Cetak via Bluetooth Thermal'}
              </button>
              
              <button
                onClick={printStandard}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold rounded-xl text-xs"
              >
                🖨️ Cetak Standar / PDF
              </button>

              <button
                onClick={() => setReceiptOrder(null)}
                className="w-full py-2.5 bg-transparent hover:bg-slate-800 text-slate-400 text-xs font-semibold rounded-xl"
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
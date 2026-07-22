"use client";

import { useState, useRef, useEffect } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";

interface DraftItem {
  productName: string;
  brand: string;
  category: string;
  compatibleVehicle: string;
  quantity: number;
  photoUrl?: string;
}

interface SavedItem extends DraftItem {
  id: string;
  sku: string;
  currentTotalStock: number;
}

export default function VoiceEntryPage() {
  const [barcode, setBarcode] = useState("LOC-A1-S2");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // کالای در حال بررسی (پیش‌نویس)
  const [draftItem, setDraftItem] = useState<DraftItem | null>(null);
  
  // لیست کالاهای نهایی ثبت‌شده
  const [itemsList, setItemsList] = useState<SavedItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // پیشنهادات سریع برای انتخاب راحت‌تر کارگر
  const suggestedBrands = ['تکستار', 'ایساکو', 'عظام', 'کروز', 'دیناپارت', 'امکو', 'والئو', 'بوش'];
  const suggestedCategories = ['سیستم ترمز', 'قطعات موتوری', 'تعلیق و جلوبندی', 'برق و الکترونیک', 'بدنه و تزئینات', 'روغنی و فیلترجات'];
  const suggestedVehicles = ['پراید', 'پژو ۴۰۵', 'پژو ۲۰۶', 'پژو پارس', 'سمند', 'تیبا', 'دنا', 'کوییک'];

  // مدیریت اسکنر بارکد
  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    if (isScannerOpen) {
      scanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 150 } },
        false
      );
      scanner.render(
        (decodedText) => {
          setBarcode(decodedText);
          setIsScannerOpen(false);
          scanner?.clear();
        },
        () => {}
      );
    }
    return () => {
      if (scanner) scanner.clear().catch((err) => console.error(err));
    };
  }, [isScannerOpen]);

  // شروع ضبط صوتی پیوسته
  const startContinuousListening = () => {
    setError(null);
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("لطفاً از مرورگر Google Chrome استفاده کنید.");
      return;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "fa-IR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: any) => {
      let interim = "";
      let finalSpeech = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalSpeech += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      setLiveTranscript(interim || finalSpeech);
      const text = finalSpeech.trim();

      if (text) {
        // اگر کارت پیش‌نویس باز است و کارگر گفت "بعدی" یا "تأیید"
        if (draftItem && (text.includes("بعدی") || text.includes("تایید") || text.includes("ثبت"))) {
          handleConfirmAndNext();
          return;
        }

        // اگر کارت پیش‌نویس باز است و گفت "انصراف" یا "لغو"
        if (draftItem && (text.includes("انصراف") || text.includes("لغو") || text.includes("حذف"))) {
          handleCancelDraft();
          return;
        }

        // اگر کارت پیش‌نویس بسته است، متن را پردازش کن
        if (!draftItem) {
          processVoiceToDraft(text);
        }
      }
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => {
      setIsListening(false);
    };

    try {
      recognition.start();
    } catch (e) {}
  };

  // پردازش صوتی و ساخت پیش‌نویس
  const processVoiceToDraft = async (spokenText: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("http://127.0.0.1:3000/inventory/voice-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationBarcode: barcode,
          text: spokenText,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "خطا در پردازش اطلاعات");

      setDraftItem({
        productName: data.productName,
        brand: data.brand,
        category: data.category,
        compatibleVehicle: data.compatibleVehicle,
        quantity: data.addedQuantity,
      });

      // توقف موقت تشخیص صدا تا کاربر بررسی و تأیید کند
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
    } catch (err: any) {
      setError(err.message || "خطا در ارتباط با سرور");
    } finally {
      setLoading(false);
      setLiveTranscript("");
    }
  };

  // تأیید نهایی و رفتن به کالای بعدی
  const handleConfirmAndNext = () => {
    if (!draftItem) return;

    const newItem: SavedItem = {
      ...draftItem,
      id: Date.now().toString(),
      sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      currentTotalStock: draftItem.quantity,
    };

    setItemsList((prev) => [newItem, ...prev]);
    setDraftItem(null);

    // شروع مجدد خودکار برای کالای بعدی
    setTimeout(() => {
      startContinuousListening();
    }, 500);
  };

  // دکمه انصراف و پاک کردن پیش‌نویس (بازگشت از اول)
  const handleCancelDraft = () => {
    setDraftItem(null);
    setError("عملیات لغو شد. می‌توانید دوباره صحبت کنید.");
    setTimeout(() => {
      startContinuousListening();
    }, 500);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && draftItem) {
      const photoUrl = URL.createObjectURL(file);
      setDraftItem({ ...draftItem, photoUrl });
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 font-sans dir-rtl" dir="rtl">
      {/* هدر */}
      <div className="flex justify-between items-center mb-6 bg-slate-900 text-white p-6 rounded-2xl shadow-md">
        <div>
          <h1 className="text-2xl font-bold">پنل انبارداری هوشمند (ورودی صوتی گام‌به‌گام)</h1>
          <p className="text-slate-400 text-sm mt-1">
            با گفتن کلمات «بعدی» یا «تأیید» کالا را ثبت کنید و با «انصراف» از نو شروع کنید.
          </p>
        </div>

        <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex items-center gap-3">
          <div>
            <span className="text-xs text-slate-400 block">بارکد قفسه</span>
            <input
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="bg-transparent text-orange-400 font-mono font-bold text-lg outline-none w-28"
            />
          </div>
          <button
            onClick={() => setIsScannerOpen(!isScannerOpen)}
            className="bg-orange-500 hover:bg-orange-600 text-white p-2.5 rounded-lg text-xs font-bold transition-all"
          >
            📷 {isScannerOpen ? "بستن" : "اسکن قفسه"}
          </button>
        </div>
      </div>

      {isScannerOpen && (
        <div className="mb-6 p-4 bg-slate-900 text-white rounded-2xl border border-orange-500/50 shadow-xl">
          <div id="reader" className="w-full max-w-sm mx-auto overflow-hidden rounded-xl"></div>
        </div>
      )}

      {/* کنترل ضبط صدا */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="md:col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-gray-800 mb-2">🎤 میکروفن انبار</h3>
            <p className="text-xs text-gray-500 mb-4">برای ثبت قطعه بعدی کلیک کنید.</p>
          </div>

          <button
            onClick={startContinuousListening}
            disabled={isListening || !!draftItem}
            className={`w-full py-4 px-4 rounded-xl text-white font-bold text-lg flex items-center justify-center gap-2 transition-all ${
              isListening
                ? "bg-red-500 animate-pulse shadow-lg"
                : draftItem
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-orange-500 hover:bg-orange-600 shadow-lg"
            }`}
          >
            {isListening ? "🔴 در حال شنیدن..." : draftItem ? "در انتظار تأیید کالا..." : "🎙️ شروع گوش دادن"}
          </button>
        </div>

        <div className="md:col-span-2 bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs bg-slate-800 text-orange-400 px-3 py-1 rounded-full font-mono border border-slate-700">
              💬 زیرنویس زنده صوتی
            </span>
            {loading && <span className="text-xs text-green-400 animate-pulse">⚡ در حال پردازش...</span>}
          </div>

          <div className="min-h-[70px] flex items-center justify-center text-center p-4 bg-slate-800/50 rounded-xl border border-slate-800/80">
            {liveTranscript ? (
              <p className="text-xl font-bold text-orange-300 animate-pulse">"{liveTranscript}"</p>
            ) : (
              <p className="text-sm text-slate-500">
                {isListening ? "نام کالا، برند و تعداد را بگویید..." : "میکروفن متوقف است. برای شروع کلیک کنید."}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 🔴 کارت بررسی و تأیید مشخصات (همراه با دکمه ضربدر / انصراف و پیشنهادات) */}
      {draftItem && (
        <div className="mb-8 p-6 bg-amber-50 border-2 border-orange-400 rounded-2xl shadow-xl transition-all relative">
          {/* دکمه ضربدر / انصراف سریع */}
          <button
            onClick={handleCancelDraft}
            className="absolute top-4 left-4 bg-red-100 hover:bg-red-200 text-red-600 font-bold w-9 h-9 rounded-full flex items-center justify-center text-lg shadow transition-all"
            title="انصراف و شروع از نو"
          >
            ✕
          </button>

          <div className="flex justify-between items-center mb-4 pr-2">
            <h3 className="font-bold text-lg text-orange-900 flex items-center gap-2">
              🔍 بررسی مشخصات پیش از ثبت نهایی
            </h3>
            <span className="text-xs bg-orange-200 text-orange-900 font-bold px-3 py-1 rounded-full ml-12">
              می‌توانید فیلدها را اصلاح کنید یا بگویید «تأیید» / «انصراف»
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">نام کالا</label>
              <input
                type="text"
                value={draftItem.productName}
                onChange={(e) => setDraftItem({ ...draftItem, productName: e.target.value })}
                className="w-full p-2.5 bg-white border rounded-xl font-bold text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">برند (پیشنهاد)</label>
              <select
                value={draftItem.brand}
                onChange={(e) => setDraftItem({ ...draftItem, brand: e.target.value })}
                className="w-full p-2.5 bg-white border rounded-xl font-bold text-sm text-blue-700 mb-1"
              >
                <option value="متفرقه">متفرقه / نامشخص</option>
                {suggestedBrands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">دسته‌بندی (پیشنهاد)</label>
              <select
                value={draftItem.category}
                onChange={(e) => setDraftItem({ ...draftItem, category: e.target.value })}
                className="w-full p-2.5 bg-white border rounded-xl font-bold text-sm text-purple-700 mb-1"
              >
                {suggestedCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">خودرو مرتبط (پیشنهاد)</label>
              <select
                value={draftItem.compatibleVehicle}
                onChange={(e) => setDraftItem({ ...draftItem, compatibleVehicle: e.target.value })}
                className="w-full p-2.5 bg-white border rounded-xl font-bold text-sm text-emerald-700 mb-1"
              >
                <option value="عمومی">عمومی</option>
                {suggestedVehicles.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">تعداد</label>
              <input
                type="number"
                value={draftItem.quantity}
                onChange={(e) => setDraftItem({ ...draftItem, quantity: parseInt(e.target.value, 10) || 1 })}
                className="w-full p-2.5 bg-white border rounded-xl font-bold text-sm text-orange-600"
              />
            </div>
          </div>

          {/* دکمه‌های عملیاتی پایین کارت */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-orange-200">
            <div className="flex items-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl flex items-center gap-2"
              >
                📷 {draftItem.photoUrl ? "تغییر عکس کالا" : "افزودن عکس کالا"}
              </button>
              {draftItem.photoUrl && (
                <img src={draftItem.photoUrl} alt="پیش‌نمایش" className="w-10 h-10 object-cover rounded-lg border border-orange-300" />
              )}
              <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} accept="image/*" capture="environment" className="hidden" />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleCancelDraft}
                className="bg-red-500 hover:bg-red-600 text-white text-sm font-bold py-3 px-5 rounded-xl shadow transition-all"
              >
                ❌ انصراف از نو
              </button>
              <button
                onClick={handleConfirmAndNext}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-base font-bold py-3 px-8 rounded-xl shadow-lg transition-all flex items-center gap-2"
              >
                ✅ ثبت نهایی و بعدی (یا بگو بعدی) ➔
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="p-4 mb-6 bg-red-50 text-red-600 rounded-xl border border-red-200 text-sm">⚠️ {error}</div>}

      {/* جدول کالاهای تأییدشده */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-bold text-gray-800">📋 کالاهای ثبت و تأیید شده</h3>
          <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-bold">
            مجموع: {itemsList.length} کالا
          </span>
        </div>

        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="bg-slate-50 text-gray-500 text-xs">
              <th className="p-4">تصویر</th>
              <th className="p-4">نام کالا</th>
              <th className="p-4">دسته‌بندی</th>
              <th className="p-4">برند</th>
              <th className="p-4">خودرو</th>
              <th className="p-4">تعداد</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm">
            {itemsList.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center p-8 text-gray-400">
                  هنوز کالایی ثبت نهایی نشده است.
                </td>
              </tr>
            ) : (
              itemsList.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4">
                    {item.photoUrl ? (
                      <img src={item.photoUrl} alt={item.productName} className="w-12 h-12 object-cover rounded-lg border" />
                    ) : (
                      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-xs text-gray-400">بدون عکس</div>
                    )}
                  </td>
                  <td className="p-4 font-bold text-gray-800">{item.productName}</td>
                  <td className="p-4">
                    <span className="bg-purple-50 text-purple-700 px-2.5 py-1 rounded-lg text-xs font-semibold">
                      {item.category}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg text-xs font-semibold">
                      {item.brand}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg text-xs font-semibold">
                      {item.compatibleVehicle}
                    </span>
                  </td>
                  <td className="p-4 font-bold text-orange-600">+{item.quantity}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

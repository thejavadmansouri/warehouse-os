"use client";

import { useState } from "react";

export default function VoiceInputPage() {
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [responseMsg, setResponseMsg] = useState("");

  const startListening = () => {
    // استفاده از Web Speech API مرورگر برای تشخیص گفتار فارسی
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("مرورگر شما از تشخیص گفتار پشتیبانی نمی‌کند.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "fa-IR";
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      processVoiceCommand(text);
    };

    recognition.start();
  };

  const processVoiceCommand = async (text: string) => {
    setResponseMsg(`در حال پردازش دستور صوتی: "${text}"...`);
    // اینجا می‌توانید متن را به API هوش مصنوعی یا پردازش انبار ارسال کنید
    setTimeout(() => {
      setResponseMsg(`✅ دستور با موفقیت ثبت شد: ${text}`);
    }, 1000);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-black text-white">ثبت و ورود صوتی اقلام</h1>
        <p className="text-xs text-slate-400 mt-1">با استفاده از دستورات صوتی، اجناس را هنگام چیدن در انبار ثبت کنید</p>
      </div>

      <div className="bg-[#0B132B] border border-slate-800 rounded-2xl p-8 text-center space-y-6">
        <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center transition-all shadow-xl ${
          isListening ? "bg-red-500 animate-pulse shadow-red-500/50" : "bg-amber-400 text-slate-950 shadow-amber-400/20 hover:scale-105 cursor-pointer"
        }`}
        onClick={startListening}
        >
          <span className="text-3xl">🎙️</span>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-bold text-white">
            {isListening ? "در حال گوش دادن... صحبت کنید" : "برای شروع ضبط صدا کلیک کنید"}
          </p>
          <p className="text-xs text-slate-400">مثال: "۱۰ عدد فیلتر روغن به قفسه الف ۳ اضافه کن"</p>
        </div>

        {transcript && (
          <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl text-xs text-amber-300 font-mono">
            متن تشخیص داده‌شده: {transcript}
          </div>
        )}

        {responseMsg && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs p-4 rounded-xl font-bold">
            {responseMsg}
          </div>
        )}
      </div>
    </div>
  );
}

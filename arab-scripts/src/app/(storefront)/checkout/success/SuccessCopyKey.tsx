"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

export function SuccessCopyKey({ licenseKey }: { licenseKey: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(licenseKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <Button 
      variant={copied ? "default" : "secondary"}
      className={`gap-2 h-10 px-6 rounded-full font-bold transition-all ${copied ? 'bg-green-500 hover:bg-green-600 text-white shadow-[0_0_20px_-5px_rgba(34,197,94,0.5)]' : ''}`}
      onClick={handleCopy}
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {copied ? 'تم النسخ بنجاح' : 'انسخ مفتاح الترخيص'}
    </Button>
  );
}

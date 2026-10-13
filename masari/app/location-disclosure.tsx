"use client";

import { MapPin } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

// إفصاح واضح داخل التطبيق قبل أول طلب لإذن الموقع (سياسة Google Play للموقع في الخلفية، وApple):
// ما الذي يُجمع، ومتى، ولماذا، ومتى يتوقف. يظهر مرة واحدة، والرفض لا يطلب الإذن.

const KEY = "masari-location-disclosure";
let acceptedThisSession = false; // إن كان التخزين محجوبًا لا نعيد السؤال في نفس الجلسة

export function hasLocationDisclosure(): boolean {
  if (acceptedThisSession) return true;
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

function rememberLocationDisclosure() {
  acceptedThisSession = true;
  try { localStorage.setItem(KEY, "1"); } catch { /* محجوب */ }
}

const POINTS = [
  "يجمع مساري موقع جوالك (GPS) أثناء الرحلة فقط: من بدء الرحلة حتى إنهائها.",
  "يستمر جمع الموقع والشاشة مطفأة أو التطبيق في الخلفية، مع إشعار ظاهر «رحلة جارية».",
  "ليرى أولياء الأمور والمدرسة موقع الباص، ويُعتمد وصولك للمحطات.",
  "يتوقف التتبع تلقائيًا عند إنهاء الرحلة، ولا يُستخدم الموقع لأي غرض آخر، ويُحذف بعد 90 يومًا.",
];

export function LocationDisclosure({ open, onAccept, onDecline }: { open: boolean; onAccept: () => void; onDecline: () => void }) {
  return <AlertDialog open={open} onOpenChange={(next) => { if (!next) onDecline(); }}>
    <AlertDialogContent dir="rtl" className="location-disclosure">
      <AlertDialogHeader>
        <span className="location-disclosure-icon" aria-hidden><MapPin /></span>
        <AlertDialogTitle>مساري يستخدم موقعك أثناء الرحلة</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <ul>{POINTS.map((p) => <li key={p}>{p}</li>)}</ul>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={onDecline}>ليس الآن</AlertDialogCancel>
        <AlertDialogAction onClick={() => { rememberLocationDisclosure(); onAccept(); }}>موافق، تابِع</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

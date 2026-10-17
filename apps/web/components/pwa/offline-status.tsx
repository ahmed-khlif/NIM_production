"use client";

import { CheckCircle2, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function OfflineStatus(): React.ReactNode {
  const [online, setOnline] = useState<boolean | null>(null);
  const [restored, setRestored] = useState(false);
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const update = (): void => setOnline(navigator.onLine);
    const handleOffline = (): void => {
      setOnline(false);
      setRestored(false);
    };
    const handleOnline = (): void => {
      setOnline(true);
      setRestored(true);
      if (restoreTimer.current) clearTimeout(restoreTimer.current);
      restoreTimer.current = setTimeout(() => setRestored(false), 5000);
    };
    update();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (restoreTimer.current) clearTimeout(restoreTimer.current);
    };
  }, []);

  if (online === null) return null;
  if (restored) return <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-2 bg-emerald-700 px-4 py-3 text-center text-xs font-medium text-white" role="status" aria-live="polite"><CheckCircle2 className="size-4" />Connexion rétablie. Les nouvelles actions peuvent être envoyées.</div>;
  if (online) return null;
  return <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-2 bg-slate-900 px-4 py-3 text-center text-xs font-medium text-white" role="alert" aria-live="assertive"><WifiOff className="size-4" />Hors connexion : les actions d’écriture sont bloquées et ne sont pas mises en file.</div>;
}

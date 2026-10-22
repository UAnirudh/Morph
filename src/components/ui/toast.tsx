"use client";

import * as React from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (input: { title: string; description?: string; tone?: ToastTone }) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) return { toast: () => undefined };
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = React.useCallback<ToastContextValue["toast"]>(
    ({ title, description, tone = "info" }) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setItems((current) => [...current.slice(-3), { id, title, description, tone }]);
      setTimeout(() => dismiss(id), 5200);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-full max-w-sm flex-col gap-2"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-lg border bg-surface-raised/95 p-3 shadow-pop backdrop-blur animate-slide-in",
              item.tone === "success" && "border-emerald-500/40",
              item.tone === "error" && "border-rose-500/40",
              item.tone === "info" && "border-border",
            )}
            role="status"
          >
            {item.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 size-4 text-emerald-400" />
            ) : item.tone === "error" ? (
              <TriangleAlert className="mt-0.5 size-4 text-rose-400" />
            ) : (
              <Info className="mt-0.5 size-4 text-sky-400" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">{item.title}</p>
              {item.description ? (
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{item.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Dismiss notification"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

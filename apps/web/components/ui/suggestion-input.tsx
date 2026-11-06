"use client";

import { Check, ChevronDown, Sparkles } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SuggestionInputProps = React.ComponentProps<typeof Input> & {
  suggestions?: string[];
  contextLabel?: string;
  onValueSelect?: (value: string) => void;
};

/** NIM-styled, keyboard-accessible autocomplete that always permits custom text. */
export function SuggestionInput({
  suggestions = [],
  contextLabel = "Valeurs déjà utilisées",
  onValueSelect,
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  value,
  className,
  ...props
}: SuggestionInputProps): React.ReactNode {
  const generatedId = useId();
  const listId = `suggestions-${generatedId.replace(/:/g, "")}`;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const options = useMemo(
    () => [...new Set(suggestions.map((entry) => entry.trim()).filter(Boolean))],
    [suggestions],
  );
  const typedValue = String(value ?? "");
  const filtered = options
    .filter((option) => option.toLocaleLowerCase().includes(typedValue.trim().toLocaleLowerCase()))
    .slice(0, 8);
  const showPanel = open && (filtered.length > 0 || typedValue.trim().length > 0);

  const choose = (option: string): void => {
    onValueSelect?.(option);
    setOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <Input
        {...props}
        value={value}
        className={cn("pr-9", className)}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
        autoComplete="off"
        onChange={(event) => {
          setOpen(true);
          setActiveIndex(-1);
          onChange?.(event);
        }}
        onFocus={(event) => {
          setOpen(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          onBlur?.(event);
          if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === "ArrowDown" && filtered.length) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => (current + 1) % filtered.length);
          } else if (event.key === "ArrowUp" && filtered.length) {
            event.preventDefault();
            setActiveIndex((current) => (current <= 0 ? filtered.length - 1 : current - 1));
          } else if (event.key === "Enter" && activeIndex >= 0 && filtered[activeIndex]) {
            event.preventDefault();
            choose(filtered[activeIndex]);
          } else if (event.key === "Escape") {
            setOpen(false);
            setActiveIndex(-1);
          }
        }}
      />
      {options.length > 0 && !props.disabled ? (
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400 transition-transform",
            showPanel && "rotate-180 text-nim-red",
          )}
        />
      ) : null}
      {showPanel ? (
        <div
          className="absolute left-0 top-[calc(100%+6px)] z-[80] w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 ring-1 ring-black/[0.02] dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <Sparkles className="size-3.5 text-nim-red" aria-hidden="true" />
              {contextLabel}
            </span>
            {filtered.length ? (
              <span className="text-[11px] tabular-nums text-slate-400">{filtered.length} suggestion{filtered.length > 1 ? "s" : ""}</span>
            ) : null}
          </div>
          {filtered.length ? (
            <ul id={listId} role="listbox" aria-label={contextLabel} className="max-h-56 overflow-y-auto p-1.5">
              {filtered.map((option, index) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    key={option}
                    id={`${listId}-option-${index}`}
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(option)}
                    className={cn(
                      "flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800",
                      index === activeIndex && "bg-red-50 text-nim-red dark:bg-red-950/40 dark:text-red-300",
                    )}
                  >
                    <span className="truncate font-medium">{option}</span>
                    {option === typedValue ? <Check className="size-4 shrink-0 text-nim-red" aria-hidden="true" /> : null}
                  </button>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-sm text-slate-500 dark:text-slate-400">
              Aucune suggestion correspondante. Votre nouvelle valeur sera conservée.
            </p>
          )}
          <div className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400 dark:border-slate-800">
            Sélectionnez une suggestion ou continuez à saisir librement.
          </div>
        </div>
      ) : null}
    </div>
  );
}

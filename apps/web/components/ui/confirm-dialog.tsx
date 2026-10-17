import { Button } from "./button";

export function ConfirmDialog({ title, description, onConfirm }: { title: string; description: string; onConfirm: () => void }): React.ReactNode {
  return <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-panel"><h2 className="font-semibold text-slate-950">{title}</h2><p className="mt-2 text-sm text-slate-500">{description}</p><Button className="mt-4" onClick={onConfirm}>Confirmer</Button></div>;
}

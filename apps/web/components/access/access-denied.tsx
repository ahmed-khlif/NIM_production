import { ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function AccessDenied(): React.ReactNode {
  return (
    <Card>
      <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
        <ShieldAlert className="size-8 text-slate-300" />
        <h1 className="mt-4 text-lg font-semibold text-slate-900">Accès non autorisé</h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
          Votre rôle ne permet pas d’accéder à cette vue.
        </p>
      </CardContent>
    </Card>
  );
}

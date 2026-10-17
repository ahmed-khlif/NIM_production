import { Skeleton } from "@/components/ui/skeleton";

export default function Loading(): React.ReactNode {
  return <div className="space-y-6" aria-label="Chargement" role="status"><div className="space-y-2"><Skeleton className="h-3 w-28" /><Skeleton className="h-9 w-64" /></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-36 rounded-xl" />)}</div><Skeleton className="h-96 rounded-xl" /></div>;
}

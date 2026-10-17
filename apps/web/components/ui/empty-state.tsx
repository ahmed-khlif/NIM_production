import { Inbox } from "lucide-react";
import Image from "next/image";

export function EmptyState({
  title,
  description,
  illustration,
  illustrationAlt,
  action,
}: {
  title: string;
  description: string;
  illustration?: string;
  illustrationAlt?: string;
  action?: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-950">
      {illustration ? (
        <Image
          src={illustration}
          alt={illustrationAlt ?? ""}
          width={144}
          height={144}
          className="mb-3 size-28 object-contain sm:size-32"
        />
      ) : (
        <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <Inbox className="size-5" />
        </div>
      )}
      <h2 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

import Image from "next/image";

export function NimLogo({ compact = false, invert = false }: { compact?: boolean; invert?: boolean }): React.ReactNode {
  return <Image src="/assets/brand/nim-logo.png" alt="La Nouvelle Industrie des Métaux" width={compact ? 118 : 178} height={compact ? 54 : 60} className={invert ? "brightness-0 invert" : "object-contain"} priority />;
}

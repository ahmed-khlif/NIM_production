import Image from "next/image";

export function NimLogo({ compact = false, invert = false }: { compact?: boolean; invert?: boolean }): React.ReactNode {
  return (
    <Image
      src="/assets/brand/nim-logo.png"
      alt="La Nouvelle Industrie des Métaux"
      width={1595}
      height={783}
      sizes={compact ? "118px" : "178px"}
      style={{ width: compact ? 118 : 178, height: "auto" }}
      className={invert ? "brightness-0 invert" : "object-contain"}
      priority
    />
  );
}

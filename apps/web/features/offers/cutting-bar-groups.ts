export type CuttingBarGroupable = {
  profile: string;
  rawLengthMm: number;
  usedLengthMm: number;
  wasteMm: number;
  status: string;
  machine: { id: string } | null;
  items: Array<{ lengthMm: number; active?: boolean }>;
};

export type CuttingBarGroup<T> = { bar: T; members: T[] };

/** Group bars with the same profile, stock, state, machine, and cut-length pattern. */
export function groupCuttingBars<T extends CuttingBarGroupable>(bars: T[]): CuttingBarGroup<T>[] {
  const groups = new Map<string, CuttingBarGroup<T>>();
  for (const bar of bars) {
    const cutPattern = bar.items
      .filter((item) => item.active !== false)
      .map((item) => item.lengthMm)
      .sort((left, right) => left - right)
      .join(",");
    const key = [
      bar.profile,
      bar.rawLengthMm,
      bar.usedLengthMm,
      bar.wasteMm,
      bar.status,
      bar.machine?.id ?? "",
      cutPattern,
    ].join("|");
    const group = groups.get(key);
    if (group) group.members.push(bar);
    else groups.set(key, { bar, members: [bar] });
  }
  return [...groups.values()];
}

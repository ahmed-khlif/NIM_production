import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { materialProfileSchema, updateMaterialProfileSchema } from "@nim/validation";
import type { MaterialProfileCatalogItem } from "@nim/types";
import type { AuthContext } from "../auth/auth.types";
import { PrismaService } from "../infrastructure/prisma/prisma.service";

type MaterialProfileRecord = {
  id: string;
  profile: string;
  aliases: string[];
  kgPerMeter: Prisma.Decimal;
  rawLengthsMm: number[];
  isActive: boolean;
  updatedAt: Date;
};

const profileKey = (value: string): string => value.trim().replace(/\s+/g, "").toLocaleUpperCase();
const normalizeAliases = (aliases: string[]): string[] => [
  ...new Map(
    aliases.map((alias) => [
      profileKey(alias),
      alias.trim().replace(/\s+/g, " ").toLocaleUpperCase(),
    ]),
  ).values(),
];

function toCatalogItem(item: MaterialProfileRecord): MaterialProfileCatalogItem {
  return {
    id: item.id,
    profile: item.profile,
    aliases: item.aliases,
    kgPerMeter: Number(item.kgPerMeter),
    rawLengthsMm: item.rawLengthsMm,
    isActive: item.isActive,
    updatedAt: item.updatedAt.toISOString(),
  };
}

@Injectable()
export class MaterialProfilesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async assertUniqueNames(
    transaction: Prisma.TransactionClient,
    profile: string,
    aliases: string[],
    excludeId?: string,
  ): Promise<void> {
    const existing = await transaction.materialProfile.findMany({
      where: excludeId ? { id: { not: excludeId } } : {},
      select: { profile: true, aliases: true },
    });
    const occupied = new Set(
      existing.flatMap((item) => [item.profile, ...item.aliases].map(profileKey)),
    );
    const conflict = [profile, ...aliases].find((name) => occupied.has(profileKey(name)));
    if (conflict) {
      throw new ConflictException({
        code: "MATERIAL_PROFILE_NAME_CONFLICT",
        message: `Le nom « ${conflict} » est déjà utilisé par un autre profil ou alias.`,
      });
    }
  }

  async list(
    search?: string,
    includeInactive = false,
  ): Promise<{ profiles: MaterialProfileCatalogItem[]; total: number }> {
    const term = search?.trim();
    if (term && term.length > 80)
      throw new BadRequestException({
        code: "INVALID_SEARCH",
        message: "La recherche est trop longue.",
      });
    const where: Prisma.MaterialProfileWhereInput = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(term
        ? {
            OR: [
              { profile: { contains: term, mode: "insensitive" } },
              { aliases: { has: term.trim().replace(/\s+/g, " ").toLocaleUpperCase() } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.materialProfile.findMany({ where, orderBy: { profile: "asc" } });
    return { profiles: rows.map((row) => toCatalogItem(row)), total: rows.length };
  }

  async previewImport(filename: string, dataBase64: string) {
    if (!/\.xlsx?$/i.test(filename) || dataBase64.length > 7_000_000) {
      throw new BadRequestException({
        code: "INVALID_FILE",
        message: "Choisissez un fichier Excel .xls ou .xlsx de 5 Mo maximum.",
      });
    }
    let rows: unknown[][];
    try {
      const workbook = XLSX.read(Buffer.from(dataBase64, "base64"), {
        type: "buffer",
        cellDates: false,
      });
      const sheet = workbook.Sheets[workbook.SheetNames[0]!];
      if (!sheet) throw new Error("empty");
      rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as unknown[][];
    } catch {
      throw new BadRequestException({
        code: "INVALID_WORKBOOK",
        message: "Le fichier Excel est illisible.",
      });
    }
    const header = (rows[0] ?? []).map((cell) =>
      String(cell ?? "")
        .trim()
        .toLocaleLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""),
    );
    const profileCol = header.findIndex((name) =>
      ["designation", "profil", "profile"].includes(name),
    );
    const aliasCol = header.findIndex((name) =>
      [
        "alias",
        "aliases",
        "synonymes",
        "autres designations",
        "designations alternatives",
      ].includes(name),
    );
    const weightCol = header.findIndex((name) =>
      ["poids (kg/m)", "poids kg/m", "kg/m", "kg par metre"].includes(name),
    );
    const lengthCols = header
      .map((name, index) => ({ name, index }))
      .filter(({ name }) => /^(longueur|longeure)(\s+\d+)?(\s*\(mm\))?$/.test(name));
    if (profileCol < 0 || weightCol < 0 || lengthCols.length === 0) {
      throw new BadRequestException({
        code: "INVALID_COLUMNS",
        message:
          "Colonnes attendues : Désignation, Poids (kg/m), et une ou plusieurs colonnes Longueur/Longeure.",
      });
    }
    if (rows.length > 5001)
      throw new BadRequestException({
        code: "TOO_MANY_ROWS",
        message: "Le fichier ne peut pas dépasser 5 000 profils.",
      });

    const seenProfiles = new Set<string>();
    const seenNames = new Map<string, number>();
    const items = rows
      .slice(1)
      .map((row, index) => {
        const profile = String(row[profileCol] ?? "")
          .trim()
          .replace(/\s+/g, " ");
        const aliases =
          aliasCol < 0
            ? undefined
            : String(row[aliasCol] ?? "")
                .split(/[,;|\n]/)
                .map((alias) => alias.trim().replace(/\s+/g, " ").toLocaleUpperCase())
                .filter(Boolean);
        const weight = Number(row[weightCol]);
        const lengths = [
          ...new Set(
            lengthCols
              .map(({ index: col }) => Number(row[col]))
              .filter((value) => Number.isInteger(value) && value > 0),
          ),
        ].sort((a, b) => a - b);
        const key = profileKey(profile);
        const errors: string[] = [];
        if (!profile || profile.length > 80) errors.push("Désignation manquante ou trop longue");
        if (!Number.isFinite(weight) || weight <= 0) errors.push("Poids kg/m invalide");
        if (!lengths.length) errors.push("Au moins une longueur brute positive est requise");
        if (aliases) {
          const aliasKeys = aliases.map(profileKey);
          if (new Set(aliasKeys).size !== aliasKeys.length)
            errors.push("Alias en doublon pour ce profil");
          if (aliasKeys.includes(key))
            errors.push("Un alias ne peut pas être identique à la désignation");
        }
        if (key && seenProfiles.has(key)) errors.push("Profil en doublon dans le fichier");
        if (key) seenProfiles.add(key);
        for (const name of [profile, ...(aliases ?? [])]) {
          const nameKey = profileKey(name);
          const previousRow = seenNames.get(nameKey);
          if (nameKey && previousRow !== undefined)
            errors.push(`Nom ou alias en doublon avec la ligne ${previousRow}.`);
          else if (nameKey) seenNames.set(nameKey, index + 2);
        }
        return {
          row: index + 2,
          profile,
          ...(aliases === undefined ? {} : { aliases }),
          kgPerMeter: weight,
          rawLengthsMm: lengths,
          errors,
        };
      })
      .filter((item) => item.profile || item.kgPerMeter || item.rawLengthsMm.length);

    const existingRows = await this.prisma.materialProfile.findMany({
      select: {
        id: true,
        profile: true,
        profileKey: true,
        aliases: true,
        kgPerMeter: true,
        rawLengthsMm: true,
        isActive: true,
      },
    });
    const existingByProfile = new Map(existingRows.map((item) => [item.profileKey, item]));
    const existingNames = new Map<string, (typeof existingRows)[number]>();
    for (const existing of existingRows)
      for (const name of [existing.profile, ...existing.aliases])
        existingNames.set(profileKey(name), existing);
    for (const item of items) {
      const prior = existingByProfile.get(profileKey(item.profile));
      if (prior) {
        Object.assign(item, {
          existing: {
            profile: prior.profile,
            aliases: prior.aliases,
            kgPerMeter: Number(prior.kgPerMeter),
            rawLengthsMm: prior.rawLengthsMm,
            isActive: prior.isActive,
          },
        });
      }
      for (const name of [item.profile, ...(item.aliases ?? [])]) {
        const owner = existingNames.get(profileKey(name));
        if (owner && owner.id !== prior?.id)
          item.errors.push(`« ${name} » est déjà associé à ${owner.profile}.`);
      }
    }
    return {
      items,
      total: items.length,
      valid: items.filter((item) => item.errors.length === 0).length,
      invalid: items.filter((item) => item.errors.length > 0).length,
    };
  }

  async import(actor: AuthContext, input: unknown) {
    if (!input || typeof input !== "object")
      throw new BadRequestException({
        code: "INVALID_IMPORT",
        message: "Aperçu d’import manquant.",
      });
    const raw = input as { items?: unknown; updateExisting?: unknown };
    if (!Array.isArray(raw.items) || raw.items.length === 0 || raw.items.length > 5000)
      throw new BadRequestException({
        code: "INVALID_IMPORT",
        message: "Aucun profil valide à importer.",
      });
    const sourceItems = raw.items as unknown[];
    const parsed = sourceItems.map((item) => materialProfileSchema.safeParse(item));
    if (parsed.some((item) => !item.success))
      throw new BadRequestException({
        code: "INVALID_IMPORT",
        message: "Les données ont changé ou contiennent des profils invalides. Relancez l’aperçu.",
      });
    const entries = parsed.map((item, index) => {
      const data = (
        item as {
          success: true;
          data: {
            profile: string;
            aliases: string[];
            kgPerMeter: number;
            rawLengthsMm: number[];
          };
        }
      ).data;
      const source = sourceItems[index] as Record<string, unknown>;
      return {
        ...data,
        aliasesProvided: Object.prototype.hasOwnProperty.call(source, "aliases"),
      };
    });
    if (new Set(entries.map((item) => profileKey(item.profile))).size !== entries.length) {
      throw new BadRequestException({
        code: "DUPLICATE_IMPORT",
        message: "Le fichier contient des désignations en doublon.",
      });
    }
    return this.prisma.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      let skipped = 0;
      for (const item of entries) {
        const key = profileKey(item.profile);
        const before = await tx.materialProfile.findUnique({ where: { profileKey: key } });
        if (before && raw.updateExisting !== true) {
          skipped++;
          continue;
        }
        const aliases = item.aliasesProvided
          ? normalizeAliases(item.aliases)
          : (before?.aliases ?? []);
        await this.assertUniqueNames(tx, item.profile, aliases, before?.id);
        const data = {
          profile: item.profile,
          profileKey: key,
          aliases,
          kgPerMeter: item.kgPerMeter,
          rawLengthsMm: [...new Set(item.rawLengthsMm)].sort((a, b) => a - b),
          isActive: true,
        };
        const profile = before
          ? await tx.materialProfile.update({ where: { id: before.id }, data })
          : await tx.materialProfile.create({ data });
        if (before) updated++;
        else created++;
        await tx.historyEvent.create({
          data: {
            eventType: before ? "MATERIAL_PROFILE_UPDATED" : "MATERIAL_PROFILE_CREATED",
            entityType: "MATERIAL_PROFILE",
            entityId: profile.id,
            actorUserId: actor.user.id,
            actorRole: actor.user.role,
            metadata: {
              source: "EXCEL_IMPORT",
              before: before
                ? {
                    profile: before.profile,
                    aliases: before.aliases,
                    kgPerMeter: Number(before.kgPerMeter),
                    rawLengthsMm: before.rawLengthsMm,
                    isActive: before.isActive,
                  }
                : null,
              after: {
                profile: profile.profile,
                aliases: profile.aliases,
                kgPerMeter: Number(profile.kgPerMeter),
                rawLengthsMm: profile.rawLengthsMm,
                isActive: profile.isActive,
              },
            },
          },
        });
      }
      return { created, updated, skipped, total: entries.length };
    });
  }

  async exportWorkbook(): Promise<Buffer> {
    const rows = await this.prisma.materialProfile.findMany({ orderBy: { profile: "asc" } });
    const maxLengths = Math.max(1, ...rows.map((row) => row.rawLengthsMm.length));
    const header = [
      "Désignation",
      "Alias",
      "Poids (kg/m)",
      ...Array.from({ length: maxLengths }, (_, index) => `Longeure ${index + 1}`),
      "Actif",
    ];
    const data = rows.map((row) => [
      row.profile,
      row.aliases.join(" ; "),
      Number(row.kgPerMeter),
      ...row.rawLengthsMm,
      ...Array(Math.max(0, maxLengths - row.rawLengthsMm.length)).fill(null),
      row.isActive ? "Oui" : "Non",
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([header, ...data]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Profils matière");
    return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
  }

  async create(
    actor: AuthContext,
    input: unknown,
  ): Promise<{ profile: MaterialProfileCatalogItem }> {
    const parsed = materialProfileSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Vérifiez la désignation, le poids linéique et les longueurs brutes.",
        details: parsed.error.flatten(),
      });
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const aliases = normalizeAliases(parsed.data.aliases ?? []);
        await this.assertUniqueNames(tx, parsed.data.profile, aliases);
        const profile = await tx.materialProfile.create({
          data: {
            profile: parsed.data.profile,
            profileKey: profileKey(parsed.data.profile),
            aliases,
            kgPerMeter: parsed.data.kgPerMeter,
            rawLengthsMm: [...new Set(parsed.data.rawLengthsMm)].sort((a, b) => a - b),
          },
        });
        await tx.historyEvent.create({
          data: {
            eventType: "MATERIAL_PROFILE_CREATED",
            entityType: "MATERIAL_PROFILE",
            entityId: profile.id,
            actorUserId: actor.user.id,
            actorRole: actor.user.role,
            metadata: {
              profile: profile.profile,
              aliases: profile.aliases,
              kgPerMeter: Number(profile.kgPerMeter),
              rawLengthsMm: profile.rawLengthsMm,
            },
          },
        });
        return profile;
      });
      return { profile: toCatalogItem(created) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new ConflictException({
          code: "MATERIAL_PROFILE_EXISTS",
          message: "Cette désignation ou cet alias existe déjà dans le catalogue.",
        });
      throw error;
    }
  }

  async update(
    actor: AuthContext,
    id: string,
    input: unknown,
  ): Promise<{ profile: MaterialProfileCatalogItem }> {
    const parsed = updateMaterialProfileSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Vérifiez la désignation, le poids, les longueurs et l’état du profil.",
        details: parsed.error.flatten(),
      });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await tx.materialProfile.findUnique({ where: { id } });
        if (!before)
          throw new NotFoundException({
            code: "MATERIAL_PROFILE_NOT_FOUND",
            message: "Profil du catalogue introuvable.",
          });
        const aliases = normalizeAliases(parsed.data.aliases ?? []);
        await this.assertUniqueNames(tx, parsed.data.profile, aliases, id);
        const profile = await tx.materialProfile.update({
          where: { id },
          data: {
            profile: parsed.data.profile,
            profileKey: profileKey(parsed.data.profile),
            aliases,
            kgPerMeter: parsed.data.kgPerMeter,
            rawLengthsMm: [...new Set(parsed.data.rawLengthsMm)].sort((a, b) => a - b),
            isActive: parsed.data.isActive,
          },
        });
        await tx.historyEvent.create({
          data: {
            eventType: "MATERIAL_PROFILE_UPDATED",
            entityType: "MATERIAL_PROFILE",
            entityId: profile.id,
            actorUserId: actor.user.id,
            actorRole: actor.user.role,
            metadata: {
              before: {
                profile: before.profile,
                aliases: before.aliases,
                kgPerMeter: Number(before.kgPerMeter),
                rawLengthsMm: before.rawLengthsMm,
                isActive: before.isActive,
              },
              after: {
                profile: profile.profile,
                aliases: profile.aliases,
                kgPerMeter: Number(profile.kgPerMeter),
                rawLengthsMm: profile.rawLengthsMm,
                isActive: profile.isActive,
              },
            },
          },
        });
        return { profile: toCatalogItem(profile) };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new ConflictException({
          code: "MATERIAL_PROFILE_EXISTS",
          message: "Cette désignation ou cet alias existe déjà dans le catalogue.",
        });
      throw error;
    }
  }
}

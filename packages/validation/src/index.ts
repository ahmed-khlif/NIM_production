import { z } from "zod";
import { normalizeProfile } from "./profile";
export {
  calculateTotalWeightKg,
  classifyProfile,
  normalizeProfile,
  profileFamilies,
} from "./profile";
export type { ProfileFamily } from "./profile";

export const loginSchema = z.object({
  username: z.string().trim().min(1, "L’identifiant est requis."),
  password: z.string().min(1, "Le mot de passe est requis."),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Le mot de passe actuel est requis."),
  newPassword: z.string().min(8, "Le nouveau mot de passe doit contenir au moins 8 caractères."),
});

export const userRoleSchema = z.enum([
  "ADMIN",
  "PRODUCTION_MANAGER",
  "OPERATOR",
  "QUALITY_CONTROLLER",
]);

const usernameSchema = z
  .string()
  .trim()
  .min(3, "L’identifiant doit contenir au moins 3 caractères.")
  .max(40, "L’identifiant est trop long.")
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "Utilisez uniquement des lettres, chiffres, points, tirets ou underscores.",
  );

export const createUserSchema = z.object({
  username: usernameSchema,
  displayName: z
    .string()
    .trim()
    .min(2, "Le nom affiché est requis.")
    .max(80, "Le nom affiché est trop long."),
  role: userRoleSchema,
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
    .max(128, "Le mot de passe est trop long."),
});

export const updateUserSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Le nom affiché est requis.")
    .max(80, "Le nom affiché est trop long."),
  role: userRoleSchema,
});

export const resetUserPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
    .max(128, "Le mot de passe est trop long."),
});

export const machineStatusSchema = z.enum(["ACTIVE", "MAINTENANCE", "INACTIVE"]);

export const createMachineSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Le nom de la machine est requis.")
    .max(80, "Le nom de la machine est trop long."),
  internalNumber: z
    .string()
    .trim()
    .min(2, "Le numéro interne est requis.")
    .max(30, "Le numéro interne est trop long.")
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "Utilisez uniquement des lettres, chiffres, points, tirets ou underscores.",
    ),
  type: z
    .string()
    .trim()
    .min(2, "Le type de machine est requis.")
    .max(60, "Le type de machine est trop long."),
  status: machineStatusSchema.default("ACTIVE"),
  description: z.string().trim().max(240, "La description est trop longue.").optional(),
  location: z.string().trim().max(80, "L’emplacement est trop long.").optional(),
});

export const updateMachineSchema = createMachineSchema.omit({ internalNumber: true, status: true });

export const piecePrioritySchema = z.enum(["HIGH", "NORMAL", "LOW"]);
export const pieceStatusSchema = z.enum([
  "PLANNED",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "DELAYED",
  "ARCHIVED",
]);

export const createPieceSchema = z.object({
  reference: z
    .string()
    .trim()
    .min(1, "Le repère est requis.")
    .max(50, "Le repère est trop long.")
    .regex(/^[a-zA-Z0-9._/-]+$/, "Le repère contient des caractères invalides."),
  quantity: z
    .number()
    .int()
    .min(1, "La quantité doit être supérieure à zéro.")
    .max(100000, "La quantité est trop élevée."),
  profile: z
    .string()
    .transform(normalizeProfile)
    .pipe(z.string().min(1, "Le profil est requis.").max(80, "Le profil est trop long.")),
  quality: z
    .string()
    .trim()
    .min(1, "La qualité est requise.")
    .max(80, "La qualité est trop longue.")
    .default("UNKNOWN"),
  lengthMm: z
    .number()
    .int()
    .positive("La longueur doit être positive.")
    .max(1000000, "La longueur est trop élevée."),
  unitWeightKg: z
    .number()
    .nonnegative("Le poids doit être positif.")
    .max(100000, "Le poids est trop élevé.")
    .optional(),
  totalWeightKg: z
    .number()
    .nonnegative("Le poids total doit être positif.")
    .max(100000000, "Le poids total est trop élevé.")
    .optional(),
  designation: z
    .string()
    .trim()
    .min(1, "La désignation est requise.")
    .max(160, "La désignation est trop longue.")
    .default("À compléter"),
  priority: piecePrioritySchema.default("NORMAL"),
  dueDate: z.coerce.date().optional(),
});

export const createManualPieceSchema = createPieceSchema.extend({
  unitWeightKg: z
    .number()
    .positive("Le poids unitaire doit être supérieur à zéro.")
    .max(100000, "Le poids est trop élevé."),
});

export const updatePieceSchema = createPieceSchema.omit({ reference: true, quantity: true });

export const pieceImportSchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1, "Le nom du fichier est requis.")
    .max(255, "Le nom du fichier est trop long."),
  content: z
    .string()
    .min(1, "Le fichier d’import est vide.")
    .max(8_000_000, "Le fichier d’import dépasse la taille autorisée."),
  encoding: z.enum(["text", "base64"]).default("text"),
});

export const faconnageProfilesQuerySchema = z.object({
  profiles: z.string().trim().min(1, "Sélectionnez au moins un profil.").max(10_000),
});

export const faconnagePreparationSchema = z.object({
  profiles: z
    .array(z.string().trim().min(1).max(80))
    .min(1, "Sélectionnez au moins un profil.")
    .max(500, "Trop de profils sélectionnés."),
});

export const faconnageOptimizationSchema = z
  .object({
    profiles: z
      .array(
        z.object({
          profile: z.string().trim().min(1).max(120),
          kerfMm: z.number().int().positive().max(100),
          rawLengths: z
            .array(z.object({ lengthMm: z.number().int().positive().max(1_000_000) }))
            .min(1)
            .max(24),
        }),
      )
      .min(1)
      .max(30),
  })
  .superRefine((input, context) => {
    const normalized = input.profiles.map((item) =>
      item.profile.replace(/\s+/g, " ").toUpperCase(),
    );
    if (new Set(normalized).size !== normalized.length) {
      context.addIssue({
        code: "custom",
        path: ["profiles"],
        message: "Chaque profil ne peut apparaître qu'une seule fois dans un calcul.",
      });
    }
  });

export const updateSettingsSchema = z.object({
  density: z.enum(["comfortable", "compact"]),
  notificationsEnabled: z.boolean(),
});

const pieceUnitIdSchema = z
  .string()
  .trim()
  .min(1, "L’unité de pièce est requise.")
  .max(30, "L’identifiant de l’unité est invalide.");
const machineIdSchema = z
  .string()
  .trim()
  .min(1, "La machine est requise.")
  .max(30, "L’identifiant de la machine est invalide.");
const assignmentReasonSchema = z.string().trim().max(240, "Le motif est trop long.").optional();

export const productionCurrentQuerySchema = z.object({
  machineId: z.string().trim().min(1).max(30).optional(),
});

export const startProductionSchema = z.object({
  pieceUnitId: pieceUnitIdSchema,
  machineId: machineIdSchema,
});

export const operatorLoginSchema = z.object({
  connectionKey: z.string().trim().min(16).max(128),
});
export const startMachineSessionSchema = z
  .object({
    machineId: machineIdSchema,
    helperOperatorIds: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
  })
  .superRefine(({ helperOperatorIds }, context) => {
    if (new Set(helperOperatorIds).size !== helperOperatorIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["helperOperatorIds"],
        message: "Un même opérateur ne peut être ajouté qu’une seule fois.",
      });
    }
  });
export const reportProductionNonConformitySchema = z
  .object({
    pieceUnitId: pieceUnitIdSchema,
    reason: z.enum([
      "DIMENSION",
      "CUTTING_ERROR",
      "DRILLING_ERROR",
      "MATERIAL_DEFECT",
      "DEFORMATION",
      "OTHER",
    ]),
    comment: z.string().trim().max(1000).optional(),
  })
  .superRefine(({ reason, comment }, context) => {
    if (reason === "OTHER" && !comment) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["comment"],
        message: "Précisez le motif lorsque vous choisissez « Autre ».",
      });
    }
  });
export const productionMonitorQuerySchema = z.object({
  offerId: z.string().trim().min(1).max(30).optional(),
  machineId: z.string().trim().min(1).max(30).optional(),
  status: z.enum(["FACONNEE", "AFFECTEE", "LANCEE", "FABRIQUEE"]).optional(),
});

export const qualityControlResultSchema = z.enum(["CONFORM", "NON_CONFORM"]);
export const qualityDefectCategorySchema = z.enum([
  "DIMENSIONAL",
  "SURFACE",
  "MATERIAL",
  "WELDING",
  "FINISH",
  "DAMAGE",
  "OTHER",
]);
export const qualityDecisionSchema = z
  .object({
    result: qualityControlResultSchema,
    comment: z.string().trim().max(1000, "Le commentaire est trop long.").optional(),
    defectCategory: qualityDefectCategorySchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.result === "NON_CONFORM" && !value.comment) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["comment"],
        message: "Un commentaire est obligatoire pour une non-conformité.",
      });
    }
    if (value.result === "NON_CONFORM" && !value.defectCategory) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defectCategory"],
        message: "Choisissez une catégorie de défaut.",
      });
    }
  });

export const qualityDispositionTypeSchema = z.enum(["REWORK", "SCRAP", "REMAKE", "DEVIATION"]);
export const qualityDispositionSchema = z.object({
  type: qualityDispositionTypeSchema,
  reason: z
    .string()
    .trim()
    .min(2, "Le motif est obligatoire.")
    .max(1000, "Le motif est trop long."),
});
export const qualityDeviationDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().trim().max(1000, "Le commentaire est trop long.").optional(),
});

export const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(80).optional(),
  eventType: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(40).optional(),
  actorUserId: z.string().trim().min(1).max(30).optional(),
  entityId: z.string().trim().min(1).max(30).optional(),
});

export const pieceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(80).optional().default(""),
  profile: z.string().trim().max(80).optional().default(""),
});

export const dashboardQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).default(14),
});

export const createAssignmentSchema = z.object({
  pieceUnitId: pieceUnitIdSchema,
  machineId: machineIdSchema,
  queuePosition: z.number().int().min(1, "La position doit être positive.").max(100000).optional(),
  reason: assignmentReasonSchema,
});

export const reassignAssignmentSchema = z.object({
  machineId: machineIdSchema,
  queuePosition: z.number().int().min(1, "La position doit être positive.").max(100000).optional(),
  reason: z
    .string()
    .trim()
    .min(2, "Le motif de réaffectation est requis.")
    .max(240, "Le motif est trop long."),
});

export const unassignAssignmentSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(2, "Le motif de désaffectation est requis.")
    .max(240, "Le motif est trop long."),
});

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url().or(z.string().startsWith("postgresql://")),
    API_URL: z.string().url(),
    APP_URL: z.string().url(),
    AUTH_SECRET: z.string().min(32),
    CORS_ORIGINS: z.string().min(1),
    TRUST_PROXY: z.enum(["true", "false"]).default("false"),
    MEDIA_ROOT: z.string().trim().min(1).default("./storage/media"),
  })
  .superRefine((values, context) => {
    const origins = values.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (origins.length === 0 || origins.some((origin) => origin === "*")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGINS"],
        message: "CORS_ORIGINS doit contenir des origines explicites et ne peut pas utiliser *.",
      });
    }

    for (const origin of origins) {
      try {
        const parsedOrigin = new URL(origin);
        if (!["http:", "https:"].includes(parsedOrigin.protocol)) throw new Error("protocol");
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ORIGINS"],
          message: `Origine CORS invalide : ${origin}.`,
        });
      }
    }

    if (values.NODE_ENV === "production") {
      if (/replace-with|change-this/i.test(values.AUTH_SECRET)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["AUTH_SECRET"],
          message: "AUTH_SECRET doit être remplacé avant un démarrage en production.",
        });
      }
      if (!values.APP_URL.startsWith("https://") || !values.API_URL.startsWith("https://")) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["APP_URL", "API_URL"],
          message: "APP_URL et API_URL doivent utiliser HTTPS en production.",
        });
      }
    }
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetUserPasswordInput = z.infer<typeof resetUserPasswordSchema>;
export type CreateMachineInput = z.infer<typeof createMachineSchema>;
export type UpdateMachineInput = z.infer<typeof updateMachineSchema>;
export type CreatePieceInput = z.infer<typeof createPieceSchema>;
export type UpdatePieceInput = z.infer<typeof updatePieceSchema>;
export type PieceImportInput = z.infer<typeof pieceImportSchema>;
export type FaconnageProfilesQuery = z.infer<typeof faconnageProfilesQuerySchema>;
export type FaconnagePreparationInput = z.infer<typeof faconnagePreparationSchema>;
export type FaconnageOptimizationInput = z.infer<typeof faconnageOptimizationSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type ReassignAssignmentInput = z.infer<typeof reassignAssignmentSchema>;
export type UnassignAssignmentInput = z.infer<typeof unassignAssignmentSchema>;
export type ProductionCurrentQuery = z.infer<typeof productionCurrentQuerySchema>;
export type StartProductionInput = z.infer<typeof startProductionSchema>;
export type OperatorLoginInput = z.infer<typeof operatorLoginSchema>;
export type StartMachineSessionInput = z.infer<typeof startMachineSessionSchema>;
export type ReportProductionNonConformityInput = z.infer<
  typeof reportProductionNonConformitySchema
>;
export type QualityDecisionInput = z.infer<typeof qualityDecisionSchema>;
export type QualityDispositionInput = z.infer<typeof qualityDispositionSchema>;
export type QualityDeviationDecisionInput = z.infer<typeof qualityDeviationDecisionSchema>;
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(values: Record<string, string | undefined>): Environment {
  return environmentSchema.parse(values);
}

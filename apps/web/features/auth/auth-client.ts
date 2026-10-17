import type {
  AvailableProfile,
  CuttingPlanBarProposal,
  CuttingPlanStatus,
  FaconnagePreparation,
  AuthenticatedUser,
  AssignablePieceUnit,
  ManagedAssignment,
  ManagedBarAssignment,
  ManagedCuttingBar,
  ManagedMachine,
  MachineDetail,
  ManagedPiece,
  PieceDetail,
  PieceImage,
  PieceImportPreview,
  PieceImportResult,
  ManagedProductionOperation,
  ManagedQualityControl,
  ManagedQualityPendingUnit,
  QualityControlImage,
  QualityDefectCategory,
  QualityDisposition,
  ManagedNotification,
  DashboardOverview,
  HistoryPage,
  ManagedUser,
  MachineStatus,
  PiecePriority,
  ProductionQueueItem,
  UserRole,
  UserSettings,
  TabletConnectionKeyResult,
  OperatorIdentity,
  MachineSessionSummary,
  ProductionMonitorBar,
  ProductionNonConformity,
  ProductionNonConformityReason,
  TabletMachineOption,
  TabletProductionRun,
} from "@nim/types";

export type OfferStatus = "DRAFT" | "READY" | "IN_PRODUCTION" | "COMPLETED" | "ARCHIVED";

export type OfferPlanSummary = {
  id: string;
  reference: string;
  status: CuttingPlanStatus;
  validatedBarCount?: number;
  remainingBarCount?: number;
  totalBars: number;
  totalWasteMm: number;
  utilizationRate: number;
  createdAt: string;
};

export type ManagedOffer = {
  id: string;
  reference: string;
  revision: string;
  name: string;
  clientName: string | null;
  site: string | null;
  description: string | null;
  status: OfferStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  pieceRows: number;
  totalUnits: number;
  manufacturedUnits: number;
  profileCount: number;
  progressRate: number;
  plannedBars: number;
  latestPlan: OfferPlanSummary | null;
};

export type OfferDetail = ManagedOffer & {
  recentImports: Array<{
    id: string;
    filename: string;
    status: "PREVIEWED" | "COMMITTED" | "FAILED";
    rowsTotal: number;
    rowsCreated: number;
    rowsRejected: number;
    createdAt: string;
    completedAt: string | null;
  }>;
  cuttingPlans: OfferPlanSummary[];
};

export type OfferProductionSummary = {
  offer: {
    id: string;
    reference: string;
    status: OfferStatus;
  };
  totals: {
    pieceRows: number;
    totalUnits: number;
    manufacturedUnits: number;
    resolvedUnits: number;
    acceptedUnits: number;
    scrappedUnits: number;
    pendingQuality: number;
    activeAssignments: number;
    activeOperations: number;
    productionRate: number;
    completionRate: number;
  };
  statusCounts: Record<string, number>;
  pieces: Array<{
    id: string;
    reference: string;
    profile: string;
    quantity: number;
    status: string;
    completedUnits: number;
    resolvedUnits: number;
    progressRate: number;
  }>;
};

export type OfferPayload = {
  reference: string;
  revision: string;
  name: string;
  clientName?: string;
  site?: string;
  description?: string;
};

export type FaconnageOptimizationStatus = "OPTIMAL" | "FEASIBLE" | "HEURISTIC";

export type FaconnageOptimizationRequest = {
  profiles: Array<{
    profile: string;
    requirements: Array<{ lengthMm: number; quantity: number }>;
    rawLengths: Array<{ lengthMm: number }>;
  }>;
};

export type FaconnageCuttingBarPlan = {
  rawLengthMm: number;
  cuts: Array<{ lengthMm: number; quantity: number }>;
  usedLengthMm: number;
  wasteMm: number;
  utilizationRate: number;
};

export type FaconnageCuttingPlanAlternative = {
  totalBars: number;
  totalRawLengthMm: number;
  totalUsedLengthMm: number;
  totalWasteMm: number;
  utilizationRate: number;
  bars: FaconnageCuttingBarPlan[];
};

export type FaconnageProfileOptimizationResult = FaconnageCuttingPlanAlternative & {
  profile: string;
  status: FaconnageOptimizationStatus;
  requirementSummary: Array<{
    lengthMm: number;
    requestedQuantity: number;
    producedQuantity: number;
  }>;
  alternatives: FaconnageCuttingPlanAlternative[];
  diagnostics?: {
    solver: "HIGHS" | "INTERNAL";
    generatedPatternCount: number;
    columnGenerationIterations: number;
    columnGenerationConverged: boolean;
    exhaustivePatternSet: boolean;
    solveTimeMs: number;
  };
};

export type FaconnageOptimizationBatchResult = {
  profiles: FaconnageProfileOptimizationResult[];
  summary: {
    profileCount: number;
    totalBars: number;
    totalRawLengthMm: number;
    totalUsedLengthMm: number;
    totalWasteMm: number;
    utilizationRate: number;
  };
  plan?: {
    id: string;
    reference: string;
    status: CuttingPlanStatus;
    createdAt: string;
  };
  proposals?: CuttingPlanBarProposal[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  if (
    typeof navigator !== "undefined" &&
    !navigator.onLine &&
    method !== "GET" &&
    method !== "HEAD"
  ) {
    throw new ApiError(
      0,
      "OFFLINE",
      "Aucune action d’écriture n’est envoyée hors connexion. Rétablissez le réseau puis réessayez.",
    );
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Le serveur est indisponible. Vérifiez votre connexion.",
    );
  }
  const payload = (await response.json().catch(() => null)) as {
    code?: string;
    message?: string;
    details?: unknown;
  } | null;
  if (!response.ok)
    throw new ApiError(
      response.status,
      payload?.code ?? "API_ERROR",
      payload?.message ?? "Une erreur est survenue.",
      payload?.details,
    );
  return payload as T;
}

async function uploadRequest<T>(path: string, formData: FormData): Promise<T> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new ApiError(
      0,
      "OFFLINE",
      "Aucune image n’est envoyée hors connexion. Rétablissez le réseau puis réessayez.",
    );
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
  } catch {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Le serveur est indisponible. Vérifiez votre connexion.",
    );
  }
  const payload = (await response.json().catch(() => null)) as {
    code?: string;
    message?: string;
    details?: unknown;
  } | null;
  if (!response.ok)
    throw new ApiError(
      response.status,
      payload?.code ?? "API_ERROR",
      payload?.message ?? "Une erreur est survenue.",
      payload?.details,
    );
  return payload as T;
}

export function loginRequest(input: {
  username: string;
  password: string;
}): Promise<{ user: AuthenticatedUser }> {
  return request("/auth/login", { method: "POST", body: JSON.stringify(input) });
}

export function getCurrentUser(): Promise<{ user: AuthenticatedUser }> {
  return request("/auth/me");
}

export function logoutRequest(): Promise<{ success: true }> {
  return request("/auth/logout", { method: "POST" });
}

export function changePasswordRequest(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ success: true }> {
  return request("/auth/change-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getDashboardOverviewRequest(days = 14): Promise<DashboardOverview> {
  return request(`/dashboard/overview?days=${encodeURIComponent(days)}`);
}

export function getSettingsRequest(): Promise<{ settings: UserSettings }> {
  return request("/settings");
}

export function updateSettingsRequest(input: {
  density: "comfortable" | "compact";
  notificationsEnabled: boolean;
}): Promise<{ settings: UserSettings }> {
  return request("/settings", { method: "PATCH", body: JSON.stringify(input) });
}

export function getNotificationsRequest(): Promise<{
  notifications: ManagedNotification[];
  unreadCount: number;
}> {
  return request("/notifications");
}

export function getUsersRequest(): Promise<{ users: ManagedUser[] }> {
  return request("/users");
}

export function getUsersPageRequest(options: { page: number; pageSize: number; search?: string; role?: string; active?: boolean }): Promise<{
  users: ManagedUser[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  summary: { activeCount: number; adminCount: number; tabletAccessCount: number };
}> {
  const params = new URLSearchParams();
  if (options?.page) params.set("page", String(options.page));
  if (options?.pageSize) params.set("pageSize", String(options.pageSize));
  if (options?.search?.trim()) params.set("search", options.search.trim());
  if (options?.role && options.role !== "all") params.set("role", options.role);
  if (options?.active !== undefined) params.set("active", String(options.active));
  return request(`/users?${params.toString()}`);
}

export function createUserRequest(input: {
  username: string;
  displayName: string;
  role: UserRole;
  password: string;
}): Promise<{ user: ManagedUser }> {
  return request("/users", { method: "POST", body: JSON.stringify(input) });
}

export function updateUserRequest(
  id: string,
  input: { displayName: string; role: UserRole },
): Promise<{ user: ManagedUser }> {
  return request(`/users/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function setUserActiveRequest(id: string, active: boolean): Promise<{ user: ManagedUser }> {
  return request(`/users/${id}/${active ? "reactivate" : "disable"}`, { method: "POST" });
}

export function resetUserPasswordRequest(
  id: string,
  newPassword: string,
): Promise<{ success: true }> {
  return request(`/users/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ newPassword }),
  });
}

export function setUserTabletAccessRequest(
  id: string,
  active: boolean,
): Promise<{ user: ManagedUser }> {
  return request(`/operators/${encodeURIComponent(id)}/${active ? "activate" : "deactivate"}`, {
    method: "POST",
  });
}

export function resetUserTabletKeyRequest(id: string): Promise<TabletConnectionKeyResult> {
  return request(`/operators/${encodeURIComponent(id)}/reset-key`, { method: "POST" });
}

export function getOffersRequest(options?: {
  search?: string;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
  status?: string;
  clientName?: string;
  site?: string;
}): Promise<{
  offers: ManagedOffer[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  facets: { clients: string[]; sites: string[] };
}> {
  const params = new URLSearchParams();
  if (options?.search?.trim()) params.set("search", options.search.trim());
  if (options?.includeArchived) params.set("includeArchived", "true");
  if (options?.page) params.set("page", String(options.page));
  if (options?.pageSize) params.set("pageSize", String(options.pageSize));
  if (options?.status && options.status !== "ALL") params.set("status", options.status);
  if (options?.clientName && options.clientName !== "ALL") params.set("clientName", options.clientName);
  if (options?.site && options.site !== "ALL") params.set("site", options.site);
  const query = params.toString();
  return request(`/offers${query ? `?${query}` : ""}`);
}

export function getOfferRequest(id: string): Promise<{ offer: OfferDetail }> {
  return request(`/offers/${encodeURIComponent(id)}`);
}

export function getOfferProductionSummaryRequest(
  id: string,
): Promise<{ summary: OfferProductionSummary }> {
  return request(`/offers/${encodeURIComponent(id)}/production-summary`);
}

export function createOfferRequest(input: OfferPayload): Promise<{ offer: OfferDetail }> {
  return request("/offers", { method: "POST", body: JSON.stringify(input) });
}

export function updateOfferRequest(
  id: string,
  input: Partial<Omit<OfferPayload, "reference">> & { status?: Exclude<OfferStatus, "ARCHIVED"> },
): Promise<{ offer: OfferDetail }> {
  return request(`/offers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function archiveOfferRequest(id: string): Promise<{ offer: OfferDetail }> {
  return request(`/offers/${encodeURIComponent(id)}/archive`, { method: "POST" });
}

export function restoreOfferRequest(id: string): Promise<{ offer: OfferDetail }> {
  return request(`/offers/${encodeURIComponent(id)}/restore`, { method: "POST" });
}

export function deleteOfferRequest(id: string): Promise<{ success: true }> {
  return request(`/offers/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function getMachinesRequest(): Promise<{ machines: ManagedMachine[] }> {
  return request("/machines");
}

export function getMachinesPageRequest(options: { page: number; pageSize: number; search?: string; status?: string }): Promise<{
  machines: ManagedMachine[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  statusCounts: Record<string, number>;
}> {
  const params = new URLSearchParams();
  if (options?.page) params.set("page", String(options.page));
  if (options?.pageSize) params.set("pageSize", String(options.pageSize));
  if (options?.search?.trim()) params.set("search", options.search.trim());
  if (options?.status && options.status !== "ALL") params.set("status", options.status);
  return request(`/machines?${params.toString()}`);
}

export function getMachineRequest(id: string): Promise<{ machine: MachineDetail }> {
  return request(`/machines/${encodeURIComponent(id)}`);
}

export function getMachineQueueRequest(id: string): Promise<{
  machine: MachineDetail;
  queue: MachineDetail["queue"];
  activeOperationCount: number;
}> {
  return request(`/machines/${encodeURIComponent(id)}/queue`);
}

export function createMachineRequest(input: {
  name: string;
  internalNumber: string;
  type: string;
  status: MachineStatus;
  description?: string;
  location?: string;
}): Promise<{ machine: ManagedMachine }> {
  return request("/machines", { method: "POST", body: JSON.stringify(input) });
}

export function updateMachineRequest(
  id: string,
  input: { name: string; type: string; description?: string; location?: string },
): Promise<{ machine: ManagedMachine }> {
  return request(`/machines/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function setMachineStatusRequest(
  id: string,
  status: MachineStatus,
): Promise<{ machine: ManagedMachine }> {
  const action =
    status === "MAINTENANCE" ? "maintenance" : status === "INACTIVE" ? "deactivate" : "reactivate";
  return request(`/machines/${id}/${action}`, { method: "POST" });
}

export type PieceProductionStatus = "PENDING" | "FACONNEE" | "AFFECTEE" | "LANCEE" | "FABRIQUEE";

export type ManagedPieceListItem = ManagedPiece & {
  offerId: string;
  productionStatusCounts: Record<PieceProductionStatus, number>;
  isUnstarted: boolean;
};

export type PieceListQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  profile?: string;
};
export type PieceListResponse = {
  pieces: ManagedPieceListItem[];
  profiles: string[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PiecePayload = {
  profile: string;
  quality: string;
  lengthMm: number;
  unitWeightKg?: number;
  designation: string;
  priority: PiecePriority;
  dueDate?: string;
};

function pieceListQueryString(query: PieceListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const suffix = params.toString();
  return suffix ? `?${suffix}` : "";
}

export function getPiecesRequest(query: PieceListQuery = {}): Promise<PieceListResponse> {
  return request(`/pieces${pieceListQueryString(query)}`);
}

export async function getAllPiecesRequest(): Promise<{ pieces: ManagedPieceListItem[] }> {
  const firstPage = await getPiecesRequest({ page: 1, pageSize: 100 });
  if (firstPage.totalPages <= 1) return { pieces: firstPage.pieces };
  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.totalPages - 1 }, (_, index) =>
      getPiecesRequest({ page: index + 2, pageSize: firstPage.pageSize }),
    ),
  );
  return { pieces: [firstPage, ...remainingPages].flatMap((result) => result.pieces) };
}

export function getOfferPiecesRequest(
  offerId: string,
  query: PieceListQuery = {},
): Promise<PieceListResponse> {
  return request(`/offers/${encodeURIComponent(offerId)}/pieces${pieceListQueryString(query)}`);
}

export function getPieceRequest(id: string): Promise<{ piece: PieceDetail }> {
  return request(`/pieces/${encodeURIComponent(id)}`);
}

export function getOfferPieceRequest(offerId: string, id: string): Promise<{ piece: PieceDetail }> {
  return request(`/offers/${encodeURIComponent(offerId)}/pieces/${encodeURIComponent(id)}`);
}

export function previewPieceImportRequest(input: {
  filename: string;
  content: string;
  encoding?: "text" | "base64";
}): Promise<{ preview: PieceImportPreview }> {
  return request("/pieces/import/preview", { method: "POST", body: JSON.stringify(input) });
}

export function commitPieceImportRequest(input: {
  filename: string;
  content: string;
  encoding?: "text" | "base64";
}): Promise<{ result: PieceImportResult }> {
  return request("/pieces/import", { method: "POST", body: JSON.stringify(input) });
}

export function createPieceRequest(
  input: PiecePayload & { reference: string; quantity: number },
): Promise<{ piece: ManagedPiece }> {
  return request("/pieces", { method: "POST", body: JSON.stringify(input) });
}

export function updatePieceRequest(
  id: string,
  input: PiecePayload,
): Promise<{ piece: ManagedPiece }> {
  return request(`/pieces/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function archivePieceRequest(id: string): Promise<{ piece: ManagedPiece }> {
  return request(`/pieces/${id}/archive`, { method: "POST" });
}

export function previewOfferPieceImportRequest(
  offerId: string,
  input: {
    filename: string;
    content: string;
    encoding?: "text" | "base64";
  },
): Promise<{ preview: PieceImportPreview }> {
  return request(`/offers/${encodeURIComponent(offerId)}/pieces/import/preview`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function commitOfferPieceImportRequest(
  offerId: string,
  input: {
    filename: string;
    content: string;
    encoding?: "text" | "base64";
  },
): Promise<{ result: PieceImportResult }> {
  return request(`/offers/${encodeURIComponent(offerId)}/pieces/import`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createOfferPieceRequest(
  offerId: string,
  input: PiecePayload & { reference: string; quantity: number },
): Promise<{ piece: ManagedPiece }> {
  return request(`/offers/${encodeURIComponent(offerId)}/pieces`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateOfferPieceRequest(
  offerId: string,
  id: string,
  input: PiecePayload,
): Promise<{ piece: ManagedPiece }> {
  return request(`/offers/${encodeURIComponent(offerId)}/pieces/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function archiveOfferPieceRequest(
  offerId: string,
  id: string,
): Promise<{ piece: ManagedPiece }> {
  return request(
    `/offers/${encodeURIComponent(offerId)}/pieces/${encodeURIComponent(id)}/archive`,
    { method: "POST" },
  );
}

export function getAvailableProfilesRequest(): Promise<{
  profiles: AvailableProfile[];
  totalProfiles: number;
  totalPieceRows: number;
}> {
  return request("/pieces/profiles");
}

export function getOfferAvailableProfilesRequest(offerId: string): Promise<{
  profiles: AvailableProfile[];
  totalProfiles: number;
  totalPieceRows: number;
}> {
  return request(`/offers/${encodeURIComponent(offerId)}/pieces/profiles`);
}

export function prepareFaconnageRequest(profiles: string[]): Promise<{
  preparation: FaconnagePreparation;
}> {
  return request("/pieces/faconnage/prepare", {
    method: "POST",
    body: JSON.stringify({ profiles }),
  });
}

export function prepareOfferFaconnageRequest(
  offerId: string,
  profiles: string[],
): Promise<{
  preparation: FaconnagePreparation;
}> {
  return request(`/offers/${encodeURIComponent(offerId)}/pieces/faconnage/prepare`, {
    method: "POST",
    body: JSON.stringify({ profiles }),
  });
}

export function optimizeFaconnageRequest(
  offerId: string,
  input: FaconnageOptimizationRequest,
): Promise<{ optimization: FaconnageOptimizationBatchResult }> {
  return request(`/offers/${encodeURIComponent(offerId)}/faconnage/optimize`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getOfferCuttingPlansRequest(
  offerId: string,
  page = 1,
  pageSize = 10,
): Promise<{ plans: OfferPlanSummary[]; pagination?: { page: number; pageSize: number; total: number; totalPages: number } }> {
  return request(`/offers/${encodeURIComponent(offerId)}/faconnage/plans?page=${page}&pageSize=${pageSize}`);
}

export function deleteDraftCuttingPlanRequest(
  offerId: string,
  planId: string,
): Promise<{ plan: { id: string; reference: string; deletedAt: string } }> {
  return request(`/offers/${encodeURIComponent(offerId)}/faconnage/plans/${encodeURIComponent(planId)}`, { method: "DELETE" });
}

export function getOfferCuttingPlanRequest(
  offerId: string,
  planId: string,
): Promise<{ optimization: FaconnageOptimizationBatchResult }> {
  return request(
    `/offers/${encodeURIComponent(offerId)}/faconnage/plans/${encodeURIComponent(planId)}`,
  );
}

export function validateCuttingPlanBarsRequest(
  offerId: string,
  planId: string,
  proposalIds: string[],
): Promise<{
  plan: {
    id: string;
    reference: string;
    status: CuttingPlanStatus;
    validatedBarCount: number;
    remainingBarCount: number;
    barsCreated: number;
  };
}> {
  return request(
    `/offers/${encodeURIComponent(offerId)}/faconnage/plans/${encodeURIComponent(planId)}/validate`,
    { method: "POST", body: JSON.stringify({ proposalIds }) },
  );
}

export function cancelCuttingPlanRequest(
  offerId: string,
  planId: string,
): Promise<{ plan: { id: string; status: "CANCELLED"; cancelledAt: string } }> {
  return request(
    `/offers/${encodeURIComponent(offerId)}/faconnage/plans/${encodeURIComponent(planId)}/cancel`,
    { method: "POST" },
  );
}

export function getOfferBarsRequest(offerId: string, options?: { page?: number; pageSize?: number; search?: string; status?: string; profile?: string }): Promise<{
  bars: ManagedCuttingBar[];
  statusCounts: Record<string, number>;
  profiles: string[];
  total: number;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const params = new URLSearchParams();
  if (options?.page) params.set("page", String(options.page));
  if (options?.pageSize) params.set("pageSize", String(options.pageSize));
  if (options?.search?.trim()) params.set("search", options.search.trim());
  if (options?.status && options.status !== "ALL") params.set("status", options.status);
  if (options?.profile && options.profile !== "ALL") params.set("profile", options.profile);
  return request(`/offers/${encodeURIComponent(offerId)}/bars?${params.toString()}`);
}

export function getOfferBarSummaryRequest(offerId: string): Promise<{
  statusCounts: Record<string, number>;
  total: number;
}> {
  return request(`/offers/${encodeURIComponent(offerId)}/bar-summary`);
}

export function getOfferBarRequest(
  offerId: string,
  barId: string,
): Promise<{ bar: ManagedCuttingBar }> {
  return request(`/offers/${encodeURIComponent(offerId)}/bars/${encodeURIComponent(barId)}`);
}

export function getOfferBarAssignmentsRequest(offerId: string): Promise<{
  availableBars: ManagedCuttingBar[];
  assignments: ManagedBarAssignment[];
}> {
  return request(`/offers/${encodeURIComponent(offerId)}/bar-assignments`);
}

export function assignOfferBarsRequest(
  offerId: string,
  input: { machineId: string; barIds: string[] },
): Promise<{ assignedCount: number }> {
  return request(`/offers/${encodeURIComponent(offerId)}/bar-assignments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function unassignOfferBarRequest(
  offerId: string,
  barId: string,
): Promise<{ bar: ManagedCuttingBar }> {
  return request(
    `/offers/${encodeURIComponent(offerId)}/bars/${encodeURIComponent(barId)}/unassign`,
    { method: "POST" },
  );
}

export function cancelOfferBarRequest(
  offerId: string,
  barId: string,
): Promise<{ bar: ManagedCuttingBar }> {
  return request(`/offers/${encodeURIComponent(offerId)}/bars/${encodeURIComponent(barId)}`, {
    method: "DELETE",
  });
}

export function getPieceImageUrl(pieceId: string, imageId: string): string {
  return `${API_URL}/pieces/${encodeURIComponent(pieceId)}/images/${encodeURIComponent(imageId)}`;
}

export function getOfferPieceImageUrl(offerId: string, pieceId: string, imageId: string): string {
  return `${API_URL}/offers/${encodeURIComponent(offerId)}/pieces/${encodeURIComponent(pieceId)}/images/${encodeURIComponent(imageId)}`;
}

export function getApiResourceUrl(path: string): string {
  return `${API_URL}${path}`;
}

export function uploadPieceImageRequest(
  pieceId: string,
  file: File,
): Promise<{ image: PieceImage }> {
  const formData = new FormData();
  formData.append("file", file);
  return uploadRequest(`/pieces/${encodeURIComponent(pieceId)}/images`, formData);
}

export function uploadOfferPieceImageRequest(
  offerId: string,
  pieceId: string,
  file: File,
): Promise<{ image: PieceImage }> {
  const formData = new FormData();
  formData.append("file", file);
  return uploadRequest(
    `/offers/${encodeURIComponent(offerId)}/pieces/${encodeURIComponent(pieceId)}/images`,
    formData,
  );
}

export function removePieceImageRequest(
  pieceId: string,
  imageId: string,
): Promise<{ success: true }> {
  return request(`/pieces/${encodeURIComponent(pieceId)}/images/${encodeURIComponent(imageId)}`, {
    method: "DELETE",
  });
}

export function removeOfferPieceImageRequest(
  offerId: string,
  pieceId: string,
  imageId: string,
): Promise<{ success: true }> {
  return request(
    `/offers/${encodeURIComponent(offerId)}/pieces/${encodeURIComponent(pieceId)}/images/${encodeURIComponent(imageId)}`,
    {
      method: "DELETE",
    },
  );
}

export type AssignmentPayload = {
  pieceUnitId: string;
  machineId: string;
  queuePosition?: number;
  reason?: string;
};

export type ReassignAssignmentPayload = {
  machineId: string;
  queuePosition?: number;
  reason: string;
};

export function getAssignmentsRequest(offerId?: string): Promise<{
  assignments: ManagedAssignment[];
  availableUnits: AssignablePieceUnit[];
}> {
  const query = offerId ? `?offerId=${encodeURIComponent(offerId)}` : "";
  return request(`/assignments${query}`);
}

export function createAssignmentRequest(
  input: AssignmentPayload,
): Promise<{ assignment: ManagedAssignment }> {
  return request("/assignments", { method: "POST", body: JSON.stringify(input) });
}

export function reassignAssignmentRequest(
  id: string,
  input: ReassignAssignmentPayload,
): Promise<{ assignment: ManagedAssignment }> {
  return request(`/assignments/${id}/reassign`, { method: "POST", body: JSON.stringify(input) });
}

export function unassignAssignmentRequest(
  id: string,
  reason: string,
): Promise<{ assignment: ManagedAssignment }> {
  return request(`/assignments/${id}/unassign`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function getProductionCurrentRequest(
  machineId?: string,
  offerId?: string,
): Promise<{
  current: ManagedProductionOperation | null;
  queue: ProductionQueueItem[];
}> {
  const params = new URLSearchParams();
  if (machineId) params.set("machineId", machineId);
  if (offerId) params.set("offerId", offerId);
  const query = params.toString();
  return request(`/production/current${query ? `?${query}` : ""}`);
}

export function startProductionRequest(input: {
  pieceUnitId: string;
  machineId: string;
}): Promise<{ operation: ManagedProductionOperation }> {
  return request("/production/start", { method: "POST", body: JSON.stringify(input) });
}

export function completeProductionUnitRequest(
  operationId: string,
): Promise<{ operation: ManagedProductionOperation }> {
  return request(`/production/${operationId}/unit-complete`, { method: "POST" });
}

export function finishProductionRequest(
  operationId: string,
): Promise<{ operation: ManagedProductionOperation }> {
  return request(`/production/${operationId}/complete`, { method: "POST" });
}

export function operatorTabletLoginRequest(connectionKey: string): Promise<{
  operator: OperatorIdentity;
  expiresAt: string;
}> {
  return request("/production/auth/login", {
    method: "POST",
    body: JSON.stringify({ connectionKey }),
  });
}

export function getCurrentTabletOperatorRequest(): Promise<{ operator: OperatorIdentity }> {
  return request("/production/auth/me");
}

export function operatorTabletLogoutRequest(): Promise<{ success: true }> {
  return request("/production/auth/logout", { method: "POST" });
}

export function getTabletMachinesRequest(): Promise<{ machines: TabletMachineOption[] }> {
  return request("/production/machines");
}

export function getAvailableOperatorsRequest(): Promise<{ operators: OperatorIdentity[] }> {
  return request("/production/operators/available");
}

export type TabletSessionProjection = {
  session: MachineSessionSummary | null;
  bars: ManagedCuttingBar[];
  activeRun: TabletProductionRun | null;
};

export function startMachineSessionRequest(input: {
  machineId: string;
  helperOperatorIds: string[];
}): Promise<TabletSessionProjection> {
  return request("/production/sessions", { method: "POST", body: JSON.stringify(input) });
}

export function getCurrentMachineSessionRequest(): Promise<TabletSessionProjection> {
  return request("/production/sessions/current");
}

export function endMachineSessionRequest(sessionId: string): Promise<{ success: true }> {
  return request(`/production/sessions/${encodeURIComponent(sessionId)}/end`, { method: "POST" });
}

export function getTabletBarRequest(barId: string): Promise<{
  bar: ManagedCuttingBar;
  session: MachineSessionSummary;
}> {
  return request(`/production/bars/${encodeURIComponent(barId)}`);
}

export function startTabletBarRequest(barId: string): Promise<{ run: TabletProductionRun }> {
  return request(`/production/bars/${encodeURIComponent(barId)}/start`, { method: "POST" });
}

export function getTabletRunRequest(runId: string): Promise<{ run: TabletProductionRun }> {
  return request(`/production/runs/${encodeURIComponent(runId)}`);
}

export function finishTabletRunRequest(runId: string): Promise<{ run: TabletProductionRun }> {
  return request(`/production/runs/${encodeURIComponent(runId)}/finish`, { method: "POST" });
}

export function reportTabletNonConformityRequest(
  runId: string,
  input: { pieceUnitId: string; reason: ProductionNonConformityReason; comment?: string },
): Promise<{ nonConformity: ProductionNonConformity }> {
  return request(`/production/runs/${encodeURIComponent(runId)}/non-conformities`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getProductionMonitorRequest(
  input: {
    offerId?: string;
    machineId?: string;
    status?: "FACONNEE" | "AFFECTEE" | "LANCEE" | "FABRIQUEE";
  } = {},
): Promise<{
  bars: ProductionMonitorBar[];
  counts: {
    shaped: number;
    assigned: number;
    inProgress: number;
    fabricated: number;
    openNonConformities: number;
  };
}> {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return request(`/production/monitor${query ? `?${query}` : ""}`);
}

export function getProductionNonConformitiesRequest(
  input: {
    offerId?: string;
    machineId?: string;
  } = {},
): Promise<{ nonConformities: ProductionNonConformity[] }> {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return request(`/production/non-conformities${query ? `?${query}` : ""}`);
}

export function getQualityPendingRequest(
  offerId?: string,
): Promise<{ units: ManagedQualityPendingUnit[] }> {
  const query = offerId ? `?offerId=${encodeURIComponent(offerId)}` : "";
  return request(`/quality/pending${query}`);
}

export function getQualityHistoryRequest(
  offerId?: string,
): Promise<{ controls: ManagedQualityControl[] }> {
  const query = offerId ? `?offerId=${encodeURIComponent(offerId)}` : "";
  return request(`/quality/history${query}`);
}

export function validateQualityRequest(
  pieceUnitId: string,
  input: {
    result: "CONFORM" | "NON_CONFORM";
    comment?: string;
    defectCategory?: QualityDefectCategory;
  },
): Promise<{ control: ManagedQualityControl }> {
  return request(`/quality/${pieceUnitId}/validate`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function requestQualityDisposition(
  pieceUnitId: string,
  input: { type: "REWORK" | "SCRAP" | "REMAKE" | "DEVIATION"; reason: string },
): Promise<{ disposition: QualityDisposition }> {
  return request(`/quality/${pieceUnitId}/disposition`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function decideQualityDeviation(
  dispositionId: string,
  input: { decision: "APPROVE" | "REJECT"; comment?: string },
): Promise<{ disposition: QualityDisposition }> {
  return request(`/quality/dispositions/${dispositionId}/decision`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getQualityDefectImageUrl(qualityControlId: string, imageId: string): string {
  return `${API_URL}/quality/controls/${encodeURIComponent(qualityControlId)}/images/${encodeURIComponent(imageId)}`;
}

export function uploadQualityDefectImageRequest(
  qualityControlId: string,
  file: File,
): Promise<{ image: QualityControlImage }> {
  const formData = new FormData();
  formData.append("file", file);
  return uploadRequest(
    `/quality/controls/${encodeURIComponent(qualityControlId)}/images`,
    formData,
  );
}

export function removeQualityDefectImageRequest(
  qualityControlId: string,
  imageId: string,
): Promise<{ success: true }> {
  return request(
    `/quality/controls/${encodeURIComponent(qualityControlId)}/images/${encodeURIComponent(imageId)}`,
    { method: "DELETE" },
  );
}

export type HistoryQueryInput = {
  page?: number;
  pageSize?: number;
  search?: string;
  eventType?: string;
  entityType?: string;
  actorUserId?: string;
  entityId?: string;
};

export function getHistoryRequest(input: HistoryQueryInput = {}): Promise<HistoryPage> {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const query = params.toString();
  return request(`/history${query ? `?${query}` : ""}`);
}

export function getOfferHistoryRequest(
  id: string,
  input: HistoryQueryInput = {},
): Promise<HistoryPage> {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const query = params.toString();
  return request(`/history/offers/${encodeURIComponent(id)}${query ? `?${query}` : ""}`);
}

export function getPieceHistoryRequest(
  id: string,
  input: HistoryQueryInput = {},
): Promise<HistoryPage> {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const query = params.toString();
  return request(`/history/pieces/${encodeURIComponent(id)}${query ? `?${query}` : ""}`);
}

export function getMachineHistoryRequest(
  id: string,
  input: HistoryQueryInput = {},
): Promise<HistoryPage> {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const query = params.toS
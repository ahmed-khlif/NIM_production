import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { ProductionProgress } from "@/components/ui/production-progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardView } from "@/features/dashboard/dashboard-view";
import { UsersView } from "@/features/users/users-view";
import { MachinesView } from "@/features/machines/machines-view";
import { PiecesView } from "@/features/pieces/pieces-view";
import { AssignmentsView } from "@/features/assignments/assignments-view";
import { OperatorView } from "@/features/operator/operator-view";
import { QualityView } from "@/features/quality/quality-view";
import { HistoryView } from "@/features/history/history-view";
import { SettingsView } from "@/features/settings/settings-view";
import { NotificationsView } from "@/features/notifications/notifications-view";
import { ProfileView } from "@/features/auth/profile-view";
import { LoginForm } from "@/features/auth/login-form";
import { OfflineStatus } from "@/components/pwa/offline-status";
import { EmptyState } from "@/components/ui/empty-state";
import { PlanningCalendarView } from "@/features/planning/planning-calendar-view";
import { AppHeader } from "@/components/layout/app-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PieceImportView } from "@/features/pieces/piece-import-view";
import { FaconnagePreparationView } from "@/features/pieces/faconnage-preparation-view";
import { PieceDetailView } from "@/features/pieces/piece-detail-view";
import { MachineDetailView } from "@/features/machines/machine-detail-view";
import { OffersView } from "@/features/offers/offers-view";
import { OfferOverviewView } from "@/features/offers/offer-overview-view";
import { OfferBarsView } from "@/features/offers/offer-bars-view";
import { OperatorTabletLoginView } from "@/features/operator/operator-tablet-login-view";
import { OperatorTabletSessionView } from "@/features/operator/operator-tablet-session-view";
import {
  getOffersRequest,
  getDashboardOverviewRequest,
  loginRequest,
  getOfferRequest,
  getOfferCuttingPlansRequest,
  cancelCuttingPlanRequest,
  getOfferPiecesRequest,
  getOfferBarSummaryRequest,
  getOfferProductionSummaryRequest,
  getHistoryRequest,
  getProductionCurrentRequest,
  getQualityHistoryRequest,
  getCurrentTabletOperatorRequest,
  getCurrentMachineSessionRequest,
  operatorTabletLoginRequest,
} from "@/features/auth/auth-client";

const sidebarTestState = vi.hoisted(() => ({
  pathname: "/dashboard" as string,
  role: "ADMIN" as string,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => sidebarTestState.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useParams: () => ({ id: "piece-1" }),
}));
vi.mock("next/image", () => ({
  default: ({ priority: _priority, fill: _fill, ...props }: Record<string, unknown>) => (
    <img {...props} />
  ),
}));
vi.mock("recharts", () => {
  const ChartStub = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Bar: ChartStub,
    BarChart: ChartStub,
    Area: ChartStub,
    AreaChart: ChartStub,
    CartesianGrid: ChartStub,
    Cell: ChartStub,
    Legend: ChartStub,
    Pie: ChartStub,
    PieChart: ChartStub,
    ResponsiveContainer: ChartStub,
    Tooltip: ChartStub,
    XAxis: ChartStub,
    YAxis: ChartStub,
  };
});
vi.mock("react-big-calendar", () => ({
  Calendar: ({ events }: { events: Array<{ title: string }> }) => (
    <div data-testid="calendar-mock">
      {events.map((event) => (
        <span key={event.title}>{event.title}</span>
      ))}
    </div>
  ),
  dateFnsLocalizer: () => ({}),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "1", username: "admin", displayName: "Admin", role: sidebarTestState.role },
    logout: vi.fn(),
    refresh: vi
      .fn()
      .mockResolvedValue({ id: "1", username: "admin", displayName: "Admin", role: "ADMIN" }),
  }),
}));
vi.mock("@/features/auth/auth-client", () => ({
  ApiError: class ApiError extends Error {},
  loginRequest: vi.fn().mockResolvedValue({
    user: { id: "1", username: "admin", displayName: "Admin", role: "ADMIN" },
  }),
  operatorTabletLoginRequest: vi.fn(),
  getCurrentTabletOperatorRequest: vi.fn().mockResolvedValue({ operator: null }),
  getCurrentMachineSessionRequest: vi
    .fn()
    .mockResolvedValue({ session: null, bars: [], activeRun: null }),
  getTabletMachinesRequest: vi.fn().mockResolvedValue({ machines: [] }),
  getAvailableOperatorsRequest: vi.fn().mockResolvedValue({ operators: [] }),
  startMachineSessionRequest: vi.fn(),
  operatorTabletLogoutRequest: vi.fn(),
  endMachineSessionRequest: vi.fn(),
  getOffersRequest: vi.fn().mockResolvedValue({ offers: [] }),
  createOfferRequest: vi.fn(),
  updateOfferRequest: vi.fn(),
  archiveOfferRequest: vi.fn(),
  restoreOfferRequest: vi.fn(),
  deleteOfferRequest: vi.fn(),
  getOfferRequest: vi.fn().mockResolvedValue({ offer: { id: "offer-1", status: "DRAFT" } }),
  getOfferBarsRequest: vi.fn().mockResolvedValue({ bars: [], statusCounts: {}, total: 0 }),
  getOfferBarSummaryRequest: vi.fn().mockResolvedValue({ statusCounts: {}, total: 0 }),
  getOfferProductionSummaryRequest: vi
    .fn()
    .mockResolvedValue({ summary: { statusCounts: {}, totals: { pendingQuality: 0 } } }),
  getOfferBarAssignmentsRequest: vi.fn().mockResolvedValue({ availableBars: [], assignments: [] }),
  assignOfferBarsRequest: vi.fn(),
  unassignOfferBarRequest: vi.fn(),
  cancelOfferBarRequest: vi.fn(),
  getUsersRequest: vi.fn().mockResolvedValue({
    users: [
      {
        id: "1",
        username: "admin",
        displayName: "Admin",
        role: "ADMIN",
        isActive: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        lastLoginAt: null,
      },
    ],
  }),
  createUserRequest: vi.fn(),
  updateUserRequest: vi.fn(),
  setUserActiveRequest: vi.fn(),
  resetUserPasswordRequest: vi.fn(),
  changePasswordRequest: vi.fn().mockResolvedValue({ success: true }),
  getMachinesRequest: vi.fn().mockResolvedValue({
    machines: [
      {
        id: "machine-1",
        name: "CNC-06",
        internalNumber: "CNC-06",
        type: "Découpe",
        status: "ACTIVE",
        description: null,
        location: "Atelier A",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  }),
  createMachineRequest: vi.fn(),
  updateMachineRequest: vi.fn(),
  setMachineStatusRequest: vi.fn(),
  getMachineRequest: vi.fn().mockResolvedValue({
    machine: {
      id: "machine-1",
      name: "CNC-06",
      internalNumber: "CNC-06",
      type: "Découpe",
      status: "ACTIVE",
      description: null,
      location: "Atelier A",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      activeOperationCount: 0,
      queue: [],
      assignedBarCount: 0,
      cuttingBars: [],
      barMetrics: { assigned: 0, inProgress: 0, fabricatedToday: 0, fabricatedTotal: 0 },
    },
  }),
  getMachineHistoryRequest: vi
    .fn()
    .mockResolvedValue({ events: [], page: 1, pageSize: 8, total: 0, totalPages: 0 }),
  getPiecesRequest: vi.fn().mockResolvedValue({
    pieces: [
      {
        id: "piece-1",
        offerId: "offer-1",
        productionStatusCounts: { PENDING: 3, FACONNEE: 0, AFFECTEE: 0, LANCEE: 0, FABRIQUEE: 0 },
        isUnstarted: true,
        reference: "CMD-001",
        quantity: 3,
        completedUnits: 1,
        profile: "Profil 40",
        quality: "S275JR",
        lengthMm: 6000,
        unitWeightKg: 2.4,
        totalWeightKg: 7.2,
        designation: "POUTRE",
        priority: "HIGH",
        dueDate: "2026-12-01T23:59:59.000Z",
        status: "PLANNED",
        createdById: "1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        imageCount: 0,
        coverImageUrl: null,
      },
    ],
    profiles: ["Profil 40"],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  }),
  getAllPiecesRequest: vi.fn().mockResolvedValue({
    pieces: [
      {
        id: "piece-planning-1",
        reference: "CMD-001",
        dueDate: "2026-12-01T23:59:59.000Z",
        status: "PLANNED",
        priority: "HIGH",
        profile: "IPE200",
      },
    ],
  }),
  getOfferPiecesRequest: vi.fn().mockResolvedValue({ pieces: [] }),
  getPieceRequest: vi.fn().mockResolvedValue({
    piece: {
      id: "piece-1",
      reference: "CMD-001",
      quantity: 3,
      completedUnits: 1,
      profile: "Profil 40",
      quality: "S275JR",
      lengthMm: 6000,
      unitWeightKg: 2.4,
      totalWeightKg: 7.2,
      designation: "POUTRE",
      priority: "HIGH",
      dueDate: "2026-12-01T23:59:59.000Z",
      status: "PLANNED",
      createdById: "1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      imageCount: 0,
      coverImageUrl: null,
      images: [],
      units: [
        {
          id: "unit-1",
          pieceId: "piece-1",
          sequenceNumber: 1,
          status: "ASSIGNED",
          currentMachineId: "machine-1",
          currentMachineName: "CNC-06",
          currentOperatorId: null,
          currentOperatorName: null,
          startedAt: null,
          manufacturedAt: null,
          controlledAt: null,
          qualityResult: null,
          activeAssignment: {
            id: "assignment-1",
            machineId: "machine-1",
            machineName: "CNC-06",
            queuePosition: 1,
            assignedAt: "2026-01-01T08:00:00.000Z",
            reason: null,
          },
        },
      ],
    },
  }),
  getPieceHistoryRequest: vi
    .fn()
    .mockResolvedValue({ events: [], page: 1, pageSize: 8, total: 0, totalPages: 0 }),
  previewPieceImportRequest: vi.fn(),
  commitPieceImportRequest: vi.fn(),
  getAvailableProfilesRequest: vi.fn().mockResolvedValue({
    profiles: [
      { profile: "IPE200", family: "IPE", pieceCount: 2, totalQuantity: 5 },
      { profile: "HEA300", family: "HEA", pieceCount: 1, totalQuantity: 2 },
      { profile: "DEMI-IPE400", family: "OTHER", pieceCount: 1, totalQuantity: 1 },
    ],
    totalProfiles: 3,
    totalPieceRows: 4,
  }),
  getOfferAvailableProfilesRequest: vi.fn().mockResolvedValue({
    profiles: [
      { profile: "IPE200", family: "IPE", pieceCount: 2, totalQuantity: 5 },
      { profile: "HEA300", family: "HEA", pieceCount: 1, totalQuantity: 2 },
      { profile: "DEMI-IPE400", family: "OTHER", pieceCount: 1, totalQuantity: 1 },
    ],
    totalProfiles: 3,
    totalPieceRows: 4,
  }),
  prepareFaconnageRequest: vi.fn().mockResolvedValue({
    preparation: {
      preparationId: "prep-1",
      selectedProfiles: ["IPE200"],
      requirements: [{ profile: "IPE200", lengthMm: 6000, quantity: 5 }],
      summary: { selectedProfileCount: 1, pieceRows: 2, totalQuantity: 5, lengthCount: 1 },
    },
  }),
  prepareOfferFaconnageRequest: vi.fn().mockResolvedValue({
    preparation: {
      preparationId: "prep-1",
      selectedProfiles: ["IPE200"],
      requirements: [{ profile: "IPE200", lengthMm: 6000, quantity: 5 }],
      summary: { selectedProfileCount: 1, pieceRows: 2, totalQuantity: 5, lengthCount: 1 },
    },
  }),
  optimizeFaconnageRequest: vi.fn().mockResolvedValue({
    optimization: {
      plan: {
        id: "plan-1",
        reference: "OFF-001-CP-001",
        status: "DRAFT",
        createdAt: "2026-10-16T10:00:00.000Z",
      },
      proposals: Array.from({ length: 5 }, (_, index) => ({
        id: `proposal-${index + 1}`,
        reference: `OFF-001-P${String(index + 1).padStart(3, "0")}`,
        ordinal: index + 1,
        profile: "IPE200",
        rawLengthMm: 6000,
        usedLengthMm: 6000,
        wasteMm: 0,
        cuts: [{ lengthMm: 6000, quantity: 1 }],
        status: "PROPOSED",
        pieceUnitCount: 1,
        cuttingBarId: null,
        cuttingBarReference: null,
      })),
      profiles: [
        {
          profile: "IPE200",
          status: "OPTIMAL",
          totalBars: 5,
          totalRawLengthMm: 30000,
          totalUsedLengthMm: 30000,
          totalWasteMm: 0,
          utilizationRate: 100,
          bars: Array.from({ length: 5 }, () => ({
            rawLengthMm: 6000,
            cuts: [{ lengthMm: 6000, quantity: 1 }],
            usedLengthMm: 6000,
            wasteMm: 0,
            utilizationRate: 100,
          })),
          requirementSummary: [{ lengthMm: 6000, requestedQuantity: 5, producedQuantity: 5 }],
          alternatives: [],
        },
      ],
      summary: {
        profileCount: 1,
        totalBars: 5,
        totalRawLengthMm: 30000,
        totalUsedLengthMm: 30000,
        totalWasteMm: 0,
        utilizationRate: 100,
      },
    },
  }),
  validateCuttingPlanBarsRequest: vi.fn().mockResolvedValue({
    plan: {
      id: "plan-1",
      reference: "OFF-001-CP-001",
      status: "PARTIALLY_VALIDATED",
      validatedBarCount: 1,
      remainingBarCount: 4,
      barsCreated: 1,
    },
  }),
  cancelCuttingPlanRequest: vi.fn(),
  deleteDraftCuttingPlanRequest: vi.fn(),
  getOfferCuttingPlansRequest: vi.fn().mockResolvedValue({ plans: [] }),
  getOfferCuttingPlanRequest: vi.fn(),
  createPieceRequest: vi.fn(),
  updatePieceRequest: vi.fn(),
  archivePieceRequest: vi.fn(),
  getAssignmentsRequest: vi.fn().mockResolvedValue({
    assignments: [
      {
        id: "assignment-1",
        pieceUnitId: "unit-1",
        pieceId: "piece-1",
        reference: "CMD-001",
        sequenceNumber: 1,
        profile: "Profil 40",
        unitStatus: "ASSIGNED",
        pieceStatus: "ASSIGNED",
        priority: "HIGH",
        machineId: "machine-1",
        machineName: "CNC-06",
        machineStatus: "ACTIVE",
        assignedById: "1",
        assignedAt: "2026-01-01T08:00:00.000Z",
        queuePosition: 1,
        active: true,
        reason: null,
      },
    ],
    availableUnits: [],
  }),
  createAssignmentRequest: vi.fn(),
  reassignAssignmentRequest: vi.fn(),
  unassignAssignmentRequest: vi.fn(),
  getProductionCurrentRequest: vi.fn().mockResolvedValue({ current: null, queue: [] }),
  startProductionRequest: vi.fn(),
  completeProductionUnitRequest: vi.fn(),
  finishProductionRequest: vi.fn(),
  getQualityPendingRequest: vi.fn().mockResolvedValue({
    units: [
      {
        pieceUnitId: "unit-quality-1",
        pieceId: "piece-1",
        reference: "CMD-001",
        sequenceNumber: 1,
        profile: "Profil 40",
        lengthMm: 6000,
        priority: "HIGH",
        status: "QUALITY_PENDING",
        pieceStatus: "COMPLETED",
        machineName: "CNC-06",
        operatorName: "Opérateur",
        manufacturedAt: "2026-01-01T10:00:00.000Z",
      },
    ],
  }),
  getQualityHistoryRequest: vi.fn().mockResolvedValue({ controls: [] }),
  getProductionNonConformitiesRequest: vi.fn().mockResolvedValue({ nonConformities: [] }),
  validateQualityRequest: vi.fn(),
  requestQualityDisposition: vi.fn().mockResolvedValue({ disposition: { id: "disposition-1" } }),
  decideQualityDeviation: vi.fn(),
  getQualityDefectImageUrl: vi.fn(
    (controlId: string, imageId: string) => `/quality/${controlId}/${imageId}`,
  ),
  uploadQualityDefectImageRequest: vi.fn(),
  removeQualityDefectImageRequest: vi.fn(),
  getHistoryRequest: vi.fn().mockResolvedValue({
    events: [
      {
        id: "event-1",
        eventType: "QUALITY_VALIDATED",
        entityType: "QUALITY_CONTROL",
        entityId: "control-1",
        actorUserId: "1",
        actorName: "Admin",
        actorRole: "ADMIN",
        metadata: { result: "CONFORM" },
        createdAt: "2026-01-01T10:00:00.000Z",
      },
    ],
    page: 1,
    pageSize: 25,
    total: 1,
    totalPages: 1,
  }),
  getDashboardOverviewRequest: vi.fn().mockResolvedValue({
    summary: {
      totalPieces: 1,
      totalUnits: 3,
      completedUnits: 1,
      progressPercent: 33,
      inProductionUnits: 1,
      delayedPieces: 0,
      activeMachines: 1,
      maintenanceMachines: 0,
      totalMachines: 1,
      openNonConformities: 0,
    },
    machineLoads: [],
    recentActivity: [],
    delayedPieces: [],
    activePieces: [],
    statusBreakdown: [],
    unitStatusBreakdown: [],
    priorityBreakdown: [],
    quality: {
      pendingUnits: 0,
      inspectedUnits: 0,
      conformUnits: 0,
      nonConformUnits: 0,
      conformityRate: 0,
    },
    dueDateSummary: {
      overduePieces: 0,
      dueTodayPieces: 0,
      dueNextSevenDaysPieces: 0,
      withoutDueDatePieces: 0,
    },
    productionTrend: [],
    trendDays: 14,
  }),
  getSettingsRequest: vi.fn().mockResolvedValue({
    settings: { density: "comfortable", notificationsEnabled: true, updatedAt: null },
  }),
  updateSettingsRequest: vi.fn().mockResolvedValue({
    settings: {
      density: "compact",
      notificationsEnabled: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  }),
  getNotificationsRequest: vi.fn().mockResolvedValue({
    notifications: [
      {
        id: "event-1",
        eventType: "PRODUCTION_STARTED",
        title: "Production started",
        message: "PRODUCTION_OPERATION · operation-1",
        createdAt: "2026-01-01T10:00:00.000Z",
        read: false,
      },
    ],
    unreadCount: 1,
  }),
}));
import { AppSidebar } from "@/components/layout/app-sidebar";

afterEach(() => {
  sidebarTestState.pathname = "/dashboard";
  sidebarTestState.role = "ADMIN";
});

describe("shared UI foundation", () => {
  it("validates tablet operator credentials before calling the API", async () => {
    vi.mocked(getCurrentTabletOperatorRequest).mockRejectedValueOnce(new Error("Unauthorized"));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OperatorTabletLoginView />
      </QueryClientProvider>,
    );
    const submit = await screen.findByRole("button", { name: "Se connecter" });
    await waitFor(() => expect(submit).toBeEnabled());

    fireEvent.submit(submit.closest("form") as HTMLFormElement);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(operatorTabletLoginRequest).not.toHaveBeenCalled();
  });

  it("shows only bars in the authenticated operator's active machine session", async () => {
    vi.mocked(getCurrentTabletOperatorRequest).mockResolvedValueOnce({
      operator: { id: "operator-1", displayName: "Ahmed Ben Ali" },
    });
    vi.mocked(getCurrentMachineSessionRequest).mockResolvedValueOnce({
      session: {
        id: "session-1",
        status: "ACTIVE",
        machineId: "machine-1",
        machineName: "Kaltenbach 01",
        machineInternalNumber: "KAL-01",
        leadOperatorId: "operator-1",
        startedAt: "2026-01-01T08:00:00.000Z",
        endedAt: null,
        team: [{ id: "operator-1", displayName: "Ahmed Ben Ali", role: "LEAD" }],
      },
      bars: [
        {
          id: "bar-1",
          offerId: "offer-1",
          offerReference: "OFF-2026-0042",
          cuttingPlanId: "plan-1",
          reference: "OFF42-B001",
          profile: "IPE200",
          rawLengthMm: 12000,
          usedLengthMm: 11800,
          wasteMm: 200,
          status: "AFFECTEE",
          machine: { id: "machine-1", name: "Kaltenbach 01", internalNumber: "KAL-01" },
          items: [
            {
              id: "bar-item-1",
              pieceUnitId: "unit-1",
              pieceId: "piece-1",
              reference: "P-001",
              sequenceNumber: 1,
              lengthMm: 3200,
              weightKg: 71.2,
              status: "ASSIGNED",
              productionStatus: "AFFECTEE",
              qualityStatus: "NOT_INSPECTED",
              active: true,
            },
          ],
          createdAt: "2026-01-01T07:00:00.000Z",
        },
      ],
      activeRun: null,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OperatorTabletSessionView />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Kaltenbach 01" })).toBeInTheDocument();
    expect(screen.getByText("OFF42-B001")).toBeInTheDocument();
    expect(screen.getByText("Barres à fabriquer")).toBeInTheDocument();
    expect(screen.queryByText("Aucune barre en attente")).not.toBeInTheDocument();
  });

  it("renders the Offer-first workspace with a useful empty state", async () => {
    vi.mocked(getOffersRequest).mockResolvedValueOnce({
      offers: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
      facets: { clients: [], sites: [] },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OffersView />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Offres" })).toBeInTheDocument();
    expect(await screen.findByText("Aucune offre")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer la première offre" })).toBeEnabled();
  });

  it("keeps Offer overview production metrics in unit counts, separate from bars", async () => {
    vi.mocked(getOfferRequest).mockResolvedValueOnce({
      offer: {
        id: "offer-1",
        reference: "OFF-001",
        revision: "A",
        name: "Atelier Nord",
        clientName: "Client A",
        site: "Tunis",
        description: null,
        status: "IN_PRODUCTION",
        archivedAt: null,
        createdAt: "2026-10-01T08:00:00.000Z",
        updatedAt: "2026-10-16T08:00:00.000Z",
        pieceRows: 12,
        totalUnits: 50,
        manufacturedUnits: 18,
        profileCount: 4,
        progressRate: 36,
        plannedBars: 10,
        latestPlan: null,
        recentImports: [],
        cuttingPlans: [],
      },
    } as never);
    vi.mocked(getOfferBarSummaryRequest).mockResolvedValueOnce({
      total: 10,
      statusCounts: { FACONNEE: 2, AFFECTEE: 3, LANCEE: 1, FABRIQUEE: 4 },
    });
    vi.mocked(getOfferProductionSummaryRequest).mockResolvedValueOnce({
      summary: { statusCounts: { PENDING: 7 }, totals: { pendingQuality: 2 } },
    } as never);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OfferOverviewView offerId="offer-1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("État des unités")).toBeInTheDocument();
    expect(screen.getByText("18 / 50 unités fabriquées")).toBeInTheDocument();
    expect(screen.getByText("À façonner")).toBeInTheDocument();
    expect(screen.getByText("En fabrication")).toBeInTheDocument();
    expect(screen.queryByText("À affecter")).not.toBeInTheDocument();
    expect(screen.getByText("2 unité(s) attendent un contrôle qualité.")).toBeInTheDocument();
    expect(screen.queryByText("profils détaillés")).not.toBeInTheDocument();
  });

  it("renders a status badge and progress value", () => {
    render(
      <>
        <StatusBadge tone="active">Active</StatusBadge>
        <ProductionProgress completed={8} total={10} />
      </>,
    );
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("8 / 10")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("renders the supplied product illustration in empty states", () => {
    render(
      <EmptyState
        title="Aucune machine"
        description="Aucune machine configurée."
        illustration="/assets/illustrations/machine-maintenance.png"
        illustrationAlt="Machine en maintenance"
      />,
    );
    expect(screen.getByRole("img", { name: "Machine en maintenance" })).toHaveAttribute(
      "src",
      expect.stringContaining("machine-maintenance.png"),
    );
  });

  it("keeps buttons accessible by their visible label", () => {
    render(<Button>Se connecter</Button>);
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeInTheDocument();
  });

  it("gives shared buttons and inputs the minimum touch-target height", () => {
    render(
      <>
        <Button>Action principale</Button>
        <Button size="icon" aria-label="Ouvrir le menu">
          Menu
        </Button>
        <Input aria-label="Recherche" />
      </>,
    );

    expect(screen.getByRole("button", { name: "Action principale" })).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Ouvrir le menu" })).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Ouvrir le menu" })).toHaveClass("min-w-11");
    expect(screen.getByRole("textbox", { name: "Recherche" })).toHaveClass("min-h-11");
  });

  it("exposes progress semantics for assistive technology", () => {
    render(<ProductionProgress completed={8} total={10} />);
    expect(
      screen
        .getAllByRole("progressbar")
        .every((element) => element.getAttribute("aria-valuenow") === "80"),
    ).toBe(true);
  });

  it("renders the responsive application navigation", () => {
    render(<AppSidebar />);
    expect(screen.getByRole("link", { name: "Tableau de bord" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Machines" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ouvrir le menu" })).toBeInTheDocument();
  });

  it("uses one shared user directory entry for operator accounts", () => {
    const { rerender } = render(<AppSidebar />);

    expect(screen.getByRole("link", { name: "Utilisateurs" })).toHaveAttribute("href", "/users");
    expect(screen.queryByRole("link", { name: "Opérateurs" })).not.toBeInTheDocument();

    sidebarTestState.role = "PRODUCTION_MANAGER";
    rerender(<AppSidebar />);

    expect(screen.getByRole("link", { name: "Opérateurs" })).toHaveAttribute(
      "href",
      "/users?role=OPERATOR",
    );
    expect(screen.queryByRole("link", { name: "Utilisateurs" })).not.toBeInTheDocument();
  });

  it("shows the Offers navigation entry", () => {
    render(<AppSidebar />);
    expect(screen.getByRole("link", { name: "Offres" })).toHaveAttribute("href", "/offers");
  });

  it("marks an Offer descendant as the active sidebar destination", () => {
    const { rerender } = render(<AppSidebar />);
    sidebarTestState.pathname = "/offers/offer-1/pieces";
    rerender(<AppSidebar />);
    expect(screen.getByRole("link", { name: "Offres" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps the global sidebar focused on cross-offer resources", () => {
    sidebarTestState.pathname = "/offers/offer-1/pieces/import";
    render(<AppSidebar />);

    expect(screen.getByRole("link", { name: "Offres" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Vue générale" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Liste des pièces" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Affectations" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Production" })).not.toBeInTheDocument();
  });

  it("leaves Offer-specific navigation to the Offer workspace", () => {
    sidebarTestState.pathname = "/offers/offer-1";
    render(<AppSidebar />);

    expect(
      screen.queryByRole("button", { name: "Réduire les sections des offres" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Afficher les sections des offres" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Offres" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps Offer navigation manager-only", () => {
    sidebarTestState.pathname = "/offers";
    sidebarTestState.role = "OPERATOR";
    render(<AppSidebar />);

    expect(screen.queryByRole("link", { name: "Offres" })).not.toBeInTheDocument();
  });

  it("personalizes the dashboard from the authenticated user", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardView />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Bonjour, Admin" })).toBeInTheDocument();
  });

  it("surfaces operational exceptions as direct dashboard actions", async () => {
    vi.mocked(getDashboardOverviewRequest).mockResolvedValueOnce({
      summary: {
        totalPieces: 4,
        totalUnits: 8,
        completedUnits: 2,
        progressPercent: 25,
        inProductionUnits: 2,
        delayedPieces: 3,
        activeMachines: 1,
        maintenanceMachines: 1,
        totalMachines: 2,
        openNonConformities: 2,
      },
      machineLoads: [],
      recentActivity: [],
      delayedPieces: [],
      activePieces: [],
      statusBreakdown: [],
      unitStatusBreakdown: [],
      priorityBreakdown: [],
      quality: {
        pendingUnits: 5,
        inspectedUnits: 0,
        conformUnits: 0,
        nonConformUnits: 0,
        conformityRate: 0,
      },
      dueDateSummary: {
        overduePieces: 3,
        dueTodayPieces: 0,
        dueNextSevenDaysPieces: 0,
        withoutDueDatePieces: 0,
      },
      productionTrend: [],
      trendDays: 14,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardView />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "À traiter en priorité" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Pièces en retard/ })).toHaveAttribute(
      "href",
      "/offers",
    );
    expect(screen.getByRole("link", { name: /Contrôles qualité en attente/ })).toHaveAttribute(
      "href",
      "/quality",
    );
    expect(screen.getByRole("link", { name: /Machines en maintenance/ })).toHaveAttribute(
      "href",
      "/machines",
    );
  });

  it("renders API-backed dashboard charts", () => {
    render(
      <DashboardCharts
        machineLoads={[
          {
            id: "machine-1",
            name: "CNC-06",
            internalNumber: "CNC-06",
            type: "Découpe",
            status: "ACTIVE",
            queueCount: 2,
            inProgressCount: 1,
            utilization: 33,
          },
        ]}
        statusBreakdown={[
          { status: "IN_PROGRESS", count: 1 },
          { status: "COMPLETED", count: 2 },
        ]}
        unitStatusBreakdown={[{ status: "IN_PROGRESS", count: 3 }]}
        priorityBreakdown={[{ priority: "HIGH", count: 1 }]}
        quality={{
          pendingUnits: 0,
          inspectedUnits: 2,
          conformUnits: 2,
          nonConformUnits: 0,
          conformityRate: 100,
          defectBreakdown: [],
          dispositionBreakdown: [],
          pendingDeviationCount: 0,
        }}
        dueDateSummary={{
          overduePieces: 0,
          dueTodayPieces: 0,
          dueNextSevenDaysPieces: 1,
          withoutDueDatePieces: 0,
        }}
        productionTrend={[
          {
            date: "2026-01-01",
            startedUnits: 1,
            completedUnits: 1,
            conformUnits: 1,
            nonConformUnits: 0,
          },
        ]}
        trendDays={14}
      />,
    );
    expect(screen.getByTestId("machine-load-chart")).toBeInTheDocument();
    expect(screen.getByTestId("piece-status-chart")).toBeInTheDocument();
    expect(screen.getByTestId("unit-flow-chart")).toBeInTheDocument();
    expect(screen.getByTestId("priority-chart")).toBeInTheDocument();
    expect(screen.getByTestId("production-trend-chart")).toBeInTheDocument();
    expect(screen.getByTestId("quality-defect-chart")).toBeInTheDocument();
    expect(screen.getByTestId("quality-disposition-chart")).toBeInTheDocument();
  });

  it("renders the planning calendar from persisted piece due dates", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PlanningCalendarView />
      </QueryClientProvider>,
    );
    expect(await screen.findByTestId("planning-calendar")).toBeInTheDocument();
    expect(screen.getByText("CMD-001")).toBeInTheDocument();
  });

  it("shows the authenticated role and notification entry point", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppHeader />
        </TooltipProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText("Administrateur")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /activité récente/i })).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /thème sombre|thème clair/i }),
    ).toBeInTheDocument();
  });

  it("loads the admin users directory", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <UsersView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Répertoire des utilisateurs")).toBeInTheDocument();
    expect((await screen.findAllByText("Admin")).length).toBeGreaterThan(0);
  });

  it("supports user directory filtering and profile password visibility", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <UsersView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("1 utilisateur affiché sur 1")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Rechercher un utilisateur" }), {
      target: { value: "unknown" },
    });
    expect(await screen.findByText("Aucun résultat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réinitialiser" })).toBeInTheDocument();

    render(
      <QueryClientProvider client={queryClient}>
        <ProfileView />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Profil et sécurité" })).toBeInTheDocument();
    const showCurrent = screen.getByRole("button", { name: "Afficher mot de passe actuel" });
    fireEvent.click(showCurrent);
    expect(screen.getByLabelText("Mot de passe actuel")).toHaveAttribute("type", "text");
  });

  it("loads the machines directory", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MachinesView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Parc machines")).toBeInTheDocument();
    expect((await screen.findAllByText("CNC-06")).length).toBeGreaterThan(0);
  });

  it("renders the API-backed machine detail actions and queue", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MachineDetailView />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "CNC-06" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copier le numéro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualiser" })).toBeInTheDocument();
    expect(screen.getByText("Barres associées à la machine")).toBeInTheDocument();
  });

  it("shows the Offer bar-list empty state from persisted API data", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OfferBarsView offerId="offer-1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Aucune barre façonnée")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ouvrir le façonnage/ })).toHaveAttribute(
      "href",
      "/offers/offer-1/faconnage",
    );
  });

  it("exposes machine status filtering and a refresh result count", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MachinesView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("1 machine(s) affichée(s) sur 1")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Filtrer par statut machine" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualiser" })).toBeInTheDocument();
  });

  it("loads the production pieces directory with Tekla business columns", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PiecesView />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Pièces" })).toBeInTheDocument();
    expect((await screen.findAllByText("CMD-001")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("S275JR").length).toBeGreaterThan(0);
    expect(screen.getAllByText("POUTRE").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pds Tot").length).toBeGreaterThan(0);
  });

  it("allows editing untouched pieces in production but protects pieces already started", async () => {
    const user = userEvent.setup();
    vi.mocked(getOfferRequest).mockResolvedValueOnce({
      offer: { id: "offer-1", status: "IN_PRODUCTION" },
    } as never);
    const basePiece = {
      id: "piece-1",
      offerId: "offer-1",
      productionStatusCounts: { PENDING: 2, FACONNEE: 0, AFFECTEE: 0, LANCEE: 0, FABRIQUEE: 0 },
      reference: "CMD-001",
      quantity: 2,
      completedUnits: 0,
      profile: "IPE200",
      quality: "S275JR",
      lengthMm: 6000,
      unitWeightKg: 2.4,
      totalWeightKg: 4.8,
      designation: "POUTRE",
      priority: "NORMAL",
      dueDate: null,
      status: "PLANNED",
      createdById: "1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      imageCount: 0,
      coverImageUrl: null,
    };
    vi.mocked(getOfferPiecesRequest).mockResolvedValueOnce({
      pieces: [
        { ...basePiece, isUnstarted: true },
        {
          ...basePiece,
          id: "piece-2",
          reference: "CMD-002",
          status: "IN_PROGRESS",
          productionStatusCounts: { PENDING: 1, FACONNEE: 1, AFFECTEE: 0, LANCEE: 0, FABRIQUEE: 0 },
          isUnstarted: false,
        },
      ],
    } as never);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PiecesView offerId="offer-1" />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(
        /vous pouvez modifier une pièce tant que toutes ses unités sont encore en attente/i,
      ),
    ).toBeInTheDocument();
    await user.click((await screen.findAllByRole("button", { name: "Actions CMD-001" }))[0]);
    expect(await screen.findByRole("menuitem", { name: "Modifier" })).toBeEnabled();

    await user.keyboard("{Escape}");
    await user.click((await screen.findAllByRole("button", { name: "Actions CMD-002" }))[0]);
    expect(
      await screen.findByRole("menuitem", { name: "Déjà engagée en production" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("exposes piece search, profile filtering and pagination", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PiecesView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/1–1 sur 1 pièce/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filtrer par profil" })).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Rechercher par repère, profil ou désignation" }),
    ).toBeInTheDocument();
  });

  it("supports selecting a CSV and keeps the import preview server-backed", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PieceImportView />
      </QueryClientProvider>,
    );
    const file = new File(
      ["reference,quantity,profile,lengthMm\nCMD-002,2,Profil 40,6000"],
      "pieces.csv",
      { type: "text/csv" },
    );
    fireEvent.change(screen.getByLabelText("Fichier Tekla des pièces"), {
      target: { files: [file] },
    });
    expect(await screen.findByText("pieces.csv")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyser et continuer" })).toBeInTheDocument();
  });

  it("supports exact family selection for FaÃ§onnage preparation", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <FaconnagePreparationView offerId="offer-1" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Profils à traiter")).toBeInTheDocument();
    expect(await screen.findByText("DEMI-IPE400")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Progression du façonnage" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByLabelText("Sélectionner tous les profils IPE")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Sélectionner tous les profils IPE"));
    expect(screen.getByText(/profils sélectionnés/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continuer vers Façonnage" }));
    expect(await screen.findByTestId("faconnage-preparation-result")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Progression du façonnage" })).toHaveAttribute("aria-valuenow", "2");
    expect(screen.getAllByText(/6.?000 mm/).length).toBeGreaterThan(0);
    expect(screen.getByText("Configurer les longueurs brutes")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Longueur brute 1 pour IPE200"), {
      target: { value: "6000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Optimiser la mise en barres" }));
    expect(
      (await screen.findAllByText("Plan recommandé de mise en barres")).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole("progressbar", { name: "Progression du façonnage" }).at(-1)).toHaveAttribute("aria-valuenow", "3");
    const profileDisclosure = screen.getAllByRole("button", { name: /^Masquer le détail de / })[0];
    const profileDetailsId = profileDisclosure.getAttribute("aria-controls");
    expect(profileDetailsId).toBeTruthy();
    fireEvent.click(profileDisclosure);
    expect(screen.queryByTestId(profileDetailsId as string)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Afficher le détail de / }));
    expect(screen.getByTestId(profileDetailsId as string)).toBeInTheDocument();
    const validateButton = await screen.findByRole("button", { name: "Valider les 0 barre(s)" });
    expect(validateButton).toBeDisabled();
    const recommendationDisclosure = screen.getByRole("button", { name: /Plan recommandé de mise en barres/ });
    expect(recommendationDisclosure).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(recommendationDisclosure);
    expect(screen.getByRole("searchbox", { name: "Rechercher dans les barres proposées" })).toBeInTheDocument();
    const profileDisclosureForBars = screen.getByRole("button", { name: "Afficher les propositions IPE200" });
    expect(profileDisclosureForBars).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("combobox", { name: "Barres par page" })).toBeInTheDocument();
    fireEvent.click(profileDisclosureForBars);
    fireEvent.click(screen.getByRole("checkbox", { name: "Sélectionner OFF-001-P001" }));
    expect(screen.getByRole("button", { name: "Valider les 1 barre(s)" })).toBeEnabled();
  });

  it("offers audited removal of a plan remainder and keeps the continue bar sticky", async () => {
    vi.mocked(getOfferCuttingPlansRequest).mockResolvedValueOnce({
      plans: [
        {
          id: "plan-draft",
          reference: "OFF-001-CP-001",
          status: "PARTIALLY_VALIDATED",
          validatedBarCount: 1,
          remainingBarCount: 2,
          totalBars: 3,
          totalWasteMm: 600,
          utilizationRate: 96,
          createdAt: "2026-10-16T10:00:00.000Z",
        },
      ],
    });
    vi.mocked(cancelCuttingPlanRequest).mockResolvedValueOnce({
      plan: { id: "plan-draft", status: "CANCELLED", cancelledAt: "2026-10-16T10:00:00.000Z" },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <FaconnagePreparationView offerId="offer-1" />
      </QueryClientProvider>,
    );

    const continueButton = await screen.findByRole("button", { name: "Continuer vers Façonnage" });
    expect(continueButton.parentElement?.parentElement).toHaveClass("sticky");
    await userEvent.click(await screen.findByRole("button", { name: "Supprimer le reliquat" }));
    expect(
      await screen.findByRole("heading", { name: "Supprimer le reliquat du plan ?" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Les barres déjà validées ne changent pas/)).toBeInTheDocument();
    expect(screen.getByText(/L'action reste inscrite dans l'historique/)).toBeInTheDocument();
  });

  it("renders traceability actions on piece detail", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PieceDetailView />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "CMD-001" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copier la référence" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualiser" })).toBeInTheDocument();
  });

  it("loads the assignment board", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AssignmentsView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Tableau des affectations")).toBeInTheDocument();
    expect((await screen.findAllByText("CMD-001")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("CNC-06").length).toBeGreaterThan(0);
  });

  it("exposes machine-scoped assignment filtering and traceability links", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AssignmentsView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("1 affectation(s) affichée(s) sur 1")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filtrer par machine" })).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: "CMD-001" })
        .every((link) => link.getAttribute("href") === "/offers"),
    ).toBe(true);
  });

  it("loads the operator production queue from the API", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OperatorView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("File de production")).toBeInTheDocument();
    expect(screen.getByText("Aucune production en cours")).toBeInTheDocument();
  });

  it("protects active production completion and preserves piece traceability", async () => {
    vi.mocked(getProductionCurrentRequest).mockResolvedValueOnce({
      current: {
        id: "operation-1",
        pieceId: "piece-1",
        pieceUnitId: "unit-1",
        reference: "CMD-001",
        sequenceNumber: 1,
        profile: "Profil 40",
        lengthMm: 6000,
        machineId: "machine-1",
        machineName: "CNC-06",
        operatorId: "1",
        operatorName: "Admin",
        status: "IN_PROGRESS",
        unitStatus: "IN_PROGRESS",
        pieceStatus: "IN_PROGRESS",
        startedAt: "2026-01-01T10:00:00.000Z",
        completedAt: null,
      },
      queue: [],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OperatorView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Op.ration en cours/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CMD-001" })).toHaveAttribute("href", "/offers");
    fireEvent.click(screen.getByRole("button", { name: /Envoyer CMD-001 au contr.le qualit./ }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annuler" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirmer l'envoi/ })).toBeInTheDocument();
  });

  it("loads the quality queue from the API", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <QualityView />
      </QueryClientProvider>,
    );
    expect((await screen.findAllByText("Unités en attente")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/CMD-001/)).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Contrôler/ }).length).toBeGreaterThan(0);
  });

  it("supports quality result filtering, piece traceability, and non-conform feedback", async () => {
    const user = userEvent.setup();
    vi.mocked(getQualityHistoryRequest).mockResolvedValue({
      controls: [
        {
          id: "control-1",
          pieceUnitId: "unit-quality-1",
          pieceId: "piece-1",
          reference: "CMD-001",
          sequenceNumber: 1,
          result: "CONFORM",
          comment: null,
          controllerId: "1",
          controllerName: "Admin",
          controlledAt: "2026-01-01T12:00:00.000Z",
          defectCategory: null,
          cycle: 1,
          images: [],
          disposition: null,
        },
      ],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <QualityView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("1 unite(s) affichee(s) sur 1")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Historique" }));
    expect(
      screen.getByRole("combobox", { name: /Filtrer les d.cisions qualit./ }),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: /CMD-001/ })
        .some((link) => link.getAttribute("href") === "/offers"),
    ).toBe(true);
    await user.click(screen.getByRole("tab", { name: /traiter/ }));
    await user.click(screen.getAllByRole("button", { name: /Contr.ler/ })[0]);
    await user.click(screen.getByRole("button", { name: /^Non conforme/ }));
    await user.click(screen.getByRole("button", { name: /Confirmer non conforme/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/commentaire.*obligatoire/i);
  });

  it("renders defect evidence and the administrator deviation decision workflow", async () => {
    vi.mocked(getQualityHistoryRequest).mockResolvedValue({
      controls: [
        {
          id: "control-rejected-1",
          pieceUnitId: "unit-quality-1",
          pieceId: "piece-1",
          reference: "CMD-001",
          sequenceNumber: 1,
          result: "NON_CONFORM",
          comment: "Rayure profonde sur la face visible.",
          controllerId: "quality-1",
          controllerName: "Contrôleur qualité",
          controlledAt: "2026-01-01T12:00:00.000Z",
          defectCategory: "SURFACE",
          cycle: 1,
          images: [
            {
              id: "image-1",
              originalName: "rayure.png",
              mimeType: "image/png",
              sizeBytes: 1200,
              url: "/quality/controls/control-rejected-1/images/image-1",
              createdAt: "2026-01-01T12:05:00.000Z",
            },
          ],
          disposition: {
            id: "disposition-1",
            pieceUnitId: "unit-quality-1",
            qualityControlId: "control-rejected-1",
            type: "DEVIATION",
            status: "PENDING",
            reason: "Tolérance client documentée.",
            approvalComment: null,
            requestedById: "manager-1",
            requestedByName: "Manager",
            approvedById: null,
            approvedByName: null,
            requestedAt: "2026-01-01T12:10:00.000Z",
            decidedAt: null,
            completedAt: null,
          },
        },
      ],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <QualityView />
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole("tab", { name: "Historique" }));
    expect(await screen.findByText("Photos du défaut")).toBeInTheDocument();
    expect(screen.getByAltText("rayure.png")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approuver" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refuser" })).toBeInTheDocument();
  });

  it("loads persisted traceability history from the API", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <HistoryView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Journal des événements")).toBeInTheDocument();
    expect((await screen.findAllByText("Contrôle conforme")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Admin")).length).toBeGreaterThan(0);
  });

  it("links history events back to persisted piece and machine context", async () => {
    vi.mocked(getHistoryRequest).mockResolvedValueOnce({
      events: [
        {
          id: "event-piece-1",
          eventType: "PRODUCTION_STARTED",
          entityType: "PIECE",
          entityId: "piece-1",
          actorUserId: "1",
          actorName: "Admin",
          actorRole: "ADMIN",
          metadata: { machineId: "machine-1", newPieceStatus: "IN_PROGRESS" },
          createdAt: "2026-01-01T10:00:00.000Z",
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <HistoryView />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("link", { name: "piece-1" })).toHaveAttribute("href", "/offers");
    expect(
      screen
        .getAllByRole("link", { name: "Machine" })
        .every((link) => link.getAttribute("href") === "/machines/machine-1"),
    ).toBe(true);
    expect(screen.getByText("1 evenement(s) affiche(s) sur cette page")).toBeInTheDocument();
  });

  it("loads persisted settings and activity notifications", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Préférences d’affichage et d’activité")).toBeInTheDocument();
    render(
      <QueryClientProvider client={queryClient}>
        <NotificationsView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Centre d’activité")).toBeInTheDocument();
    expect(await screen.findByText("Production démarrée")).toBeInTheDocument();
  });

  it("requires a settings change before saving and filters notifications", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsView />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("button", { name: "Enregistrer" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Compacte" }));
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeEnabled();

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationsView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("1 événement affiché")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Rechercher dans l’activité" }), {
      target: { value: "not-found" },
    });
    expect(await screen.findByText("Aucun résultat")).toBeInTheDocument();
  });

  it("keeps login submit usable and toggles password visibility both ways", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    expect(screen.getByRole("heading", { name: "Connexion" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Se connecter" }).closest("form")).toHaveAttribute(
      "method",
      "post",
    );
    const passwordToggle = screen.getByRole("button", { name: "Afficher le mot de passe" });
    expect(passwordToggle).toBeInTheDocument();
    expect(passwordToggle).toHaveClass("top-1/2", "-translate-y-1/2");
    expect(passwordToggle).not.toHaveClass("active:translate-y-px");
    await user.click(passwordToggle);
    expect(screen.getByLabelText("Mot de passe")).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Masquer le mot de passe" }));
    expect(screen.getByLabelText("Mot de passe")).toHaveAttribute("type", "password");

    await user.type(screen.getByLabelText("Identifiant"), "admin");
    await user.type(screen.getByLabelText("Mot de passe"), "valid-password");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));
    await waitFor(() =>
      expect(loginRequest).toHaveBeenCalledWith({
        username: "admin",
        password: "valid-password",
      }),
    );
    expect(await screen.findByRole("button", { name: "Se connecter" })).toBeEnabled();
  });

  it("announces offline state and connection recovery", async () => {
    const originalOnline = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    render(<OfflineStatus />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Hors connexion");
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    fireEvent(window, new Event("online"));
    expect(await screen.findByRole("status")).toHaveTextContent("Connexion rétablie");
    if (originalOnline) Object.defineProperty(window.navigator, "onLine", originalOnline);
    else Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  });
});

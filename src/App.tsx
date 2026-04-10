import { useEffect, useState, useCallback } from 'react';
import type { TrimSession, CreateTrimSessionDTO, TrimmerProfile, Harvest, License } from './types/definitions';
import { apiService } from './services/apiService';
import { AIHome } from './components/AIHome';
import { AIAssistant } from './components/AIAssistant';
import { ChatPanel } from './components/ChatPanel';
import { AmbientProvider, useAmbient } from './contexts/AmbientContext';
import { AmbientHeaderIndicator } from './components/AmbientHeaderIndicator';
import { AMBIENT_ENABLED } from './lib/featureFlags';
import { Dashboard } from './components/Dashboard';
import { ReportsDashboard } from './components/Reports/ReportsDashboard';
import { HarvestDashboard } from './components/Harvest/HarvestDashboard';
import { TasksPanel } from './components/TasksPanel';
import { Sidebar } from './components/Sidebar';
import { RightPanel } from './components/RightPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { Auth0Wrapper, useAuth } from './contexts/authContext';
import { LandingPage } from './components/LandingPage';
import { useConversationHistory } from './hooks/useConversationHistory';
import { useHumanTasks } from './hooks/useHumanTasks';
import { PlantMapDashboard } from './components/PlantMap/PlantMapDashboard';
import { PackageDashboard } from './components/Packages/PackageDashboard';
import { HarvestDayCockpit } from './components/HarvestDay/HarvestDayCockpit';
import { TagListView } from './components/TagList/TagListView';
import { ExtractionDashboard } from './components/Extraction/ExtractionDashboard';
import { SOPsDashboard } from './components/SOPs/SOPsDashboard';
import { OrderingDashboard } from './components/Ordering/OrderingDashboard';
import { SupplyDashboard } from './components/Supplies/SupplyDashboard';
import { usePlantMapSummary } from './hooks/usePlantMapSummary';
import logo from './assets/logo.png';

type ViewType = 'ai' | 'dashboard' | 'reports' | 'harvests' | 'harvest-day' | 'settings' | 'tasks' | 'plant-map' | 'packages' | 'extractions' | 'sops' | 'ordering' | 'supplies' | 'team' | 'tag-list';

const VIEW_SCREEN_CONTEXT: Record<ViewType, string> = {
  'ai': 'neurocann home — general conversation, no specific module focused',
  'dashboard': 'Trim Session Dashboard — managing active trim sessions, batches, and trimmer assignments',
  'reports': 'Reports & Analytics — viewing trimmer productivity and session reports',
  'harvests': 'Harvest Tracker — managing harvest records, wet weights, drying locations, and allocations',
  'settings': 'Settings — managing licenses, strains, and app configuration',
  'tasks': 'Tasks Panel — viewing and managing human tasks and operational to-dos',
  'plant-map': 'Plant Map — viewing rooms, plants by growth phase (veg, flower, dry, cure), and plant locations. Operations here involve moving plants between rooms, updating plant health, and managing room assignments',
  'harvest-day': 'Harvest Day Cockpit — active harvest session with plant weighing, allocation, fresh frozen packaging, and batch submission',
  'packages': 'Package Inventory — managing packaged product (flower, trim, shake) with weights, lab testing status, and compliance tracking',
  'extractions': 'Extraction Log — viewing processing history: ice water washes, rosin presses, cart fills with yield tracking',
  'sops': 'SOPs — creating and managing Standard Operating Procedures for cultivation, extraction, processing, and compliance workflows',
  'ordering': 'Ordering — managing vendors, product catalogs, stores, and purchase orders with per-store quantity matrix',
  'supplies': 'Supply Inventory — managing consumable supply levels, par tracking, and receiving for extraction, cultivation, and facility supplies',
  'team': 'Team Management — managing employees, roles, and invitations',
  'tag-list': 'Tag Browser — browsing and searching all plant and batch tags',
};

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const [session, setSession] = useState<TrimSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentView, setCurrentView] = useState<ViewType>(() => {
    const saved = sessionStorage.getItem('currentView');
    return saved && saved in VIEW_SCREEN_CONTEXT ? saved as ViewType : 'ai';
  });
  // Persist view across reloads
  const handleViewChange = (view: string) => {
    const v = view as ViewType;
    sessionStorage.setItem('currentView', v);
    setCurrentView(v);
  };
  const [trimmerProfiles, setTrimmerProfiles] = useState<TrimmerProfile[]>([]);
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [completedSessions, setCompletedSessions] = useState<TrimSession[]>([]);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

  const [selectedSessionId] = useState<string | null>(null);
  const [myLicenses, setMyLicenses] = useState<License[]>([]);
  const [voiceInjectedText, setVoiceInjectedText] = useState<string | null>(null);
  const [activeLicenseId, setActiveLicenseId] = useState<string | null>(null);

  const {
    conversations,
    saveConversation,
    loadConversation,
    deleteConversation,
  } = useConversationHistory();

  const {
    tasks: humanTasks,
    filters: taskFilters,
    setFilters: setTaskFilters,
    addHumanTask,
    addHumanTasks,
    updateTaskStatus,
    updateTask: updateHumanTask,
    deleteTask: deleteHumanTask,
    pendingCount: taskPendingCount,
    loadError: taskLoadError,
    retry: retryLoadTasks,
  } = useHumanTasks();

  const { summary: plantMapSummary, refetch: refetchPlantMap } = usePlantMapSummary();

  const handleCreateHumanTasks = useCallback(async (tasks: Array<{ title: string; description?: string; priority: string; category: string; dueDate?: string; assignee?: string; location?: string; onCompleteAction?: { type: string; data: Record<string, any> } }>) => {
    await addHumanTasks(tasks.map(t => ({
      title: t.title,
      description: t.description,
      priority: (t.priority || 'medium') as any,
      category: (t.category || 'other') as any,
      dueDate: t.dueDate,
      assignee: t.assignee,
      location: t.location,
      onCompleteAction: t.onCompleteAction as any,
    })));
  }, [addHumanTasks]);

  const loadSession = useCallback(async () => {
    const data = await apiService.getSession();
    setSession(data);
  }, []);

  const loadTrimmerProfiles = useCallback(async () => {
    const profiles = await apiService.getTrimmerProfiles();
    setTrimmerProfiles(profiles);
  }, []);

  const loadHarvests = useCallback(async () => {
    const data = await apiService.getHarvests();
    setHarvests(data);
  }, []);

  const loadCompletedSessions = useCallback(async () => {
    const data = await apiService.getCompletedSessions();
    setCompletedSessions(data);
  }, []);

  const loadLicenses = useCallback(async () => {
    const data = await apiService.getMyLicenses();
    setMyLicenses(data);
    // Auto-select first license if none selected
    setActiveLicenseId(prev => (prev ? prev : data.length > 0 ? data[0].id : null));
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadSession(), loadTrimmerProfiles(), loadHarvests(), loadCompletedSessions(), loadLicenses(), refetchPlantMap()]);
    setRefreshKey(k => k + 1);
  }, [loadSession, loadTrimmerProfiles, loadHarvests, loadCompletedSessions, loadLicenses, refetchPlantMap]);

  useEffect(() => {
    if (user) {
      Promise.all([loadSession(), loadTrimmerProfiles(), loadHarvests(), loadCompletedSessions(), loadLicenses()])
        .finally(() => setLoading(false));
    }
  }, [user, loadSession, loadTrimmerProfiles, loadHarvests, loadCompletedSessions, loadLicenses]);

  // Snapshot builder used by the AmbientProvider on every utterance flush.
  // This is what the AI sees when it parses an ambient chunk. We rebuild it
  // fresh each call so it reflects the latest session / harvest / task state.
  // Declared before any early returns so hook order is stable.
  const buildAmbientContext = useCallback(() => ({
    hasActiveSession: !!session,
    sessionId: session?.id,
    trimmerProfiles: trimmerProfiles.map(p => ({ id: p.id, name: p.name })),
    existingEntries: (session?.entries || []).map(e => ({
      id: e.id, harvestName: e.harvestName, strain: e.strain, status: e.status,
    })),
    harvests: (harvests || []).map(h => ({
      id: h.id, batchId: h.batchId, strain: h.strain, status: h.status,
    })),
    activeLicenseNumber: myLicenses.find(l => l.id === activeLicenseId)?.licenseNumber || undefined,
    humanTasks: (humanTasks || []).map(t => ({
      id: t.id, title: t.title, status: t.status, priority: t.priority,
      category: t.category, assignee: t.assignee, location: t.location,
    })),
    plantMapSummary: plantMapSummary || undefined,
    screenContext: VIEW_SCREEN_CONTEXT[currentView],
  }), [session, trimmerProfiles, harvests, myLicenses, activeLicenseId, humanTasks, plantMapSummary, currentView]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-5">
        <img src={logo} alt="" className="w-8 h-8 object-contain opacity-40 animate-pulse" />
        <p className="text-xs text-gray-300 tracking-wide">Loading</p>
      </div>
    );
  }

  if (!user) {
    return <LandingPage />;
  }

  const handleStartSession = async (data: CreateTrimSessionDTO) => {
    const newSession = await apiService.createSession(data);
    setSession(newSession);
  };

  const handleUpdateWeight = async (entryId: string, type: 'flower' | 'shake' | 'trim' | 'waste', val: number) => {
    const updatedSession = await apiService.updateEntryWeight(entryId, type, val);
    setSession(updatedSession);
  };

  const handleSubmitSession = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();

    if (confirm('Are you sure you want to submit this session? Any in-progress or upcoming batches will roll over to a new session.')) {
      try {
        const result = await apiService.submitSession();
        if (result.rolledOver > 0) {
          await loadSession();
          await loadTrimmerProfiles();
        } else {
          setSession(null);
        }
      } catch (error) {
        console.error('Error submitting session:', error);
        alert('Failed to submit session: ' + error);
      }
    }
  };

  const handleAddBatch = async (data: CreateTrimSessionDTO) => {
    const updatedSession = await apiService.addBatch(data);
    setSession(updatedSession);
  };

  const handleDeleteBatch = async (entryId: string) => {
    const updatedSession = await apiService.deleteBatch(entryId);
    setSession(updatedSession);
  };

  const handleUpdateStrain = async (entryId: string, strain: string) => {
    const updatedSession = await apiService.updateEntryStrain(entryId, strain);
    setSession({ ...updatedSession });
  };

  const handleAddTrimmer = async (entryId: string) => {
    const newTrimmer = {
      name: '',
      startTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
      flowerWeight: 0,
      shakeWeight: 0,
      trimWeight: 0,
      wasteWeight: 0
    };
    const updatedSession = await apiService.addTrimmer(entryId, newTrimmer);
    setSession({ ...updatedSession });
  };

  const handleUpdateTrimmer = async (entryId: string, trimmerId: string, updates: any) => {
    const updatedSession = await apiService.updateTrimmer(entryId, trimmerId, updates);
    setSession({ ...updatedSession });
  };

  const handleRemoveTrimmer = async (entryId: string, trimmerId: string) => {
    const updatedSession = await apiService.removeTrimmer(entryId, trimmerId);
    setSession({ ...updatedSession });
  };

  const handleSubmitBatch = async (entryId: string) => {
    const updatedSession = await apiService.submitBatch(entryId);
    setSession({ ...updatedSession });
  };

  const handleAddProfile = async (name: string) => {
    await apiService.addTrimmerProfile(name);
    const updatedProfiles = await apiService.getTrimmerProfiles();
    setTrimmerProfiles(updatedProfiles);
  };

  const handleDeleteProfile = async (id: string) => {
    const updatedProfiles = await apiService.deleteTrimmerProfile(id);
    setTrimmerProfiles(updatedProfiles);
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
    handleViewChange('ai');
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    handleViewChange('ai');
  };

  const handleConversationStarted = (id: string) => {
    setActiveConversationId(id);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-5">
        <img src={logo} alt="" className="w-8 h-8 object-contain opacity-40 animate-pulse" />
        <p className="text-xs text-gray-300 tracking-wide">Loading</p>
      </div>
    );
  }

  return (
    <AmbientProvider
      getContext={buildAmbientContext}
      onCreateHumanTasks={handleCreateHumanTasks}
      onSaveSession={saveConversation}
      onUpdateCapture={async (capture, updates) => {
        // Task captures: look up the human task by current title and patch it.
        // The capture's summary IS the task title (set by describeAction).
        if (capture.kind !== 'task') return false;
        if (!updates.title?.trim()) return false;
        const currentTitle = capture.summary;
        const match = humanTasks.find(t => t.title === currentTitle);
        if (!match) return false;
        try {
          await updateHumanTask(match.id, { title: updates.title.trim() });
          return true;
        } catch {
          return false;
        }
      }}
    >
    <div className="app-container">
      <Sidebar
        currentView={currentView}
        onViewChange={handleViewChange}
        onNewConversation={handleNewConversation}
        taskCount={taskPendingCount}
      />
      {AMBIENT_ENABLED && <AmbientHeaderIndicator onNavigateToAI={() => handleViewChange('ai')} />}
      <div className="main-content">
        <header className="app-header">
        </header>

        {currentView === 'ai' ? (
          <AIHome
            conversationId={activeConversationId}
            session={session}
            trimmerProfiles={trimmerProfiles}
            harvests={harvests}
            onSessionUpdate={refreshAll}
            onSaveConversation={saveConversation}
            onLoadConversation={loadConversation}
            onConversationStarted={handleConversationStarted}
            licenses={myLicenses}
            activeLicenseId={activeLicenseId}
            onLicenseChange={setActiveLicenseId}
            onViewChange={handleViewChange}
            onCreateHumanTasks={handleCreateHumanTasks}
            onUpdateHumanTask={updateHumanTask}
            onDeleteHumanTask={deleteHumanTask}
            humanTasks={humanTasks}
            plantMapSummary={plantMapSummary}
            injectedVoiceText={voiceInjectedText}
            onClearInjectedText={() => setVoiceInjectedText(null)}
            screenContext={VIEW_SCREEN_CONTEXT[currentView]}
            conversations={conversations}
            onSelectConversation={handleSelectConversation}
            onDeleteConversation={deleteConversation}
          />
        ) : currentView === 'tasks' ? (
          <TasksPanel
            tasks={humanTasks}
            filters={taskFilters}
            onSetFilters={setTaskFilters}
            onUpdateStatus={updateTaskStatus}
            onUpdateTask={updateHumanTask}
            onDeleteTask={deleteHumanTask}
            onCreateTask={addHumanTask}
            onNavigateToAI={() => handleViewChange('ai')}
            pendingCount={taskPendingCount}
            loadError={taskLoadError}
            onRetry={retryLoadTasks}
            teamMembers={trimmerProfiles.filter(p => p.status === 'active').map(p => ({ id: p.id, name: p.name, userId: p.userId }))}
          />
        ) : currentView === 'tag-list' ? (
          <TagListView onBack={() => handleViewChange('settings')} />
        ) : currentView === 'settings' ? (
          <SettingsPanel onViewChange={handleViewChange} />
        ) : currentView === 'harvest-day' ? (
          <HarvestDayCockpit onExit={() => handleViewChange('harvests')} />
        ) : currentView === 'harvests' ? (
          <HarvestDashboard onStartHarvestDay={() => handleViewChange('harvest-day')} />
        ) : currentView === 'plant-map' ? (
          <PlantMapDashboard refreshKey={refreshKey} />
        ) : currentView === 'packages' ? (
          <PackageDashboard />
        ) : currentView === 'extractions' ? (
          <ExtractionDashboard />
        ) : currentView === 'sops' ? (
          <SOPsDashboard />
        ) : currentView === 'ordering' ? (
          <OrderingDashboard />
        ) : currentView === 'supplies' ? (
          <SupplyDashboard />
        ) : currentView === 'reports' ? (
          <ReportsDashboard />
        ) : !session && !selectedSessionId ? (
          <AIAssistant
            onStart={handleStartSession}
            onNavigateToAI={handleNewConversation}
          />
        ) : (
          <Dashboard
            session={
              selectedSessionId
                ? completedSessions.find(s => s.id === selectedSessionId) || session!
                : session!
            }
            onUpdateWeight={handleUpdateWeight}
            onSubmit={handleSubmitSession}
            onAddBatch={handleAddBatch}
            onUpdateStrain={handleUpdateStrain}
            onAddTrimmer={handleAddTrimmer}
            onUpdateTrimmer={handleUpdateTrimmer}
            onRemoveTrimmer={handleRemoveTrimmer}
            onDeleteBatch={handleDeleteBatch}
            onSubmitBatch={handleSubmitBatch}
            onStartBatch={async (entryId) => {
              setSession(prev => prev ? {
                ...prev,
                entries: prev.entries.map(e => e.id === entryId ? { ...e, status: 'active' } : e),
              } : prev);
              let updatedSession = await apiService.startBatch(entryId);
              const newTrimmer = {
                name: '',
                startTime: '',
                endTime: '',
                flowerWeight: 0,
                shakeWeight: 0,
                trimWeight: 0,
                wasteWeight: 0
              };
              updatedSession = await apiService.addTrimmer(entryId, newTrimmer);
              setSession({ ...updatedSession });
            }}
            onRevertBatch={async (entryId) => {
              setSession(prev => prev ? {
                ...prev,
                entries: prev.entries.map(e => e.id === entryId ? { ...e, status: 'upcoming' } : e),
              } : prev);
              const updatedSession = await apiService.revertBatch(entryId);
              setSession({ ...updatedSession });
            }}
            onCreatePackage={async (data) => { await apiService.createPackage(data); }}
            trimmerProfiles={trimmerProfiles}
          />
        )}

        {/* Floating AI Chat — available on non-AI views except reports,
            and hidden while an ambient session is active (the header
            indicator + Action Center on AI home are the only ambient
            surfaces during a session). */}
        {currentView !== 'ai' && currentView !== 'reports' && (
          <ChatPanelGate
            session={session}
            trimmerProfiles={trimmerProfiles}
            harvests={harvests}
            onSessionUpdate={refreshAll}
            screenContext={VIEW_SCREEN_CONTEXT[currentView]}
            plantMapSummary={plantMapSummary}
            onCreateHumanTasks={handleCreateHumanTasks}
          />
        )}

        {/* Right panel — trimmer roster on dashboard */}
        {currentView === 'dashboard' && session && (
          <RightPanel
            trimmerProfiles={trimmerProfiles}
            onAddProfile={handleAddProfile}
            onDeleteProfile={handleDeleteProfile}
            isOpen={isRightPanelOpen}
            onToggle={() => setIsRightPanelOpen(prev => !prev)}
            session={session}
          />
        )}

        {/* Task panel edge controls — excluded from AI home (has its own) and reports */}
      </div>
    </div>
    </AmbientProvider>
  );
}

// Small wrapper that short-circuits ChatPanel while an ambient session is
// active. This lives inside the AmbientProvider so it can read useAmbient().
function ChatPanelGate(props: React.ComponentProps<typeof ChatPanel>) {
  const ambient = useAmbient();
  if (ambient.sessionActive) return null;
  return <ChatPanel {...props} />;
}

export default function App() {
  return (
    <Auth0Wrapper>
      <AppContent />
    </Auth0Wrapper>
  );
}

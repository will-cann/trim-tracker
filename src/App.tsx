import { useEffect, useState, useCallback } from 'react';
import type { TrimSession, CreateTrimSessionDTO, TrimmerProfile, Harvest, License } from './types/definitions';
import { apiService } from './services/apiService';
import { AIHome } from './components/AIHome';
import { AIAssistant } from './components/AIAssistant';
import { ChatPanel } from './components/ChatPanel';
import { Dashboard } from './components/Dashboard';
import { ReportsDashboard } from './components/Reports/ReportsDashboard';
import { HarvestDashboard } from './components/Harvest/HarvestDashboard';
import { TasksPanel } from './components/TasksPanel';
import { Sidebar } from './components/Sidebar';
import { RightPanel } from './components/RightPanel';
import { TaskRightPanel } from './components/TaskRightPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { Auth0Wrapper, useAuth } from './contexts/authContext';
import { Login } from './components/Login';
import { useConversationHistory } from './hooks/useConversationHistory';
import { useHumanTasks } from './hooks/useHumanTasks';
import { PlantMapDashboard } from './components/PlantMap/PlantMapDashboard';
import { usePlantMapSummary } from './hooks/usePlantMapSummary';

type ViewType = 'ai' | 'dashboard' | 'reports' | 'harvests' | 'settings' | 'tasks' | 'plant-map';

const VIEW_SCREEN_CONTEXT: Record<ViewType, string> = {
  'ai': 'AI Assistant home — general conversation, no specific module focused',
  'dashboard': 'Trim Session Dashboard — managing active trim sessions, batches, and trimmer assignments',
  'reports': 'Reports & Analytics — viewing trimmer productivity and session reports',
  'harvests': 'Harvest Tracker — managing harvest records, wet weights, drying locations, and allocations',
  'settings': 'Settings — managing licenses, strains, and app configuration',
  'tasks': 'Tasks Panel — viewing and managing human tasks and operational to-dos',
  'plant-map': 'Plant Map — viewing rooms, plants by growth phase (veg, flower, dry, cure), and plant locations. Operations here involve moving plants between rooms, updating plant health, and managing room assignments',
};

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const [session, setSession] = useState<TrimSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<ViewType>('ai');
  const [trimmerProfiles, setTrimmerProfiles] = useState<TrimmerProfile[]>([]);
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [, setIsPanelOpen] = useState(true);
  const [completedSessions, setCompletedSessions] = useState<TrimSession[]>([]);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [isTaskPanelOpen, setIsTaskPanelOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
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
    addHumanTasks,
    updateTaskStatus,
    updateTask: updateHumanTask,
    deleteTask: deleteHumanTask,
    pendingCount: taskPendingCount,
    loadError: taskLoadError,
    retry: retryLoadTasks,
  } = useHumanTasks();

  const plantMapSummary = usePlantMapSummary();

  const handleCreateHumanTasks = useCallback(async (tasks: Array<{ title: string; description?: string; priority: string; category: string; dueDate?: string; assignee?: string; location?: string }>) => {
    await addHumanTasks(tasks.map(t => ({
      title: t.title,
      description: t.description,
      priority: (t.priority || 'medium') as any,
      category: (t.category || 'other') as any,
      dueDate: t.dueDate,
      assignee: t.assignee,
      location: t.location,
    })));
  }, [addHumanTasks]);

  // Ambient voice: analyze transcript and auto-create tasks
  const handleAmbientAnalyze = useCallback(async (text: string) => {
    if (!text.trim()) return;
    try {
      const result = await apiService.aiParse({
        transcriptChunks: [text],
        context: {
          hasActiveSession: !!session,
          sessionId: session?.id,
          trimmerProfiles: trimmerProfiles.map(p => ({ id: p.id, name: p.name })),
          existingEntries: (session?.entries || []).map(e => ({
            id: e.id, harvestName: e.harvestName, strain: e.strain, status: e.status,
          })),
          harvests: harvests.map(h => ({
            id: h.id, batchId: h.batchId, strain: h.strain, status: h.status,
          })),
          humanTasks: humanTasks.map(t => ({
            id: t.id, title: t.title, status: t.status, priority: t.priority,
            category: t.category, assignee: t.assignee, location: t.location,
          })),
        },
      });
      const taskActions = result.actions.filter(a => a.type === 'create_human_task');
      if (taskActions.length > 0) {
        await handleCreateHumanTasks(taskActions.map(a => a.data as any));
      }
    } catch {
      // Silent fail for ambient mode
    }
  }, [session, trimmerProfiles, harvests, humanTasks, handleCreateHumanTasks]);

  // Action voice: inject text into AIHome input
  const handleActionVoiceText = useCallback((text: string) => {
    setVoiceInjectedText(text);
    if (currentView !== 'ai') setCurrentView('ai');
  }, [currentView]);

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
    await Promise.all([loadSession(), loadTrimmerProfiles(), loadHarvests(), loadCompletedSessions(), loadLicenses()]);
  }, [loadSession, loadTrimmerProfiles, loadHarvests, loadCompletedSessions, loadLicenses]);

  useEffect(() => {
    if (user) {
      Promise.all([loadSession(), loadTrimmerProfiles(), loadHarvests(), loadCompletedSessions(), loadLicenses()])
        .finally(() => setLoading(false));
    }
  }, [user, loadSession, loadTrimmerProfiles, loadHarvests, loadCompletedSessions, loadLicenses]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-emerald-500"></div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
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
    const updatedProfiles = await apiService.addTrimmerProfile(name);
    setTrimmerProfiles(updatedProfiles);
  };

  const handleDeleteProfile = async (id: string) => {
    const updatedProfiles = await apiService.deleteTrimmerProfile(id);
    setTrimmerProfiles(updatedProfiles);
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setCurrentView('ai');
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    setCurrentView('ai');
  };

  const handleConversationStarted = (id: string) => {
    setActiveConversationId(id);
  };

  if (loading) return <div className="loading flex items-center justify-center min-h-screen bg-gray-50 text-gray-500">Loading App Data...</div>;

  return (
    <div className="app-container">
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={deleteConversation}
        onPanelOpenChange={setIsPanelOpen}
        activeSession={session}
        completedSessions={completedSessions}
        selectedSessionId={selectedSessionId}
        onSelectSession={setSelectedSessionId}
        taskCount={taskPendingCount}
      />
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
            onStart={handleStartSession}
            licenses={myLicenses}
            activeLicenseId={activeLicenseId}
            onLicenseChange={setActiveLicenseId}
            onViewChange={setCurrentView}
            onCreateHumanTasks={handleCreateHumanTasks}
            onUpdateHumanTask={updateHumanTask}
            onDeleteHumanTask={deleteHumanTask}
            humanTasks={humanTasks}
            plantMapSummary={plantMapSummary}
            injectedVoiceText={voiceInjectedText}
            onClearInjectedText={() => setVoiceInjectedText(null)}
            screenContext={VIEW_SCREEN_CONTEXT[currentView]}
          />
        ) : currentView === 'tasks' ? (
          <TasksPanel
            tasks={humanTasks}
            filters={taskFilters}
            onSetFilters={setTaskFilters}
            onUpdateStatus={updateTaskStatus}
            onUpdateTask={updateHumanTask}
            onDeleteTask={deleteHumanTask}
            pendingCount={taskPendingCount}
            loadError={taskLoadError}
            onRetry={retryLoadTasks}
            teamMembers={trimmerProfiles.filter(p => p.status === 'active').map(p => ({ id: p.id, name: p.name, userId: p.userId }))}
          />
        ) : currentView === 'settings' ? (
          <SettingsPanel />
        ) : currentView === 'harvests' ? (
          <HarvestDashboard />
        ) : currentView === 'plant-map' ? (
          <PlantMapDashboard />
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
            trimmerProfiles={trimmerProfiles}
          />
        )}

        {/* Floating AI Chat — available on non-AI views except reports */}
        {currentView !== 'ai' && currentView !== 'reports' && (
          <ChatPanel
            session={session}
            trimmerProfiles={trimmerProfiles}
            harvests={harvests}
            onSessionUpdate={refreshAll}
            screenContext={VIEW_SCREEN_CONTEXT[currentView]}
            tasks={humanTasks}
            onUpdateTaskStatus={updateTaskStatus}
            onDeleteTask={deleteHumanTask}
            onCreateHumanTasks={handleCreateHumanTasks}
            taskPendingCount={taskPendingCount}
            onViewAllTasks={() => setCurrentView('tasks')}
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

        {/* Task panel edge controls — only on AI home and reports (where ChatPanel isn't shown) */}
        {(currentView === 'ai' || currentView === 'reports') && (
          <TaskRightPanel
            tasks={humanTasks}
            isOpen={isTaskPanelOpen}
            onToggle={() => setIsTaskPanelOpen(prev => !prev)}
            onUpdateStatus={updateTaskStatus}
            onDeleteTask={deleteHumanTask}
            pendingCount={taskPendingCount}
            onViewAll={() => setCurrentView('tasks')}
            onActionVoiceText={handleActionVoiceText}
            onAmbientAnalyze={handleAmbientAnalyze}
          />
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Auth0Wrapper>
      <AppContent />
    </Auth0Wrapper>
  );
}

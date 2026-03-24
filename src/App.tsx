import { useEffect, useState, useCallback } from 'react';
import type { TrimSession, CreateTrimSessionDTO, TrimmerProfile } from './types/definitions';
import { apiService } from './services/apiService';
import { AIAssistant } from './components/AIAssistant';
import { ChatPanel } from './components/ChatPanel';
import { Dashboard } from './components/Dashboard';
import { ReportsDashboard } from './components/Reports/ReportsDashboard';
import { Sidebar } from './components/Sidebar';
import { Auth0Wrapper, useAuth } from './contexts/authContext';
import { Login } from './components/Login';

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const [session, setSession] = useState<TrimSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<'dashboard' | 'reports'>('dashboard');
  const [trimmerProfiles, setTrimmerProfiles] = useState<TrimmerProfile[]>([]);

  const loadSession = useCallback(async () => {
    setLoading(true);
    const data = await apiService.getSession();
    setSession(data);
    setLoading(false);
  }, []);

  const loadTrimmerProfiles = useCallback(async () => {
    const profiles = await apiService.getTrimmerProfiles();
    setTrimmerProfiles(profiles);
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadSession(), loadTrimmerProfiles()]);
  }, [loadSession, loadTrimmerProfiles]);

  useEffect(() => {
    if (user) {
      loadSession();
      loadTrimmerProfiles();
    }
  }, [user, loadSession, loadTrimmerProfiles]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
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
          // Reload — a new session was created with the rolled-over batches
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

  if (loading) return <div className="loading flex items-center justify-center min-h-screen bg-slate-900 text-white">Loading App Data...</div>;

  return (
    <div className="app-container">
      <Sidebar
        profiles={trimmerProfiles}
        onAddProfile={handleAddProfile}
        onDeleteProfile={handleDeleteProfile}
        currentView={currentView}
        onViewChange={setCurrentView}
      />
      <div className="main-content">
        <header className="app-header">
        </header>

        {currentView === 'reports' ? (
          <ReportsDashboard />
        ) : (
          !session ? (
            <AIAssistant
              onStart={handleStartSession}
              trimmerProfiles={trimmerProfiles}
              onSessionUpdate={refreshAll}
            />
          ) : (
            <>
              <Dashboard
                session={session}
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
                  const updatedSession = await apiService.revertBatch(entryId);
                  setSession({ ...updatedSession });
                }}
                trimmerProfiles={trimmerProfiles}
              />
              <ChatPanel
                session={session}
                trimmerProfiles={trimmerProfiles}
                onSessionUpdate={refreshAll}
              />
            </>
          )
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

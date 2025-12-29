import { useEffect, useState } from 'react';
import type { TrimSession, CreateTrimSessionDTO, TrimmerProfile } from './types/definitions';
import { apiService } from './services/apiService';
import { StartSession } from './components/StartSession';
import { Dashboard } from './components/Dashboard';
import { ReportsDashboard } from './components/Reports/ReportsDashboard';
import { Sidebar } from './components/Sidebar';
import { AuthProvider, useAuth } from './contexts/authContext';
import { Login } from './components/Login';

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const [session, setSession] = useState<TrimSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<'dashboard' | 'reports'>('dashboard');
  const [trimmerProfiles, setTrimmerProfiles] = useState<TrimmerProfile[]>([]);

  useEffect(() => {
    if (user) {
      loadSession();
    }
  }, [user]);

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

  const loadSession = async () => {
    setLoading(true);
    const data = await apiService.getSession();
    setSession(data);
    setLoading(false);
  };

  useEffect(() => {
    loadTrimmerProfiles();
  }, []);

  const loadTrimmerProfiles = async () => {
    const profiles = await apiService.getTrimmerProfiles();
    setTrimmerProfiles(profiles);
  };

  const handleStartSession = async (data: CreateTrimSessionDTO) => {
    const newSession = await apiService.createSession(data);
    setSession(newSession);
  };

  const handleUpdateWeight = async (entryId: string, type: 'flower' | 'shake' | 'trim' | 'waste', val: number) => {
    // Persist
    const updatedSession = await apiService.updateEntryWeight(entryId, type, val);
    setSession(updatedSession);
  };

  const handleSubmitSession = async (e?: React.MouseEvent) => {
    console.log('handleSubmitSession CALLED', e);
    e?.preventDefault();
    e?.stopPropagation();

    if (confirm('Are you sure you want to submit this session?')) {
      console.log('Proceeding with session submission');
      try {
        await apiService.submitSession();
        console.log('Session submitted successfully, clearing state');
        setSession(null);
      } catch (error) {
        console.error('Error submitting session:', error);
        alert('Failed to submit session: ' + error);
      }
    } else {
      console.log('User cancelled submission');
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

  // Roster Handlers
  const handleAddProfile = async (name: string) => {
    const updatedProfiles = await apiService.addTrimmerProfile(name);
    setTrimmerProfiles(updatedProfiles);
  };

  const handleDeleteProfile = async (id: string) => {
    const updatedProfiles = await apiService.deleteTrimmerProfile(id);
    setTrimmerProfiles(updatedProfiles);
  };

  if (loading) return <div className="loading">Loading...</div>;

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
            <StartSession onStart={handleStartSession} />
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
                  // Start the batch (changes status to 'active')
                  let updatedSession = await apiService.startBatch(entryId);

                  // Automatically add first trimmer row
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
            </>
          )
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

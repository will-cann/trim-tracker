import { useEffect, useState } from 'react';
import type { TrimSession, CreateTrimSessionDTO, TrimmerProfile } from './types/definitions';
// import { hello } from './services/simple';
import { mockApi } from './services/mockApi';
import { seedInitialData } from './services/seedData';
import { StartSession } from './components/StartSession';
import { Dashboard } from './components/Dashboard';

import { Sidebar } from './components/Sidebar';

function App() {
  console.log('App rendering...');
  const [session, setSession] = useState<TrimSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    seedInitialData();
    loadSession();
  }, []);

  const loadSession = async () => {
    setLoading(true);
    const data = await mockApi.getSession();
    setSession(data);
    setLoading(false);
  };

  const [trimmerProfiles, setTrimmerProfiles] = useState<TrimmerProfile[]>(mockApi.getTrimmerProfiles());

  const handleStartSession = (data: CreateTrimSessionDTO) => {
    const newSession = mockApi.createSession(data);
    setSession(newSession);
  };

  const handleUpdateWeight = async (entryId: string, type: 'flower' | 'shake' | 'trim' | 'waste', val: number) => {
    // Optimistic update
    if (!session) return;

    const updatedEntries = session.entries.map(entry => {
      if (entry.id === entryId) {
        return { ...entry, [`${type}Weight`]: val };
      }
      return entry;
    });

    // Recalculate totals locally for immediate feedback
    const totalFlower = updatedEntries.reduce((sum, e) => sum + Number(e.flowerWeight), 0);
    const totalShake = updatedEntries.reduce((sum, e) => sum + Number(e.shakeWeight), 0);
    const totalTrim = updatedEntries.reduce((sum, e) => sum + Number(e.trimWeight), 0);
    const totalWaste = updatedEntries.reduce((sum, e) => sum + Number(e.wasteWeight), 0);

    setSession({
      ...session,
      entries: updatedEntries,
      totalFlower,
      totalShake,
      totalTrim,
      totalWaste
    });

    // Persist
    const updatedSession = await mockApi.updateEntryWeight(entryId, type, val);
    setSession(updatedSession);
  };

  const handleSubmitSession = async () => {
    if (confirm('Are you sure you want to submit this session?')) {
      await mockApi.submitSession();
      setSession(null);
    }
  };

  const handleAddBatch = (data: CreateTrimSessionDTO) => {
    const updatedSession = mockApi.addBatch(data);
    setSession(updatedSession);
  };

  const handleDeleteBatch = (entryId: string) => {
    const updatedSession = mockApi.deleteBatch(entryId);
    setSession(updatedSession);
  };

  const handleUpdateStrain = (entryId: string, strain: string) => {
    const updatedSession = mockApi.updateEntryStrain(entryId, strain);
    setSession({ ...updatedSession });
  };

  const handleAddTrimmer = (entryId: string) => {
    const newTrimmer = {
      name: '',
      startTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
      flowerWeight: 0,
      shakeWeight: 0,
      trimWeight: 0,
      wasteWeight: 0
    };
    const updatedSession = mockApi.addTrimmer(entryId, newTrimmer);
    setSession({ ...updatedSession });
  };

  const handleUpdateTrimmer = (entryId: string, trimmerId: string, updates: any) => {
    const updatedSession = mockApi.updateTrimmer(entryId, trimmerId, updates);
    setSession({ ...updatedSession });
  };

  const handleRemoveTrimmer = (entryId: string, trimmerId: string) => {
    const updatedSession = mockApi.removeTrimmer(entryId, trimmerId);
    setSession({ ...updatedSession });
  };

  const handleSubmitBatch = (entryId: string) => {
    const updatedSession = mockApi.submitBatch(entryId);
    setSession({ ...updatedSession });
  };

  // Roster Handlers
  const handleAddProfile = (name: string) => {
    const updatedProfiles = mockApi.addTrimmerProfile(name);
    setTrimmerProfiles(updatedProfiles);
  };

  const handleDeleteProfile = (id: string) => {
    const updatedProfiles = mockApi.deleteTrimmerProfile(id);
    setTrimmerProfiles(updatedProfiles);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="app-container">
      <Sidebar
        profiles={trimmerProfiles}
        onAddProfile={handleAddProfile}
        onDeleteProfile={handleDeleteProfile}
      />
      <div className="main-content">
        <header className="app-header">
        </header>

        {!session ? (
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
              trimmerProfiles={trimmerProfiles}
            />

          </>
        )}
      </div>
    </div>
  );
}

export default App;

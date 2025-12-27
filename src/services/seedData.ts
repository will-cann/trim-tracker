import { mockApi } from './mockApi';

export const seedInitialData = async () => {
    // Check if data already exists
    const existingSession = mockApi.getSession();
    const existingProfiles = await mockApi.getTrimmerProfiles();

    if (existingSession || existingProfiles.length > 0) {
        console.log('Data already exists, skipping seed.');
        return;
    }

    console.log('Seeding initial data...');

    // 1. Create Trimmer Profiles
    const trimmers = ['Alice', 'Bob', 'Charlie', 'Diana', 'Evan'];
    const profileIds: string[] = [];

    for (const name of trimmers) {
        const profiles = await mockApi.addTrimmerProfile(name);
        const newProfile = profiles.find(p => p.name === name);
        if (newProfile) profileIds.push(newProfile.id);
    }

    // 2. Create Initial Session (Batch 1 - Blue Dream)
    const sessionData = {
        harvestName: 'H-2023-001',
        strain: 'Blue Dream',
        licenseNumber: 'L-123-456',
        startWeight: 1000
    };

    let session = mockApi.createSession(sessionData);
    const batch1Id = session.entries[0].id;

    // Add trimmers to Batch 1
    mockApi.addTrimmer(batch1Id, {
        name: 'Alice',
        profileId: profileIds[0],
        startTime: '08:00',
        flowerWeight: 150,
        shakeWeight: 20,
        trimWeight: 10,
        wasteWeight: 5,
        tool: 'scissors'
    });

    mockApi.addTrimmer(batch1Id, {
        name: 'Bob',
        profileId: profileIds[1],
        startTime: '08:15',
        flowerWeight: 145,
        shakeWeight: 25,
        trimWeight: 12,
        wasteWeight: 8,
        tool: 'machine'
    });

    // Mark Batch 1 as submitted
    mockApi.submitBatch(batch1Id);


    // 3. Add Batch 2 (Sour Diesel)
    session = mockApi.addBatch({
        harvestName: 'H-2023-002',
        strain: 'Sour Diesel',
        licenseNumber: 'L-123-456',
        startWeight: 1200
    });
    const batch2Id = session.entries[session.entries.length - 1].id;

    // Add trimmers to Batch 2
    mockApi.addTrimmer(batch2Id, {
        name: 'Charlie',
        profileId: profileIds[2],
        startTime: '09:00',
        flowerWeight: 80,
        shakeWeight: 10,
        trimWeight: 5,
        wasteWeight: 2,
        tool: 'scissors'
    });

    mockApi.addTrimmer(batch2Id, {
        name: 'Diana',
        profileId: profileIds[3],
        startTime: '09:30',
        flowerWeight: 0,
        shakeWeight: 0,
        trimWeight: 0,
        wasteWeight: 0,
        tool: 'scissors'
    });


    // 4. Add Batch 3 (OG Kush)
    session = mockApi.addBatch({
        harvestName: 'H-2023-003',
        strain: 'OG Kush',
        licenseNumber: 'L-123-456',
        startWeight: 1500
    });

    console.log('Seeding complete.');
};

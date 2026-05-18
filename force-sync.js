const db = require('./db/database');
const hikvision = require('./services/hikvisionService');

async function testSync() {
    console.log("Starting forced synchronization of all members to Hikvision...");
    const members = db.getAllMembers('', 'all');
    console.log(`Found ${members.length} members in DB.`);

    for (const member of members) {
        console.log(`\n--- Syncing ${member.full_name} (${member.phone}) - Status: ${member.status} ---`);
        const result = await hikvision.syncMemberToDevice(member);
        console.log(`Result for ${member.full_name}:`, result);
    }
    console.log("\nSynchronization complete.");
}

testSync().catch(console.error);

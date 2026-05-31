const { TestClient } = require('../../helpers/framework');
const { readCsv } = require('../../helpers/csv-helper');
const path = require('path');

function runEventsSuite() {
  describe('Postman Collection: Events CRUD (Data-Driven)', () => {
    let adminToken;

    beforeAll(async () => {
      const api = new TestClient();
      adminToken = await api.login('admin', 'Admin@123');
      expect(adminToken).toBeDefined();
    });

    describe('Dynamic Events CRUD Lifecycle', () => {
      const csvPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'Initial', 'events_feed.csv');
      const syncRows = readCsv(csvPath);

      test.each(
        syncRows.map((row, index) => [
          `Event Case #${index + 1}: ${row.eventName} (${row.action})`,
          row
        ])
      )('%s', async (description, row) => {
        expect(adminToken).toBeDefined();
        const api = new TestClient();
        api.token = adminToken;

        console.log(`\n🧪 Process Event Action [${row.action}] for: ${row.eventName}`);

        let eventId;
        const allEvents = await api.getEvents();
        const existing = allEvents.find(
          e => e.eventName && e.eventName.trim().toLowerCase() === row.eventName.trim().toLowerCase()
        );

        if (row.action === 'CREATE') {
          if (existing) {
            console.log(`⚠️ Event "${row.eventName}" already exists.`);
            return;
          }
          const created = await api.createEvent({
            eventName: row.eventName,
            eventType: row.eventType,
            description: row.description,
            location: row.location,
            startDate: row.startDate,
            endDate: row.endDate,
            isActive: row.isActive === 'true'
          });
          expect(created).toBeDefined();
          expect(created.eventName).toBe(row.eventName);
          console.log(`✅ Created Event: ${created.eventName} with ID ${created.id}`);
        } 
        
        else if (row.action === 'UPDATE') {
          let targetEvent = existing;
          if (!targetEvent) {
            console.log(`🚀 Pre-creating event for UPDATE check...`);
            targetEvent = await api.createEvent({
              eventName: row.eventName,
              eventType: row.eventType,
              description: row.description,
              location: row.location,
              startDate: row.startDate,
              endDate: row.endDate,
              isActive: row.isActive === 'true'
            });
          }
          const updated = await api.updateEvent(targetEvent.id, {
            eventName: row.eventName + ' (Updated)',
            eventType: row.eventType,
            description: row.description + ' and reviewed',
            location: row.location,
            startDate: row.startDate,
            endDate: row.endDate,
            isActive: row.isActive === 'true'
          });
          expect(updated).toBeDefined();
          expect(updated.eventName).toContain('(Updated)');
          console.log(`✅ Updated Event ID ${targetEvent.id}`);
        } 
        
        else if (row.action === 'DELETE') {
          let targetEvent = existing;
          if (!targetEvent) {
            console.log(`🚀 Pre-creating event for DELETE check...`);
            targetEvent = await api.createEvent({
              eventName: row.eventName,
              eventType: row.eventType,
              description: row.description,
              location: row.location,
              startDate: row.startDate,
              endDate: row.endDate,
              isActive: row.isActive === 'true'
            });
          }
          await api.deleteEvent(targetEvent.id);
          console.log(`✅ Deleted Event ID ${targetEvent.id}`);
          
          // Verify soft delete
          const eventsPostDelete = await api.getEvents();
          const activeMatch = eventsPostDelete.find(e => e.id.toString() === targetEvent.id.toString());
          if (activeMatch) {
            expect(activeMatch.isActive).toBe(false);
            console.log(`✅ Soft-delete verified (isActive = false).`);
          } else {
            console.log(`✅ Event completely purged from active listings.`);
          }
        }
      });
    });
  });
}

module.exports = runEventsSuite;

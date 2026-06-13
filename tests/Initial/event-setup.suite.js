const { TestClient } = require('../../helpers/framework');
const { readCsv } = require('../../helpers/csv-helper');
const path = require('path');

/**
 * Exportable Jest suite to set up and verify all active Events from CSV.
 * Reads event details dynamically from the events_feed.csv.
 * Creates each event if it does not already exist.
 * Additionally sets the dynamic Event ID of the Jhusi event to
 * process.env.SELECTED_EVENT_ID for subsequent suites.
 */
function runEventSetupSuite(customCsvPath, selectEventName) {
    let createdEventId = null;
    describe('➡️ Jhusi Program Event Setup & Verification', () => {
        let adminToken;

        beforeAll(async () => {
            // Perform Single Admin Login
            const api = new TestClient();
            console.log('🧪 Executing pre-requisite: Admin Login for Event Setup...');
            adminToken = await api.login('admin', 'Admin@123');
            expect(adminToken).toBeDefined();
            console.log('✅ Admin login successful. Token acquired.');
        }, 30000);

        // Generate dynamic test cases for each event
        describe('Dynamic Event Creation & Verification', () => {
            // Note: Since Jest requires test definitions to be synchronous, we read the CSV here
            // to populate the test.each rows before beforeAll executes.
            const initialCsvPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'Initial', 'events_feed.csv');
            const csvPath = typeof customCsvPath === 'string' ? customCsvPath : initialCsvPath;
            const csvRows = Array.isArray(customCsvPath) ? customCsvPath : readCsv(csvPath).filter(row => row.action === 'CREATE').map(row => ({
                event_name: row.eventName || row.event_name,
                event_type: row.eventType || row.event_type || 'MELA',
                description: row.description || 'Default Program Event',
                location: row.location || 'Jhusi Prayagraj',
                start_date: row.startDate || row.start_date || '2026-01-10T00:00:00',
                end_date: row.endDate || row.end_date || '2026-02-25T23:59:59',
                is_active: row.isActive === 'true' || row.isActive === true || row.is_active === 'true' || row.is_active === true
            }));

            test.each(
                csvRows.map((evt, idx) => [
                    `Event #${idx + 1}: ${evt.event_name || evt.eventName}`,
                    evt
                ])
            )('%s', async (description, targetEvent) => {
                expect(adminToken).toBeDefined();
                const api = new TestClient();
                api.token = adminToken;

                const eventName = targetEvent.event_name || targetEvent.eventName;
                const eventType = targetEvent.event_type || targetEvent.eventType;
                const startDate = targetEvent.start_date || targetEvent.startDate;
                const endDate = targetEvent.end_date || targetEvent.endDate;
                const isActive = targetEvent.is_active || targetEvent.isActive === 'true' || targetEvent.isActive === true;

                console.log(`\n──────────────────────────────────────────────────`);
                console.log(`🧪 Starting Event Setup for: ${eventName}`);
                console.log(`──────────────────────────────────────────────────`);

                let eventId;
                let selectedEventId;
                let alreadyExists = false;

                // Step 1: Pre-creation Check (Check if event already exists by name)
                try {
                    console.log('🔍 Querying existing events...');
                    const events = await api.getEvents();
                    const match = events.find(
                        e => e.eventName && e.eventName.trim().toLowerCase() === eventName.trim().toLowerCase()
                    );
                    if (match) {
                        alreadyExists = true;
                        eventId = match.id;
                        existingEventName = match.eventName;
                        if (existingEventName.toLocaleLowerCase() == selectEventName.toLocaleLowerCase()) {
                            selectedEventId = eventId;
                            process.env.SELECTED_EVENT_ID = eventId.toString();
                            console.log(`🎉 Event "${existingEventName}" ID detected and set to SELECTED_EVENT_ID: ${process.env.SELECTED_EVENT_ID}`);
                        }
                        console.log(`⚠️ Event "${eventName}" already exists with ID ${eventId}.`);
                    }
                } catch (err) {
                    console.warn('⚠️ Warning: Failed to query existing events. Proceeding with creation...', err.message);
                }

                // Step 2: Create Event if not already existing
                if (!alreadyExists) {
                    console.log(`🚀 Creating new event: "${eventName}"...`);
                    const createdEvent = await api.createEvent({
                        eventName: eventName,
                        eventType: eventType,
                        description: targetEvent.description,
                        location: targetEvent.location,
                        startDate: startDate ? startDate.replace(' ', 'T') : undefined,
                        endDate: endDate ? endDate.replace(' ', 'T') : undefined,
                        isActive: isActive
                    });

                    expect(createdEvent).toBeDefined();
                    expect(createdEvent.eventName).toBe(eventName);
                    expect(createdEvent.eventType).toBe(eventType);

                    eventId = createdEvent.id;
                    if (selectEventName.toLocaleLowerCase() == createdEvent.eventName.toLocaleLowerCase()) {
                        selectedEventId = eventId;
                        process.env.SELECTED_EVENT_ID = eventId.toString();
                        console.log(`🎉 Event "${selectEventName}" ID detected and set to SELECTED_EVENT_ID: ${process.env.SELECTED_EVENT_ID}`);
                    }
                    expect(eventId).toBeDefined();
                    console.log(`✅ Event "${eventName}" created successfully with ID ${eventId}.`);
                }

                // Step 3: Fetch event by ID to verify details
                console.log(`🔍 Fetching event by ID ${eventId} to verify details...`);
                const eventData = await api.getEventById(eventId);
                createdEventId = eventData.id;
                expect(eventData).toBeDefined();
                expect(eventData.id.toString()).toBe(eventId.toString());
                expect(eventData.eventName).toBe(eventName);

                // Step 4: If this is the Jhusi event, set process.env.SELECTED_EVENT_ID
                process.env.SELECTED_EVENT_ID = selectedEventId
                console.log(`🎉  Event ID detected and set to SELECTED_EVENT_ID: ${process.env.SELECTED_EVENT_ID}`);
            });
        });
    });
    return createdEventId;
}

module.exports = runEventSetupSuite;

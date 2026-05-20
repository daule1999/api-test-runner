const { TestClient } = require('../../../helpers/framework');

/**
 * Exportable Jest suite to set up and verify the active Event.
 * If the event does not exist, it creates it and sets the dynamic Event ID
 * to process.env.JHUSI_EVENT_ID for subsequent suites.
 */
function runEventSetupSuite(eventInput) {
    describe('➡️ Jhusi Program Event Setup & Verification', () => {
        let adminToken;
        const defaultEvent = {
            event_name: 'Jhusi Program 2026',
            event_type: 'MELA',
            description: 'Default Jhusi Program Event',
            location: 'Jhusi, Prayagraj',
            start_date: '2026-01-01 00:00:00',
            end_date: '2026-12-31 23:59:59',
            is_active: true
        };

        const event = eventInput || defaultEvent;

        beforeAll(async () => {
            // 1. Perform Single Admin Login
            const api = new TestClient();
            console.log('🧪 Executing pre-requisite: Admin Login for Event Setup...');
            adminToken = await api.login('admin', 'Admin@123');
            expect(adminToken).toBeDefined();
            console.log('✅ Admin login successful. Token acquired.');
        }, 30000);

        test('Should verify or dynamically create the event', async () => {
            expect(adminToken).toBeDefined();
            const api = new TestClient();
            api.token = adminToken;

            console.log(`\n──────────────────────────────────────────────────`);
            console.log(`🧪 Starting Event Setup for: ${event.event_name}`);
            console.log(`──────────────────────────────────────────────────`);

            let eventId;
            let alreadyExists = false;

            // Step 1: Pre-creation Check (Check if event already exists by name)
            try {
                console.log('🔍 Querying existing events...');
                const events = await api.getEvents();
                const match = events.find(
                    e => e.eventName && e.eventName.trim().toLowerCase() === event.event_name.trim().toLowerCase()
                );
                if (match) {
                    alreadyExists = true;
                    eventId = match.id;
                    console.log(`⚠️ Event "${event.event_name}" already exists with ID ${eventId}.`);
                }
            } catch (err) {
                console.warn('⚠️ Warning: Failed to query existing events. Proceeding with creation...', err.message);
            }

            // Step 2: Create Event if not already existing
            if (!alreadyExists) {
                console.log(`🚀 Creating new event: "${event.event_name}"...`);
                const createdEvent = await api.createEvent({
                    eventName: event.event_name,
                    eventType: event.event_type,
                    description: event.description,
                    location: event.location,
                    startDate: event.start_date ? event.start_date.replace(' ', 'T') : undefined,
                    endDate: event.end_date ? event.end_date.replace(' ', 'T') : undefined,
                    isActive: event.is_active
                });

                expect(createdEvent).toBeDefined();
                expect(createdEvent.eventName).toBe(event.event_name);
                expect(createdEvent.eventType).toBe(event.event_type);

                eventId = createdEvent.id;
                expect(eventId).toBeDefined();
                console.log(`✅ Event "${event.event_name}" created successfully with ID ${eventId}.`);
            }

            // Step 3: Fetch event by ID to verify details
            console.log(`🔍 Fetching event by ID ${eventId} to verify details...`);
            const eventData = await api.getEventById(eventId);

            expect(eventData).toBeDefined();
            expect(eventData.id.toString()).toBe(eventId.toString());
            expect(eventData.eventName).toBe(event.event_name);

            // Step 4: Set the dynamic Event ID to environment variable for subsequent test suites
            process.env.JHUSI_EVENT_ID = eventId.toString();
            console.log(`🎉 Event verification complete. JHUSI_EVENT_ID set to: ${process.env.JHUSI_EVENT_ID}`);
        });
    });
}

module.exports = runEventSetupSuite;

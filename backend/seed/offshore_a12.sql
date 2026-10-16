-- Ripple offshore demo seed.
-- Relative days are D+0 through D+14; this file contains synthetic data only.
BEGIN;

INSERT INTO schedule_state (id, scenario_id, version, updated_at)
VALUES (1, 'A-12-base', 1, TIMESTAMPTZ '2026-10-13 00:00:00+00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO resources (id, scenario_id, type, name, capacity, unit, active, metadata)
VALUES
    ('BRG-1', 'A-12-base', 'barge', 'BRG-1', 1, 'job', true, '{"location":"offshore"}'),
    ('SB-1', 'A-12-base', 'supply_boat', 'SB-1', 100, 'deck_units', true, '{"location":"offshore"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO jobs (
    id, scenario_id, site, job_type, start_day, duration_days,
    shortfall_bopd, locked, lock_reason, status, row_version
)
VALUES
    ('C-03', 'A-12-base', 'offshore', 'esp_replacement', 3, 2, 40, false, NULL, 'planned', 1),
    ('B-05', 'A-12-base', 'offshore', 'esp_replacement', 7, 2, 120, true, 'client inspection', 'planned', 1),
    ('A-12', 'A-12-base', 'offshore', 'esp_replacement', 9, 2, 250, false, NULL, 'planned', 1),
    ('D-07', 'A-12-base', 'offshore', 'esp_replacement', 11, 2, 180, false, NULL, 'planned', 1),
    ('E-02', 'A-12-base', 'offshore', 'esp_replacement', 13, 2, 90, false, NULL, 'planned', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO bookings (
    id, scenario_id, job_id, activity_id, resource_id,
    start_day, end_day, load, status, row_version
)
VALUES
    ('booking-C-03', 'A-12-base', 'C-03', NULL, 'BRG-1', 3, 4, 1, 'planned', 1),
    ('booking-B-05', 'A-12-base', 'B-05', NULL, 'BRG-1', 7, 8, 1, 'planned', 1),
    ('booking-A-12', 'A-12-base', 'A-12', NULL, 'BRG-1', 9, 10, 1, 'planned', 1),
    ('booking-D-07', 'A-12-base', 'D-07', NULL, 'BRG-1', 11, 12, 1, 'planned', 1),
    ('booking-E-02', 'A-12-base', 'E-02', NULL, 'BRG-1', 13, 14, 1, 'planned', 1),
    ('cargo-D+5-other', 'A-12-base', NULL, 'cargo-D+5-other', 'SB-1', 5, 5, 70, 'planned', 1),
    ('cargo-D-07-drums', 'A-12-base', NULL, 'D-07-drums', 'SB-1', 5, 5, 15, 'planned', 1),
    ('cargo-D+6-existing', 'A-12-base', NULL, 'cargo-D+6-existing', 'SB-1', 6, 6, 60, 'planned', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO cargo_items (
    id, scenario_id, job_id, description, deck_units, needed_by_day,
    sailing_booking_id, row_version
)
VALUES
    ('D-07-drums', 'A-12-base', 'D-07', 'Chemical drums for D-07', 15, 11, 'cargo-D-07-drums', 1),
    ('A-12-pump-package', 'A-12-base', 'A-12', 'A-12 replacement pump package', 20, 5, NULL, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO readiness_items (
    id, scenario_id, job_id, stage, step_order, lead_time_days,
    planned_day, eta_earliest_day, eta_latest_day, confidence,
    status, source_type, source_reference, last_updated_at,
    not_before_day, risk_buffer_days, row_version
)
VALUES
    ('A-12-function-test', 'A-12-base', 'A-12', 'function_test', 1, 1, 4, 4, 4, 0.90,
        'pending', 'vendor_email', 'vendor email 9 Oct', TIMESTAMPTZ '2026-10-13 00:00:00+00', 1, 0, 1),
    ('A-12-paperwork', 'A-12-base', 'A-12', 'paperwork', 2, 1, 5, 5, 5, 0.90,
        'pending', 'vendor_email', 'vendor email 9 Oct', TIMESTAMPTZ '2026-10-13 00:00:00+00', NULL, 0, 1),
    ('A-12-shorebase', 'A-12-base', 'A-12', 'shorebase_staging', 3, 1, 6, 6, 6, 0.90,
        'pending', 'vendor_email', 'vendor email 9 Oct', TIMESTAMPTZ '2026-10-13 00:00:00+00', NULL, 0, 1),
    ('A-12-load-sail', 'A-12-base', 'A-12', 'load_and_sail', 4, 1, 7, 7, 7, 0.90,
        'pending', 'vendor_email', 'vendor email 9 Oct', TIMESTAMPTZ '2026-10-13 00:00:00+00', NULL, 0, 1),
    ('D-07-function-test', 'A-12-base', 'D-07', 'function_test', 1, 1, 6, 6, 6, 0.60,
        'pending', 'vendor_email', 'vendor email 9 Oct', TIMESTAMPTZ '2026-10-10 00:00:00+00', NULL, 0, 1),
    ('D-07-paperwork', 'A-12-base', 'D-07', 'paperwork', 2, 1, 7, 7, 7, 0.80,
        'pending', 'vendor_email', 'vendor email 9 Oct', TIMESTAMPTZ '2026-10-10 00:00:00+00', NULL, 0, 1),
    ('D-07-shorebase', 'A-12-base', 'D-07', 'shorebase_staging', 3, 1, 8, 8, 8, 0.80,
        'pending', 'vendor_email', 'vendor email 9 Oct', TIMESTAMPTZ '2026-10-10 00:00:00+00', NULL, 0, 1),
    ('D-07-load-sail', 'A-12-base', 'D-07', 'load_and_sail', 4, 1, 9, 9, 9, 0.80,
        'pending', 'vendor_email', 'vendor email 9 Oct', TIMESTAMPTZ '2026-10-10 00:00:00+00', NULL, 0, 1),
    ('E-02-function-test', 'A-12-base', 'E-02', 'function_test', 1, 1, 9, 9, 9, 0.90,
        'pending', 'warehouse_message', 'warehouse message 10 Oct', TIMESTAMPTZ '2026-10-13 00:00:00+00', NULL, 0, 1),
    ('E-02-paperwork', 'A-12-base', 'E-02', 'paperwork', 2, 1, 10, 10, 10, 0.90,
        'pending', 'warehouse_message', 'warehouse message 10 Oct', TIMESTAMPTZ '2026-10-13 00:00:00+00', NULL, 0, 1),
    ('E-02-shorebase', 'A-12-base', 'E-02', 'shorebase_staging', 3, 1, 11, 11, 11, 0.90,
        'pending', 'warehouse_message', 'warehouse message 10 Oct', TIMESTAMPTZ '2026-10-13 00:00:00+00', NULL, 0, 1),
    ('E-02-load-sail', 'A-12-base', 'E-02', 'load_and_sail', 4, 1, 12, 12, 12, 0.90,
        'pending', 'warehouse_message', 'warehouse message 10 Oct', TIMESTAMPTZ '2026-10-13 00:00:00+00', NULL, 0, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO weather_forecast (
    scenario_id, location, day, wave_height, go_flag, source, last_updated_at
)
VALUES
    ('A-12-base', 'offshore', 0, 1.0, true, 'seed forecast', TIMESTAMPTZ '2026-10-13 00:00:00+00'),
    ('A-12-base', 'offshore', 1, 1.0, true, 'seed forecast', TIMESTAMPTZ '2026-10-13 00:00:00+00'),
    ('A-12-base', 'offshore', 2, 1.1, true, 'seed forecast', TIMESTAMPTZ '2026-10-13 00:00:00+00'),
    ('A-12-base', 'offshore', 3, 1.1, true, 'seed forecast', TIMESTAMPTZ '2026-10-13 00:00:00+00'),
    ('A-12-base', 'offshore', 4, 1.2, true, 'seed forecast', TIMESTAMPTZ '2026-10-13 00:00:00+00'),
    ('A-12-base', 'offshore', 5, 1.2, true, 'seed forecast', TIMESTAMPTZ '2026-10-13 00:00:00+00'),
    ('A-12-base', 'offshore', 6, 1.3, true, 'seed forecast', TIMESTAMPTZ '2026-10-13 00:00:00+00'),
    ('A-12-base', 'offshore', 7, 1.3, true, 'seed forecast', TIMESTAMPTZ '2026-10-13 00:00:00+00'),
    ('A-12-base', 'offshore', 8, 1.4, true, 'seed forecast', TIMESTAMPTZ '2026-10-13 00:00:00+00'),
    ('A-12-base', 'offshore', 9, 1.4, true, 'seed forecast', TIMESTAMPTZ '2026-10-13 00:00:00+00'),
    ('A-12-base', 'offshore', 10, 1.5, true, 'seed forecast', TIMESTAMPTZ '2026-10-13 00:00:00+00'),
    ('A-12-base', 'offshore', 11, 1.5, true, 'seed forecast', TIMESTAMPTZ '2026-10-13 00:00:00+00'),
    ('A-12-base', 'offshore', 12, 1.4, true, 'seed forecast', TIMESTAMPTZ '2026-10-13 00:00:00+00'),
    ('A-12-base', 'offshore', 13, 1.3, true, 'seed forecast', TIMESTAMPTZ '2026-10-13 00:00:00+00'),
    ('A-12-base', 'offshore', 14, 1.2, true, 'seed forecast', TIMESTAMPTZ '2026-10-13 00:00:00+00')
ON CONFLICT (scenario_id, location, day) DO NOTHING;

INSERT INTO events (
    id, scenario_id, nature, cause, raw_text, file_object_ref, state,
    parent_event_id, parent_plan_id, origin_type, extraction_version,
    created_by, created_at, updated_at
)
VALUES
    ('11111111-1111-4111-8111-111111111111', 'A-12-base', 'request', NULL,
        $event$A-12 output dropped again, can we move it to this week, D+3 if possible? Don't touch B-05, the client is inspecting it.$event$,
        NULL, 'received', NULL, NULL, 'demo', 0, 'demo-planner', TIMESTAMPTZ '2026-10-13 00:00:00+00', TIMESTAMPTZ '2026-10-13 00:00:00+00'),
    ('22222222-2222-4222-8222-222222222222', 'A-12-base', 'request', NULL,
        $event$A-12 output dropped again, can we move it to this week, D+3 if possible? Don't touch B-05, the client is inspecting it. FYI the vendor says the test bay is full until Thursday.$event$,
        NULL, 'received', NULL, NULL, 'demo', 0, 'demo-planner', TIMESTAMPTZ '2026-10-13 00:01:00+00', TIMESTAMPTZ '2026-10-13 00:01:00+00'),
    ('33333333-3333-4333-8333-333333333333', 'A-12-base', 'disruption', 'seal finding during test',
        $event$Vendor email: D-07 pump test slips three days and the vendor reports a seal finding.$event$,
        NULL, 'received', NULL, NULL, 'demo', 0, 'demo-planner', TIMESTAMPTZ '2026-10-13 00:02:00+00', TIMESTAMPTZ '2026-10-13 00:02:00+00')
ON CONFLICT (id) DO NOTHING;

COMMIT;

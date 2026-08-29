-- Return shop-floor production to normal Supabase-authenticated manufacturer
-- sessions. Existing production and audit events remain append-only; only the
-- unused device/PIN credential layer is removed.

drop trigger if exists profiles_revoke_operator_devices on public.profiles;
drop function if exists private.revoke_removed_operator_devices();

drop trigger if exists zz_production_events_station_audit_actor on public.production_events;
drop trigger if exists production_events_station_provenance on public.production_events;

drop function if exists public.record_station_production_event(uuid, uuid, uuid, uuid, uuid, text, integer, uuid, uuid);
drop function if exists public.station_production_step_snapshot(uuid, uuid, uuid, uuid, uuid);
drop function if exists public.reverse_station_production_event(uuid, uuid, uuid, uuid);

drop function if exists private.record_station_production_event(uuid, uuid, uuid, uuid, uuid, text, integer, uuid, uuid);
drop function if exists private.station_production_step_snapshot(uuid, uuid, uuid, uuid, uuid);
drop function if exists private.reverse_station_production_event(uuid, uuid, uuid, uuid);
drop function if exists private.assert_station_access(uuid, uuid, uuid);
drop function if exists private.correct_station_production_audit_actor();
drop function if exists private.enforce_station_production_provenance();

drop function if exists public.manage_production_device(uuid, uuid, text, uuid);
drop function if exists public.reset_production_operator_code(uuid, uuid);
drop function if exists public.set_production_operator_code(uuid, uuid, text, text);

alter table public.production_events
  drop column if exists production_device_id;

drop table if exists public.production_device_sessions;
drop table if exists public.production_operator_codes;
drop table if exists public.production_devices;

alter table public.profiles
  drop constraint if exists profiles_id_organization_unique;

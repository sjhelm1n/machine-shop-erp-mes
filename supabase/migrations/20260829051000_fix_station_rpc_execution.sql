-- These RPCs are executable only by service_role. SECURITY DEFINER lets their
-- public wrappers enter the private schema without granting schema usage to
-- any API role; the private functions still validate tenant/operator/device.
alter function public.record_station_production_event(uuid, uuid, uuid, uuid, uuid, text, integer, uuid, uuid)
  security definer;
alter function public.station_production_step_snapshot(uuid, uuid, uuid, uuid, uuid)
  security definer;
alter function public.reverse_station_production_event(uuid, uuid, uuid, uuid)
  security definer;

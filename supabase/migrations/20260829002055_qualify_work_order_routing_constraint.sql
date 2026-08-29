-- The Work Order editor function deliberately uses an empty search_path. Schema
-- qualify its deferred constraint so PostgreSQL can resolve it in that context.
do $migration$
declare
  v_definition text;
  v_unqualified constant text := 'set constraints routing_steps_work_order_id_sequence_number_key deferred;';
  v_qualified constant text := 'set constraints public.routing_steps_work_order_id_sequence_number_key deferred;';
begin
  select pg_get_functiondef('private.update_work_order(uuid,date,text,jsonb)'::regprocedure)
    into v_definition;

  if strpos(v_definition, v_unqualified) = 0 then
    raise exception 'Expected unqualified routing constraint statement was not found';
  end if;

  execute replace(v_definition, v_unqualified, v_qualified);
end;
$migration$;

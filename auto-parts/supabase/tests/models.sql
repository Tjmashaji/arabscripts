-- موديلات العلامات الخمس: موجودة لكل علامة، بلا سنوات مخترعة، وظاهرة للزائر.
do $$
declare n int; out text[] := '{}';
begin
  select count(distinct brand_id) into n from public.ap_vehicle_models where enabled;
  out := array_append(out, (case when n = 5 then 'PASS' else 'FAIL' end) || ' V1 لكل علامة من الخمس موديلات');
  select count(*) into n from public.ap_vehicle_models where year_from is not null or year_to is not null;
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' V2 لا سنوات إنتاج مضافة دون تأكيد');
  select count(*) into n from public.ap_vehicle_models where name_ar is null or name_ar = '';
  out := array_append(out, (case when n = 0 then 'PASS' else 'FAIL' end) || ' V3 لكل موديل اسم عربي');
  set local role anon; perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.ap_vehicle_models;
  out := array_append(out, (case when n >= 30 then 'PASS' else 'FAIL' end) || ' V4 الزائر يرى الموديلات في البحث (' || n || ')');
  reset role;
  raise exception 'RESULT%', E'\n' || array_to_string(out, E'\n');
end $$;

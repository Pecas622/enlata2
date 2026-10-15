-- Cron de Supabase que publica lo programado: cada 5 minutos llama a la app, que publica lo que ya toca.
-- Antes: activá pg_cron y pg_net (Database > Extensions) y cargá CRON_SECRET y SUPABASE_SERVICE_ROLE_KEY en Vercel.
-- Cambiá las dos líneas marcadas y corré todo en SQL Editor. Se puede correr de nuevo: reemplaza el anterior.

select cron.unschedule('marketing-ops-publicar') where exists (select 1 from cron.job where jobname = 'marketing-ops-publicar');

select cron.schedule('marketing-ops-publicar', '*/5 * * * *', $$
  select net.http_get(
    url := 'https://TU-APP.vercel.app/api/cron/publicar',                              -- <- la dirección de tu app
    headers := jsonb_build_object('Authorization', 'Bearer ' || 'PEGÁ-ACÁ-TU-CRON_SECRET'), -- <- el mismo CRON_SECRET de Vercel
    timeout_milliseconds := 60000
  );
$$);

-- Para ver que anda (status 'succeeded' y, en net._http_response, código 200):
-- select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
-- select status_code, content from net._http_response order by created desc limit 5;
-- Para apagarlo: select cron.unschedule('marketing-ops-publicar');

-- Correctif : donne explicitement accès aux tables (nouveaux projets Supabase)
grant usage on schema public to anon, authenticated;
grant select on public.unites, public.creneaux to anon, authenticated;
grant select, insert, update, delete on public.unites, public.creneaux, public.reservations, public.notes to authenticated;
grant select on public.admins to authenticated;
grant execute on function public.reserver(uuid,text,text,text,text) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
notify pgrst, 'reload schema';

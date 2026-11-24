-- =====================================================================
--  Rencontres de mi-année | 274e Saint-Éphrem — Année scoute 2026-2027
--  Schéma Supabase : à coller UNE FOIS dans Supabase > SQL Editor > Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------------------------------------------------

create table if not exists public.unites (
  id    text primary key,
  nom   text not null,
  ordre int  not null default 0
);

-- Créneaux : lisibles publiquement. "unite_id" est rempli automatiquement
-- (trigger) et ne contient que l'unité ayant réservé — aucune donnée perso.
create table if not exists public.creneaux (
  id         uuid primary key default gen_random_uuid(),
  debut      timestamptz not null,
  fin        timestamptz not null,
  unite_id   text unique references public.unites(id),
  created_at timestamptz not null default now(),
  constraint creneau_valide check (fin > debut)
);

-- Réservations : PRIVÉES (admin seulement). Les contraintes UNIQUE
-- garantissent qu'il est impossible de doubler un créneau ou une unité,
-- même si deux personnes cliquent exactement au même moment.
create table if not exists public.reservations (
  id          uuid primary key default gen_random_uuid(),
  creneau_id  uuid not null unique references public.creneaux(id) on delete restrict,
  unite_id    text not null unique references public.unites(id),
  responsable text not null,
  chefs       text not null default '',
  commentaire text not null default '',
  statut      text not null default 'a_venir' check (statut in ('a_venir','terminee')),
  source      text not null default 'public' check (source in ('public','admin')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Notes confidentielles : admin seulement, jamais exposées au public.
create table if not exists public.notes (
  reservation_id uuid primary key references public.reservations(id) on delete cascade,
  contenu        text not null default '',
  updated_at     timestamptz not null default now()
);

-- Liste des comptes du chef de groupe autorisés à l'espace admin.
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email   text
);

-- ---------- Fonctions utilitaires ------------------------------------

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid()); $$;

-- Synchronise creneaux.unite_id avec les réservations.
create or replace function public.sync_creneau_unite()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    update public.creneaux set unite_id = null where id = old.creneau_id;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    update public.creneaux set unite_id = new.unite_id where id = new.creneau_id;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists trg_sync_creneau on public.reservations;
create trigger trg_sync_creneau
  after insert or update of creneau_id, unite_id or delete on public.reservations
  for each row execute function public.sync_creneau_unite();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_touch_resa on public.reservations;
create trigger trg_touch_resa before update on public.reservations
  for each row execute function public.touch_updated_at();

-- ---------- Réservation publique (sans compte) -----------------------

create or replace function public.reserver(
  p_creneau     uuid,
  p_unite       text,
  p_responsable text,
  p_chefs       text,
  p_commentaire text default ''
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_c public.creneaux%rowtype;
  v_u public.unites%rowtype;
begin
  p_responsable := btrim(coalesce(p_responsable,''));
  p_chefs       := btrim(coalesce(p_chefs,''));
  p_commentaire := btrim(coalesce(p_commentaire,''));

  if length(p_responsable) < 2 or length(p_responsable) > 120 then
    raise exception 'Veuillez indiquer le nom du responsable.' using errcode = 'P0001';
  end if;
  if length(p_chefs) < 2 or length(p_chefs) > 1000 then
    raise exception 'Veuillez indiquer les chefs présents.' using errcode = 'P0001';
  end if;
  if length(p_commentaire) > 1000 then
    raise exception 'Le commentaire est trop long (1000 caractères max).' using errcode = 'P0001';
  end if;

  select * into v_u from public.unites where id = p_unite;
  if not found then raise exception 'Unité inconnue.' using errcode = 'P0001'; end if;

  -- Verrouille la ligne du créneau : les demandes simultanées passent une à la fois.
  select * into v_c from public.creneaux where id = p_creneau for update;
  if not found then raise exception 'Ce créneau n''existe plus.' using errcode = 'P0001'; end if;
  if v_c.unite_id is not null then
    raise exception 'Désolé, ce créneau vient d''être réservé par une autre unité.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.reservations where unite_id = p_unite) then
    raise exception 'Votre unité a déjà une réservation. Contactez le chef de groupe pour la modifier.' using errcode = 'P0001';
  end if;

  begin
    insert into public.reservations (creneau_id, unite_id, responsable, chefs, commentaire, source)
    values (p_creneau, p_unite, p_responsable, p_chefs, p_commentaire, 'public');
  exception when unique_violation then
    raise exception 'Ce créneau ou votre unité vient tout juste d''être réservé. Rafraîchissez la page.' using errcode = 'P0001';
  end;

  return json_build_object(
    'unite', v_u.nom, 'debut', v_c.debut, 'fin', v_c.fin,
    'responsable', p_responsable, 'chefs', p_chefs);
end $$;

revoke all on function public.reserver(uuid,text,text,text,text) from public;
grant execute on function public.reserver(uuid,text,text,text,text) to anon, authenticated;

-- ---------- Sécurité (Row Level Security) ----------------------------

alter table public.unites       enable row level security;
alter table public.creneaux     enable row level security;
alter table public.reservations enable row level security;
alter table public.notes        enable row level security;
alter table public.admins       enable row level security;

drop policy if exists unites_lecture on public.unites;
create policy unites_lecture on public.unites for select using (true);
drop policy if exists unites_admin on public.unites;
create policy unites_admin on public.unites for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists creneaux_lecture on public.creneaux;
create policy creneaux_lecture on public.creneaux for select using (true);
drop policy if exists creneaux_admin on public.creneaux;
create policy creneaux_admin on public.creneaux for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists reservations_admin on public.reservations;
create policy reservations_admin on public.reservations for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists notes_admin on public.notes;
create policy notes_admin on public.notes for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admins_soi on public.admins;
create policy admins_soi on public.admins for select using (user_id = auth.uid());

-- Défense en profondeur : le public ne peut ni lire ni écrire les tables privées.
revoke all on public.reservations, public.notes, public.admins from anon;
revoke insert, update, delete on public.creneaux, public.unites from anon;

-- Accès explicites (requis sur les nouveaux projets Supabase)
grant usage on schema public to anon, authenticated;
grant select on public.unites, public.creneaux to anon, authenticated;
grant select, insert, update, delete on public.unites, public.creneaux, public.reservations, public.notes to authenticated;
grant select on public.admins to authenticated;
grant execute on function public.reserver(uuid,text,text,text,text) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
notify pgrst, 'reload schema';

-- ---------- Temps réel (mise à jour instantanée des créneaux) --------

do $$ begin
  alter publication supabase_realtime add table public.creneaux;
exception when others then null; end $$;

-- ---------- Données initiales ----------------------------------------

insert into public.unites (id, nom, ordre) values
  ('castors','Castors',1), ('louveteaux','Louveteaux',2), ('louvettes','Louvettes',3),
  ('eclaireurs','Éclaireurs',4), ('eclaireuses','Éclaireuses',5),
  ('pionniers','Pionniers',6), ('routiers','Routiers',7)
on conflict (id) do update set nom = excluded.nom, ordre = excluded.ordre;

insert into public.creneaux (debut, fin)
select (d || ' ' || h)::timestamp at time zone 'America/Toronto',
       (d || ' ' || h)::timestamp at time zone 'America/Toronto' + interval '90 minutes'
from (values
  ('2027-01-04','18:00'), ('2027-01-04','19:30'),
  ('2027-01-06','18:00'), ('2027-01-06','19:30'),
  ('2027-01-07','18:00'), ('2027-01-07','19:30'), ('2027-01-07','21:00')
) as s(d, h)
where not exists (select 1 from public.creneaux);

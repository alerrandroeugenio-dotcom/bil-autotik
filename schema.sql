-- Execute uma vez no SQL Editor do seu projeto Supabase.
begin;

-- Só contas autorizadas aqui podem publicar, mesmo se o cadastro público estiver ativo.
create table if not exists public.bil_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.bil_admins enable row level security;
revoke all on public.bil_admins from anon, authenticated;
grant select on public.bil_admins to authenticated;
drop policy if exists "Ler propria autorizacao" on public.bil_admins;
create policy "Ler propria autorizacao" on public.bil_admins
  for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.ofertas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  v integer not null default 1 check (v = 1),
  name text not null check (char_length(trim(name)) between 1 and 120),
  url text not null check (
    char_length(url) <= 3000 and
    url ~ '^https://[^/@[:space:]:?#]+[.][^/@[:space:]:?#]+(:[0-9]+)?([/?#][^[:space:]]*)?$'
  ),
  price text not null default '' check (char_length(price) <= 28),
  call text not null default '' check (char_length(call) <= 100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ofertas_owner_created_idx
  on public.ofertas (owner_id, created_at desc);
alter table public.ofertas enable row level security;
revoke all on public.ofertas from anon, authenticated;
grant select (id,v,name,url,price,call,active,created_at) on public.ofertas to anon;
grant select on public.ofertas to authenticated;
grant insert (id,owner_id,v,name,url,price,call,active) on public.ofertas to authenticated;
grant update (id,owner_id,v,name,url,price,call,active) on public.ofertas to authenticated;

drop policy if exists "Ler ofertas" on public.ofertas;
create policy "Ler ofertas" on public.ofertas for select to anon, authenticated
  using (active or owner_id = (select auth.uid()));

drop policy if exists "Criar ofertas proprias" on public.ofertas;
create policy "Criar ofertas proprias" on public.ofertas for insert to authenticated
  with check (
    owner_id = (select auth.uid()) and exists (
      select 1 from public.bil_admins where user_id = (select auth.uid())
    )
  );

drop policy if exists "Atualizar ofertas proprias" on public.ofertas;
create policy "Atualizar ofertas proprias" on public.ofertas for update to authenticated
  using (owner_id = (select auth.uid()) and exists (
    select 1 from public.bil_admins where user_id = (select auth.uid())
  ))
  with check (owner_id = (select auth.uid()) and exists (
    select 1 from public.bil_admins where user_id = (select auth.uid())
  ));
commit;

-- Depois de criar sua conta em Authentication > Users, autorize seu UUID:
-- insert into public.bil_admins (user_id) values ('UUID-DA-SUA-CONTA');

-- BLOQVEX 1.0 — Run ONCE in Supabase SQL Editor (a new project).
-- Public profile contains only nickname, country, cosmetic balance/skins. Never expose email.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 3 and 20),
  country text not null default 'KW' check (char_length(country) between 2 and 8),
  coins integer not null default 100 check (coins>=0),
  active_theme text not null default 'candy',
  unlocked_themes text[] not null default array['candy']::text[],
  last_daily_claim date,
  role text not null default 'player' check (role in ('player','admin')),
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_nickname_lower_unique on public.profiles(lower(nickname));

create or replace function public.on_new_player() returns trigger
language plpgsql security definer set search_path = '' as $$
declare base text;
begin
  base:=nullif(trim(new.raw_user_meta_data->>'nickname'),'');
  if base is null or length(base)<3 then base:='Player'; end if;
  base:=left(base,12) || '_' || substr(replace(new.id::text,'-',''),1,6);
  insert into public.profiles(id,nickname) values(new.id,left(base,20));
  return new;
end;$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.on_new_player();

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
select exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin'); $$;

create table if not exists public.scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check(mode in ('classic','sprint','daily')),
  points integer not null check(points between 0 and 250000),
  lines integer not null check(lines between 0 and 2000),
  combo integer not null check(combo between 0 and 100),
  created_at timestamptz not null default now()
);
create index if not exists scores_mode_ranking on public.scores(mode,points desc);
create index if not exists scores_user_date on public.scores(user_id,created_at desc);

create table if not exists public.friend_requests(
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  constraint no_self_request check(sender_id<>receiver_id),
  unique(sender_id,receiver_id)
);
create index if not exists friends_receiver_idx on public.friend_requests(receiver_id,status);

create table if not exists public.messages(
 id bigint generated always as identity primary key,
 sender_id uuid not null references public.profiles(id) on delete cascade,
 receiver_id uuid not null references public.profiles(id) on delete cascade,
 body text not null check(char_length(body) between 1 and 500),
 created_at timestamptz not null default now()
);
create index if not exists messages_thread on public.messages(sender_id,receiver_id,created_at desc);

create table if not exists public.rooms(
 id uuid primary key default gen_random_uuid(),
 code char(6) not null unique,
 host_id uuid not null references public.profiles(id) on delete cascade,
 seed bigint not null,
 state text not null default 'waiting' check(state in ('waiting','active','finished')),
 started_at timestamptz,
 finished_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists room_date on public.rooms(created_at desc);
create table if not exists public.room_members(
 room_id uuid not null references public.rooms(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 score integer not null default 0 check(score>=0),
 lines integer not null default 0 check(lines>=0),
 joined_at timestamptz not null default now(),
 last_report timestamptz,
 primary key(room_id,user_id)
);

create table if not exists public.notifications(
 id bigint generated always as identity primary key,
 body text not null check(char_length(body) between 1 and 500),
 target_id uuid references public.profiles(id) on delete cascade,
 created_by uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now()
);
create index if not exists notifications_date on public.notifications(created_at desc);

-- RLS: default DENY. Sensitive changes are SECURITY DEFINER RPCs only.
alter table public.profiles enable row level security;
alter table public.scores enable row level security;
alter table public.friend_requests enable row level security;
alter table public.messages enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.notifications enable row level security;

-- Public profile is deliberately limited in direct grants to prevent reading coins/role via public API.
revoke all on public.profiles from anon,authenticated;
grant select(id,nickname,country,active_theme,unlocked_themes,coins,role,created_at,last_daily_claim) on public.profiles to authenticated;
grant select(id,nickname,country) on public.profiles to anon;
-- Note: signed-in users can read all profile columns (including roles/balances but not emails).
-- Public profiles are not secret; if limiting other users' balances is important, use a separate public view.
create policy "profiles readable" on public.profiles for select to authenticated,anon using(true);

create policy "scores public" on public.scores for select to authenticated,anon using(true);
grant select on public.scores to anon,authenticated;

create policy "requests visible to participants" on public.friend_requests for select to authenticated
  using((select auth.uid()) in (sender_id,receiver_id));
grant select on public.friend_requests to authenticated;

create or replace function public.are_friends(a uuid,b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.friend_requests f where f.status='accepted' and
 ((f.sender_id=a and f.receiver_id=b) or (f.sender_id=b and f.receiver_id=a)));
$$;
create policy "friend messages visible" on public.messages for select to authenticated
 using(((select auth.uid())=sender_id or (select auth.uid())=receiver_id) and public.are_friends(sender_id,receiver_id));
create policy "friend messages insert" on public.messages for insert to authenticated
 with check((select auth.uid())=sender_id and sender_id<>receiver_id and public.are_friends(sender_id,receiver_id));
grant select,insert on public.messages to authenticated;

create or replace function public.is_room_member(r uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.room_members where room_id=r and user_id=(select auth.uid()));
$$;
create policy "rooms readable to members" on public.rooms for select to authenticated
 using(host_id=(select auth.uid()) or public.is_room_member(id));
create policy "room members readable to members" on public.room_members for select to authenticated
 using(public.is_room_member(room_id));
grant select on public.rooms,public.room_members to authenticated;

create policy "announcements readable" on public.notifications for select to authenticated
 using(target_id is null or target_id=(select auth.uid()) or public.is_admin());
create policy "admins send announcements" on public.notifications for insert to authenticated
 with check(public.is_admin() and created_by=(select auth.uid()));
grant select,insert on public.notifications to authenticated;

-- Profile updates restricted to non-privileged fields.
create or replace function public.update_my_profile(p_nickname text,p_country text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if (select auth.uid()) is null then raise exception 'Sign in required'; end if;
 p_nickname:=trim(p_nickname);p_country:=upper(trim(p_country));
 if char_length(p_nickname)<3 or char_length(p_nickname)>20 then raise exception 'Nickname must have 3–20 characters';end if;
 if p_country not in ('KW','SA','AE','BH','QA','OM','EG','MA','IQ','US','GB','OTHER') then raise exception 'Unsupported country';end if;
 update public.profiles set nickname=p_nickname,country=p_country where id=(select auth.uid());
 return jsonb_build_object('ok',true);
end;$$;

create or replace function public.claim_daily_reward()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.profiles%rowtype;
begin
 if (select auth.uid()) is null then raise exception 'Sign in required';end if;
 select * into p from public.profiles where id=(select auth.uid()) for update;
 if p.last_daily_claim=current_date then raise exception 'Daily reward already claimed';end if;
 update public.profiles set coins=coins+60,last_daily_claim=current_date where id=p.id;
 return jsonb_build_object('awarded',60,'coins',p.coins+60);
end;$$;

create or replace function public.buy_theme(p_theme text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare price integer;p public.profiles%rowtype;
begin
 if (select auth.uid()) is null then raise exception 'Sign in required';end if;
 price:=case p_theme when 'ocean' then 150 when 'sunset' then 200 when 'galaxy' then 300 when 'mint' then 150 when 'lava' then 250 when 'candy' then 0 else null end;
 if price is null then raise exception 'Unknown theme';end if;
 select * into p from public.profiles where id=(select auth.uid()) for update;
 if not (p_theme=any(p.unlocked_themes)) then
   if p.coins<price then raise exception 'Not enough coins';end if;
   update public.profiles set coins=coins-price,unlocked_themes=array_append(unlocked_themes,p_theme),active_theme=p_theme where id=p.id;
 else update public.profiles set active_theme=p_theme where id=p.id;
 end if;
 return jsonb_build_object('ok',true,'theme',p_theme);
end;$$;

create or replace function public.submit_score(p_mode text,p_points integer,p_lines integer,p_combo integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare record_id bigint; reward integer;
begin
 if (select auth.uid()) is null then raise exception 'Sign in required';end if;
 if p_mode not in ('classic','sprint','daily') or p_points not between 0 and 250000 or p_lines not between 0 and 2000 or p_combo not between 0 and 100 then raise exception 'Invalid score';end if;
 -- Submission throttle, per-user (does NOT replace a server-authoritative anti-cheat system).
 perform pg_advisory_xact_lock(hashtext((select auth.uid())::text));
 if exists(select 1 from public.scores where user_id=(select auth.uid()) and created_at>now()-interval '5 seconds') then raise exception 'Please try again in a moment';end if;
 insert into public.scores(user_id,mode,points,lines,combo) values((select auth.uid()),p_mode,p_points,p_lines,p_combo) returning id into record_id;
 -- Award coins ONLY on one scored run per hour to discourage farming.
 if not exists(select 1 from public.scores where user_id=(select auth.uid()) and id<>record_id and created_at>now()-interval '1 hour') then
  reward:=least(25,greatest(2,p_points/250));update public.profiles set coins=coins+reward where id=(select auth.uid());
 else reward:=0;end if;
 return jsonb_build_object('saved',true,'reward',reward);
end;$$;

create or replace function public.send_friend_request(p_target uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if (select auth.uid()) is null or p_target=(select auth.uid()) then raise exception 'Invalid player';end if;
 if not exists(select 1 from public.profiles where id=p_target) then raise exception 'Player not found';end if;
 if exists(select 1 from public.friend_requests where (sender_id=(select auth.uid()) and receiver_id=p_target) or (receiver_id=(select auth.uid()) and sender_id=p_target)) then raise exception 'Request/friendship already exists';end if;
 insert into public.friend_requests(sender_id,receiver_id) values((select auth.uid()),p_target);
 return jsonb_build_object('ok',true);
end;$$;
create or replace function public.respond_friend_request(p_request uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 update public.friend_requests set status=case when p_accept then 'accepted' else 'rejected' end
 where id=p_request and receiver_id=(select auth.uid()) and status='pending';
 if not found then raise exception 'Request not found';end if;
 return jsonb_build_object('ok',true);
end;$$;

create or replace function public.create_battle_room()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare new_id uuid; new_code text; i int;
begin
 if (select auth.uid()) is null then raise exception 'Sign in required';end if;
 -- Limit pending rooms per host. A finished room may remain as history.
 if (select count(*) from public.rooms where host_id=(select auth.uid()) and state='waiting' and created_at>now()-interval '2 hours')>=3 then raise exception 'Too many waiting rooms';end if;
 for i in 1..15 loop
  new_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  begin
   insert into public.rooms(code,host_id,seed) values(new_code,(select auth.uid()),floor(random()*2147483646)::bigint+1) returning id into new_id;
   exit;
  exception when unique_violation then null;
  end;
 end loop;
 if new_id is null then raise exception 'Unable to generate room code';end if;
 insert into public.room_members(room_id,user_id) values(new_id,(select auth.uid()));
 return jsonb_build_object('id',new_id,'code',new_code);
end;$$;
create or replace function public.join_battle_room(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.rooms%rowtype; n int;
begin
 if (select auth.uid()) is null then raise exception 'Sign in required';end if;
 select * into r from public.rooms where code=upper(trim(p_code)) and created_at>now()-interval '2 hours' for update;
 if not found then raise exception 'Room not found or expired';end if;
 if exists(select 1 from public.room_members where room_id=r.id and user_id=(select auth.uid())) then
  return jsonb_build_object('id',r.id,'code',r.code);
 end if;
 select count(*) into n from public.room_members where room_id=r.id;
 if r.state<>'waiting' or n>=2 then raise exception 'Room is full or has already started';end if;
 insert into public.room_members(room_id,user_id) values(r.id,(select auth.uid()));
 update public.rooms set state='active',started_at=now() where id=r.id;
 return jsonb_build_object('id',r.id,'code',r.code);
end;$$;
create or replace function public.report_battle_progress(p_room uuid,p_score integer,p_lines integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.rooms%rowtype; m public.room_members%rowtype;
begin
 if (select auth.uid()) is null then raise exception 'Sign in required';end if;
 select * into r from public.rooms where id=p_room for update;
 if not found then raise exception 'Room not found';end if;
 select * into m from public.room_members where room_id=p_room and user_id=(select auth.uid()) for update;
 if not found then raise exception 'Not in room';end if;
 if r.state='active' and now()>=r.started_at+interval '120 seconds' then
  update public.rooms set state='finished',finished_at=now() where id=p_room;
 end if;
 if r.state='active' and now()<r.started_at+interval '120 seconds' then
   if p_score<m.score or p_score>250000 or p_score-m.score>30000 or p_lines<m.lines or p_lines>2000 then raise exception 'Invalid progress';end if;
   update public.room_members set score=p_score,lines=p_lines,last_report=now() where room_id=p_room and user_id=(select auth.uid());
 end if;
 return jsonb_build_object('ok',true);
end;$$;
create or replace function public.leave_battle_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.rooms%rowtype;
begin
 select * into r from public.rooms where id=p_room for update;
 if not found then return jsonb_build_object('ok',true);end if;
 if not exists(select 1 from public.room_members where room_id=p_room and user_id=(select auth.uid())) then raise exception 'Not in room';end if;
 update public.rooms set state='finished',finished_at=now() where id=p_room and state='active';
 delete from public.room_members where room_id=p_room and user_id=(select auth.uid());
 if not exists(select 1 from public.room_members where room_id=p_room) then delete from public.rooms where id=p_room;end if;
 return jsonb_build_object('ok',true);
end;$$;

revoke all on function public.on_new_player() from public,anon,authenticated;
revoke all on function public.is_admin(), public.are_friends(uuid,uuid), public.is_room_member(uuid) from public,anon,authenticated;
grant execute on function public.is_admin(), public.are_friends(uuid,uuid), public.is_room_member(uuid) to authenticated;
revoke all on function public.update_my_profile(text,text),public.claim_daily_reward(),public.buy_theme(text),public.submit_score(text,integer,integer,integer),public.send_friend_request(uuid),public.respond_friend_request(uuid,boolean),public.create_battle_room(),public.join_battle_room(text),public.report_battle_progress(uuid,integer,integer),public.leave_battle_room(uuid) from public,anon,authenticated;
-- Grant only the RPCs intended for clients; internal helpers remain callable as needed by RLS.
grant execute on function public.update_my_profile(text,text),public.claim_daily_reward(),public.buy_theme(text),public.submit_score(text,integer,integer,integer),public.send_friend_request(uuid),public.respond_friend_request(uuid,boolean),public.create_battle_room(),public.join_battle_room(text),public.report_battle_progress(uuid,integer,integer),public.leave_battle_room(uuid) to authenticated;

-- OPTIONAL: To authorize the owner's account, sign up first, then run in SQL Editor:
-- UPDATE public.profiles SET role='admin' WHERE id='YOUR_ACCOUNT_UUID';
-- Never allow client-side updates to role/coins.
-- For reliable realtime polling no Realtime publication is required (rooms refresh every few seconds).

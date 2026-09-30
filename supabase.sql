-- Debate Hub database setup.
-- Supabase dashboard -> SQL Editor -> New query -> paste all of this -> Run.
-- Your old "debates" table is not used any more; you can delete it.

create table if not exists hub_debates (
  id          bigint primary key,
  title       text not null check (char_length(title) between 1 and 120),
  category    text not null check (category in ('Politics','Technology','Science','Philosophy','Sports')),
  type        text not null check (type in ('1v1','Group')),
  description text not null check (char_length(description) between 1 and 500),
  creator     text not null check (char_length(creator) between 1 and 20),
  created_at  timestamptz not null default now()
);

create table if not exists hub_participants (
  debate_id  bigint not null references hub_debates(id) on delete cascade,
  username   text not null check (char_length(username) between 1 and 20),
  joined_at  timestamptz not null default now(),
  primary key (debate_id, username)
);

create table if not exists hub_messages (
  id         bigint primary key,
  debate_id  bigint not null references hub_debates(id) on delete cascade,
  author     text not null check (char_length(author) between 1 and 20),
  stance     text not null check (stance in ('Pro','Con','Neutral')),
  "text"     text not null check (char_length("text") between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists hub_messages_debate_idx on hub_messages(debate_id, created_at);

create table if not exists hub_votes (
  message_id bigint not null references hub_messages(id) on delete cascade,
  username   text not null check (char_length(username) between 1 and 20),
  primary key (message_id, username)
);

-- A 1v1 debate can never have more than 2 participants, even if two people join at the same moment.
create or replace function hub_limit_1v1() returns trigger language plpgsql as $$
declare t text; n int;
begin
  perform 1 from hub_debates where id = new.debate_id for update;
  select type into t from hub_debates where id = new.debate_id;
  select count(*) into n from hub_participants where debate_id = new.debate_id;
  if t = '1v1' and n >= 2 then
    raise exception 'This 1v1 debate is full';
  end if;
  return new;
end $$;

drop trigger if exists hub_limit_1v1_trg on hub_participants;
create trigger hub_limit_1v1_trg before insert on hub_participants
  for each row execute function hub_limit_1v1();

-- Row Level Security: the public (anon) key can read everything, add new rows, and remove its own votes.
-- It can NOT edit or delete debates, participants or messages.
alter table hub_debates      enable row level security;
alter table hub_participants enable row level security;
alter table hub_messages     enable row level security;
alter table hub_votes        enable row level security;

drop policy if exists "read debates"      on hub_debates;
drop policy if exists "read participants" on hub_participants;
drop policy if exists "read messages"     on hub_messages;
drop policy if exists "read votes"        on hub_votes;
drop policy if exists "add debates"       on hub_debates;
drop policy if exists "add participants"  on hub_participants;
drop policy if exists "add messages"      on hub_messages;
drop policy if exists "add votes"         on hub_votes;
drop policy if exists "remove votes"      on hub_votes;

create policy "read debates"      on hub_debates      for select using (true);
create policy "read participants" on hub_participants for select using (true);
create policy "read messages"     on hub_messages     for select using (true);
create policy "read votes"        on hub_votes        for select using (true);

create policy "add debates"      on hub_debates      for insert with check (true);
create policy "add participants" on hub_participants for insert with check (true);
-- Only someone who joined a debate can post in it
create policy "add messages" on hub_messages for insert with check (
  exists (select 1 from hub_participants p where p.debate_id = hub_messages.debate_id and p.username = hub_messages.author)
);
create policy "add votes"    on hub_votes for insert with check (true);
create policy "remove votes" on hub_votes for delete using (true);

grant usage on schema public to anon;
grant select, insert on hub_debates, hub_participants, hub_messages to anon;
grant select, insert, delete on hub_votes to anon;

-- Optional: three starter debates so the app isn't empty. Skip this block if you don't want them.
insert into hub_debates (id, title, category, type, description, creator, created_at) values
 (1, 'Universal Basic Income Implementation', 'Politics', '1v1', 'Should UBI be implemented nationwide to combat automation job losses?', 'Alex M.', now() - interval '1 day'),
 (2, 'AGI and Future AI Regulation', 'Technology', 'Group', 'Panel discussion on whether AI development should be paused or strictly regulated.', 'Elena R.', now() - interval '1 day'),
 (3, 'Ethics of Space Commercialization', 'Science', '1v1', 'Is private space exploration beneficial or harmful to humanity long-term?', 'Marcus B.', now() - interval '1 day')
on conflict (id) do nothing;

insert into hub_participants (debate_id, username, joined_at) values
 (1, 'Alex M.', now() - interval '1 day'),
 (2, 'Elena R.', now() - interval '1 day'), (2, 'David K.', now() - interval '1 day'), (2, 'Sarah L.', now() - interval '1 day'),
 (3, 'Marcus B.', now() - interval '1 day'), (3, 'John D.', now() - interval '1 day')
on conflict do nothing;

insert into hub_messages (id, debate_id, author, stance, "text", created_at) values
 (101, 1, 'Alex M.',  'Pro', 'Automation will eliminate millions of entry-level jobs. UBI provides an essential safety net.', now() - interval '1 day'),
 (103, 2, 'Elena R.', 'Con', 'Strict regulations right now will only slow down beneficial research and innovation.', now() - interval '1 day'),
 (104, 2, 'David K.', 'Pro', 'Without guardrails, frontier models pose existential security threats.', now() - interval '1 day'),
 (105, 3, 'Marcus B.','Pro', 'Commercial competition dramatically lowers launching costs.', now() - interval '1 day'),
 (106, 3, 'John D.',  'Con', 'It risks monopolizing space resources for corporate interests.', now() - interval '1 day')
on conflict (id) do nothing;

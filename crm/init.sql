create table if not exists crm_user (
                                        user_id text primary key,
                                        full_name text not null,
                                        email text not null
);

create table if not exists crm_prosthesis (
                                              id bigserial primary key,
                                              user_id text not null references crm_user(user_id),
    model text not null,
    created_at timestamptz not null default now(),
    unique (user_id)
    );

create table if not exists telemetry_event (
                                               id bigserial primary key,
                                               user_id text not null,
                                               event_type text not null,
                                               created_at timestamptz not null default now()
    );

create index if not exists idx_telemetry_event_user_time
    on telemetry_event(user_id, created_at);

insert into crm_user(user_id, full_name, email)
values
    ('user1', 'Алексей Смирнов', 'alexey.smirnov@example.com'),
    ('user2', 'Наталья Козлова', 'natalia.kozlova@example.com'),
    ('john.doe', 'Джон Дое', 'john.doe@example.com')

    on conflict (user_id) do nothing;

insert into crm_prosthesis(user_id, model)
values
    ('user1', 'NeuroPulse A3'),
    ('user2', 'NeuroPulse A5'),
    ('john.doe', 'RoboLeg Turbo')
    on conflict (user_id) do nothing;

insert into telemetry_event(user_id, event_type, created_at)
select
    case when gs % 3 = 0 then 'user1'
         when gs % 3 = 1 then 'john.doe'
         else 'john.doe' end,
    case when gs % 10 = 0 then 'ERROR' else 'MOVE' end,
    now() - (gs || ' minutes')::interval
from generate_series(1, 1000) as gs;
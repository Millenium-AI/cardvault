-- Cache of JustTCG's per-game set list, populated by a manual/scheduled
-- sync (server/justtcg.ts syncSetsForGame) rather than hit JustTCG's
-- /v1/sets endpoint live on every dropdown open. Served to the client via
-- GET /api/search/sets so the Search page "Set" filter reads from our own DB.
create table if not exists justtcg_sets (
  game text not null,
  set_id text not null,
  set_name text not null,
  fetched_at timestamptz not null default now(),
  primary key (game, set_id)
);

create index if not exists idx_justtcg_sets_game on justtcg_sets (game);

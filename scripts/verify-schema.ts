import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";

async function main() {
  const migrationsDirectory = path.join(process.cwd(), "supabase", "migrations");
  const migrationFiles = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
  assert.ok(migrationFiles.length > 0, "At least one Supabase migration is required.");

  const database = new PGlite();
  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
  `);

  for (const migrationFile of migrationFiles) {
    await database.exec(await readFile(path.join(migrationsDirectory, migrationFile), "utf8"));
  }

  const rls = await database.query<{ relname: string; relrowsecurity: boolean }>(`
    select relname, relrowsecurity
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relkind = 'r'
      and relname in ('sessions', 'players', 'rounds', 'matches', 'match_assignments', 'match_substitutions')
    order by relname;
  `);
  assert.equal(rls.rows.length, 6);
  assert.ok(rls.rows.every((table) => table.relrowsecurity), "RLS must be enabled on every public table.");

  const privileges = await database.query<{ anon_select: boolean; service_write: boolean }>(`
    select
      has_table_privilege('anon', 'public.sessions', 'select') as anon_select,
      has_table_privilege('service_role', 'public.sessions', 'insert') as service_write;
  `);
  assert.equal(privileges.rows[0].anon_select, false);
  assert.equal(privileges.rows[0].service_write, true);

  const sessionId = "00000000-0000-4000-8000-000000000001";
  const playerId = "00000000-0000-4000-8000-000000000002";
  const roundId = "00000000-0000-4000-8000-000000000003";
  const matchId = "00000000-0000-4000-8000-000000000004";

  await database.query(
    `insert into public.sessions
      (id, host_token_hash, share_code, name, venue, scheduled_start, duration_minutes, timezone, court_count, game_format)
     values ($1, 'hash', 'ABC12345', 'Friday Badminton', 'Central Hall', now(), 120, 'Asia/Jakarta', 1, 'doubles')`,
    [sessionId],
  );
  await database.query(
    "insert into public.players (id, session_id, name, level) values ($1, $2, 'Alex', 'intermediate')",
    [playerId, sessionId],
  );
  await database.query(
    "insert into public.rounds (id, session_id, round_number, status) values ($1, $2, 1, 'live')",
    [roundId, sessionId],
  );
  await database.query(
    `insert into public.matches
      (id, session_id, round_id, court_number, status, team_a_score, team_b_score, winner)
     values ($1, $2, $3, 1, 'completed', 21, 17, 'a')`,
    [matchId, sessionId, roundId],
  );
  await database.query(
    "insert into public.match_assignments (match_id, player_id, team, slot) values ($1, $2, 'a', 1)",
    [matchId, playerId],
  );

  await assert.rejects(
    database.query(
      `insert into public.matches
        (session_id, round_id, court_number, status, team_a_score, team_b_score, winner)
       values ($1, $2, 2, 'completed', 20, 21, 'a')`,
      [sessionId, roundId],
    ),
    /check constraint/i,
  );

  const foreignKeyIndexes = await database.query<{ missing_count: number }>(`
    with foreign_keys as (
      select conrelid, conkey
      from pg_constraint
      where contype = 'f' and connamespace = 'public'::regnamespace
    )
    select count(*)::int as missing_count
    from foreign_keys fk
    where not exists (
      select 1 from pg_index i
      where i.indrelid = fk.conrelid
        and i.indkey::smallint[] @> fk.conkey
    );
  `);
  assert.equal(foreignKeyIndexes.rows[0].missing_count, 0, "Every foreign key should have a covering index.");

  await database.close();
  console.log(`Schema verified: ${migrationFiles.length} migration(s), RLS, grants, constraints, and FK indexes passed.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

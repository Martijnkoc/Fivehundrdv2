/*
 * The spot lifecycle from BUILD_BRIEF §15, per lane. Each statement is a
 * single UPDATE guarded by the spot's current status, so two concurrent
 * checkouts for the same (lane, no) cannot both win: under READ COMMITTED the
 * second UPDATE waits for the first row lock, re-checks `status = 'vacant'`
 * and matches 0 rows.
 */

/** $1 lane, $2 no, $3 story id. 0 rows: the spot is taken; offer another. */
export const reserveSpot = `
  update spots
     set status = 'reserved', reserved_until = now() + interval '15 minutes', story_id = $3
   where lane = $1 and no = $2 and status = 'vacant'
  returning lane, no`;

/** Stripe webhook, $1 story id. 0 rows: the reservation was already released. */
export const goLive = `
  with live as (
    update stories
       set starts_at = now(), ends_at = now() + interval '72 hours'
     where id = $1 and starts_at is null
       and exists (select 1 from spots where story_id = $1 and status = 'reserved')
    returning id
  )
  update spots
     set status = 'live', reserved_until = null
   where story_id in (select id from live)
  returning lane, no`;

/** Every minute: abandoned checkouts free their number. */
export const releaseStaleReservations = `
  update spots
     set status = 'vacant', reserved_until = null, story_id = null
   where status = 'reserved' and reserved_until < now()
  returning lane, no`;

/** Every minute: spots whose 72 hours are over free up. */
export const freeExpiredSpots = `
  update spots
     set status = 'vacant', story_id = null
    from stories
   where spots.story_id = stories.id
     and spots.status = 'live'
     and stories.ends_at <= now()
  returning spots.lane, spots.no`;

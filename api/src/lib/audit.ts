import { type Db, pool } from "../db/pool.js";

/** Appends an entry to the event activity timeline / audit log (SRS 4.16). */
export async function audit(
  entry: {
    eventId?: number | null;
    actorId?: number | null;
    action: string;
    entityType: string;
    entityId?: number | null;
    description: string;
  },
  db: Db = pool,
) {
  await db.query(
    `INSERT INTO audit_log (event_id, actor_id, action, entity_type, entity_id, description)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [entry.eventId ?? null, entry.actorId ?? null, entry.action, entry.entityType, entry.entityId ?? null, entry.description],
  );
}

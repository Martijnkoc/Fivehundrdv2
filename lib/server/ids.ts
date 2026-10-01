/*
 * The ids requests carry, checked the same way in every route: a story,
 * spot or user is a UUID; a visitor is the random id the browser keeps
 * (app/wall/track.ts, visitorId). Anything else is a bad request.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VISITOR = /^[A-Za-z0-9_-]{8,64}$/;

export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
export const isVisitor = (v: unknown): v is string => typeof v === "string" && VISITOR.test(v);

// Placeholder until the project is linked to a live Supabase instance and real
// types are generated with:
//   npx supabase gen types typescript --linked > src/lib/supabase/types.ts
// Using `any` here (not a stricter shape) deliberately avoids hand-maintaining a
// schema definition that would drift from supabase/migrations/*.sql.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any

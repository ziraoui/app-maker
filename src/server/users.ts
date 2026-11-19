import { db } from "@/db";
import { users } from "@/db/schema";

/** Records a member the first time the app sees them; the email follows the identity. */
export async function rememberUser(user: { id: string; email: string }) {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email })
    .onConflictDoUpdate({ target: users.id, set: { email: user.email } });
}

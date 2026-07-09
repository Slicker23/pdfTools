import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

async function upsertUserFromGoogle(profile: {
  email: string;
  name?: string | null;
  image?: string | null;
  googleId: string;
}) {
  if (!db) return null;

  const [existing] = await db
    .select()
    .from(users)
    .where(
      or(eq(users.googleId, profile.googleId), eq(users.email, profile.email))
    )
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(users)
      .values({
        email: profile.email,
        name: profile.name ?? null,
        image: profile.image ?? null,
        googleId: profile.googleId,
      })
      .returning();
    return created;
  }

  const [updated] = await db
    .update(users)
    .set({
      googleId: profile.googleId,
      name: profile.name ?? existing.name,
      image: profile.image ?? existing.image,
      updatedAt: new Date(),
    })
    .where(eq(users.id, existing.id))
    .returning();

  return updated;
}

async function getDbUser(email: string) {
  if (!db) return null;
  const [dbUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return dbUser ?? null;
}

function googleClientId(): string | undefined {
  return process.env.GOOGLE_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID;
}

function googleClientSecret(): string | undefined {
  return process.env.GOOGLE_CLIENT_SECRET ?? process.env.AUTH_GOOGLE_SECRET;
}

export function isGoogleAuthConfigured(): boolean {
  const id = googleClientId()?.trim();
  const secret = googleClientSecret()?.trim();
  return Boolean(
    process.env.AUTH_SECRET?.trim() &&
      id &&
      id.length > 20 &&
      id.includes(".apps.googleusercontent.com") &&
      secret &&
      secret.length > 10
  );
}

const googleProvider = isGoogleAuthConfigured()
  ? Google({
      clientId: googleClientId()!,
      clientSecret: googleClientSecret()!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "online",
          response_type: "code",
        },
      },
    })
  : null;

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  providers: googleProvider ? [googleProvider] : [],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!account?.providerAccountId || !user.email) {
        return false;
      }

      try {
        await upsertUserFromGoogle({
          email: user.email,
          name: user.name,
          image: user.image,
          googleId: account.providerAccountId,
        });
        return true;
      } catch (error) {
        console.error("Failed to upsert user on sign-in:", error);
        return false;
      }
    },
    async jwt({ token, user, account }) {
      if (account && user?.email) {
        const dbUser = await getDbUser(user.email);
        if (dbUser) {
          token.id = dbUser.id;
          token.paid = dbUser.paid;
          token.documentsProcessed = dbUser.documentsProcessed;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.id) session.user.id = token.id as string;

        if (session.user.email) {
          const dbUser = await getDbUser(session.user.email);
          if (dbUser) {
            session.user.id = dbUser.id;
            session.user.paid = dbUser.paid;
            session.user.documentsProcessed = dbUser.documentsProcessed;
          } else if (token.paid !== undefined) {
            session.user.paid = token.paid as boolean;
            session.user.documentsProcessed = token.documentsProcessed as number;
          }
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/en/auth/signin",
    error: "/en/auth/signin",
  },
});

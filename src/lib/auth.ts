import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { db } from "./db";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;
      try {
        const dbUser = await db.user.upsert({
          where: { email: user.email },
          update: {
            name: user.name,
            image: user.image,
          },
          create: {
            email: user.email,
            name: user.name,
            image: user.image,
          },
        });

        if (account) {
          await db.account.upsert({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
            update: {
              access_token: account.access_token,
              refresh_token: account.refresh_token,
              expires_at: account.expires_at,
              scope: account.scope,
            },
            create: {
              userId: dbUser.id,
              type: account.type,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              access_token: account.access_token,
              refresh_token: account.refresh_token,
              expires_at: account.expires_at,
              scope: account.scope,
            },
          });
        }

        // Attach database user id to the user object (safe because of custom next-auth.d.ts definitions)
        user.id = dbUser.id;
        return true;
      } catch (error) {
        console.error("signIn error:", error);
        return false;
      }
    },
    async jwt({ token, user, account }) {
      // On initial sign-in, store database user.id and Google tokens in JWT
      if (user) {
        token.id = user.id;
      }
      if (account) {
        token.access_token = account.access_token;
        token.refresh_token = account.refresh_token;
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      return token;
    },
    async session({ session, token }) {
      // Pass values from JWT into the session object
      if (session.user && token) {
        session.user.id = token.id;
        session.user.access_token = token.access_token;
        session.user.refresh_token = token.refresh_token;
        session.user.accessToken = token.accessToken;
        session.user.refreshToken = token.refreshToken;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET || "fallback_secret_for_vercel_deployments_only",
};

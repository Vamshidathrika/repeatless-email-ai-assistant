import { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      access_token?: string;
      refresh_token?: string;
      accessToken?: string;
      refreshToken?: string;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    id?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    access_token?: string;
    refresh_token?: string;
    accessToken?: string;
    refreshToken?: string;
  }
}

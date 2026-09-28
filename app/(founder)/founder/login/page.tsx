import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { founder } from "../../../../lib/founder/auth";
import { Login } from "./Login";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await founder()) redirect("/founder");
  return <Login />;
}

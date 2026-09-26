import type { Metadata } from "next";
import { Admin } from "./Admin";

export const metadata: Metadata = {
  title: "fivehundrd. admin",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <Admin />;
}

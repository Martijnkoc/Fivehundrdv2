import type { ReactNode } from "react";
import { requireFounder } from "../../../../lib/founder/auth";
import { isDemo } from "../../../../lib/founder/data";
import { Shell } from "../_kit/Shell";

/* every page behind this layout is the signed-in founder's only */
export default async function RoomLayout({ children }: { children: ReactNode }) {
  const email = await requireFounder();
  return (
    <Shell email={email} demo={isDemo()}>
      {children}
    </Shell>
  );
}

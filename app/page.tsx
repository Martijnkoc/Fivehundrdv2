import { WallApp } from "@/components/wall-app";

type Props = { searchParams: Promise<{ fixture?: string }> };

export default async function Page({ searchParams }: Props) {
  const { fixture } = await searchParams;
  return <WallApp fixture={fixture !== undefined} />;
}

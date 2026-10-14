import { ManpowerView } from "../manpower-view";

export const metadata = { title: "Operator" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return <ManpowerView category="OPERATOR" sp={await searchParams} />;
}

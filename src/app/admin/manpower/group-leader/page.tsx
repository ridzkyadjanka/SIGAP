import { ManpowerView } from "../manpower-view";

export const metadata = { title: "Group Leader" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return <ManpowerView category="GROUP_LEADER" sp={await searchParams} />;
}

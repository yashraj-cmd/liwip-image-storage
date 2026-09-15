import { auth } from "@/auth";
import { DriveApp } from "@/components/drive/DriveApp";
import { MASTER_FOLDER_NAME } from "@/lib/storage";

export default async function Home() {
  const session = await auth();

  return (
    <DriveApp
      masterLabel={MASTER_FOLDER_NAME}
      user={{
        name: session?.user?.name ?? null,
        email: session?.user?.email ?? null,
        image: session?.user?.image ?? null,
      }}
    />
  );
}

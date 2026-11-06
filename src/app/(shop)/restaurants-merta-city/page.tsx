import { DirectoryPage, directoryMetadata, type DirectorySearch } from "@/components/directory/directory-page";

export const generateMetadata = ({ searchParams }: { searchParams: DirectorySearch }) => directoryMetadata("restaurant", searchParams);

export default function Page({ searchParams }: { searchParams: DirectorySearch }) {
  return <DirectoryPage category="restaurant" searchParams={searchParams} />;
}

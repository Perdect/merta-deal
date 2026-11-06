import { DirectoryPage, directoryMetadata, type DirectorySearch } from "@/components/directory/directory-page";

export const generateMetadata = ({ searchParams }: { searchParams: DirectorySearch }) => directoryMetadata("hotel", searchParams);

export default function Page({ searchParams }: { searchParams: DirectorySearch }) {
  return <DirectoryPage category="hotel" searchParams={searchParams} />;
}

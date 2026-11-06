import { BusinessProfile, profileMetadata, type ProfileParams } from "@/components/directory/business-profile";

export const generateMetadata = ({ params }: { params: ProfileParams }) => profileMetadata("bakery", params);

export default function Page({ params }: { params: ProfileParams }) {
  return <BusinessProfile category="bakery" params={params} />;
}

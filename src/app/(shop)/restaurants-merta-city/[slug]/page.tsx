import { BusinessProfile, profileMetadata, type ProfileParams } from "@/components/directory/business-profile";

export const generateMetadata = ({ params }: { params: ProfileParams }) => profileMetadata("restaurant", params);

export default function Page({ params }: { params: ProfileParams }) {
  return <BusinessProfile category="restaurant" params={params} />;
}

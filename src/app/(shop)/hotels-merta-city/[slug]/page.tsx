import { BusinessProfile, profileMetadata, type ProfileParams } from "@/components/directory/business-profile";

export const generateMetadata = ({ params }: { params: ProfileParams }) => profileMetadata("hotel", params);

export default function Page({ params }: { params: ProfileParams }) {
  return <BusinessProfile category="hotel" params={params} />;
}

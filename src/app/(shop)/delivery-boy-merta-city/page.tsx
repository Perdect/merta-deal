import { ServicePage, serviceMetadata } from "@/components/services/service-page";

export const generateMetadata = () => serviceMetadata("delivery-boy-merta-city");

export default function Page() {
  return <ServicePage slug="delivery-boy-merta-city" />;
}

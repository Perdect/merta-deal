import { ServicePage, serviceMetadata } from "@/components/services/service-page";

export const generateMetadata = () => serviceMetadata("office-delivery-merta-city");

export default function Page() {
  return <ServicePage slug="office-delivery-merta-city" />;
}

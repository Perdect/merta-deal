import { ServicePage, serviceMetadata } from "@/components/services/service-page";

export const generateMetadata = () => serviceMetadata("urgent-delivery-merta-city");

export default function Page() {
  return <ServicePage slug="urgent-delivery-merta-city" />;
}

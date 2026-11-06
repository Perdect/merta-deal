import { ServicePage, serviceMetadata } from "@/components/services/service-page";

export const generateMetadata = () => serviceMetadata("sweets-delivery-merta-city");

export default function Page() {
  return <ServicePage slug="sweets-delivery-merta-city" />;
}

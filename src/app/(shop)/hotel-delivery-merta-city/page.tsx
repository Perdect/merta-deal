import { ServicePage, serviceMetadata } from "@/components/services/service-page";

export const generateMetadata = () => serviceMetadata("hotel-delivery-merta-city");

export default function Page() {
  return <ServicePage slug="hotel-delivery-merta-city" />;
}

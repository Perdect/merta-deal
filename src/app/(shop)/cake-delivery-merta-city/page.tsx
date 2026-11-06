import { ServicePage, serviceMetadata } from "@/components/services/service-page";

export const generateMetadata = () => serviceMetadata("cake-delivery-merta-city");

export default function Page() {
  return <ServicePage slug="cake-delivery-merta-city" />;
}

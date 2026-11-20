import { ServicePage, serviceMetadata } from "@/components/services/service-page";

export const generateMetadata = () => serviceMetadata("pizza-delivery-merta-city");

export default function Page() {
  return <ServicePage slug="pizza-delivery-merta-city" />;
}

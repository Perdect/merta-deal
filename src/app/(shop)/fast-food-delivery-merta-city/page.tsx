import { ServicePage, serviceMetadata } from "@/components/services/service-page";

export const generateMetadata = () => serviceMetadata("fast-food-delivery-merta-city");

export default function Page() {
  return <ServicePage slug="fast-food-delivery-merta-city" />;
}

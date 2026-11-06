import { ServicePage, serviceMetadata } from "@/components/services/service-page";

export const generateMetadata = () => serviceMetadata("food-delivery-merta-city");

export default function Page() {
  return <ServicePage slug="food-delivery-merta-city" />;
}

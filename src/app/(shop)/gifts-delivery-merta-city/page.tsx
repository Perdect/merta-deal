import { ServicePage, serviceMetadata } from "@/components/services/service-page";

export const generateMetadata = () => serviceMetadata("gifts-delivery-merta-city");

export default function Page() {
  return <ServicePage slug="gifts-delivery-merta-city" />;
}

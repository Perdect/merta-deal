import { ServicePage, serviceMetadata } from "@/components/services/service-page";

export const generateMetadata = () => serviceMetadata("home-delivery-merta-city");

export default function Page() {
  return <ServicePage slug="home-delivery-merta-city" />;
}

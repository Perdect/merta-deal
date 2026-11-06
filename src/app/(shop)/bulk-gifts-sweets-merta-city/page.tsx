import { ServicePage, serviceMetadata } from "@/components/services/service-page";

export const generateMetadata = () => serviceMetadata("bulk-gifts-sweets-merta-city");

export default function Page() {
  return <ServicePage slug="bulk-gifts-sweets-merta-city" />;
}

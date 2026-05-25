import { Redirect } from "expo-router";
import { useInjector } from "@/context/InjectorContext";

export default function Index() {
  const { onboarded } = useInjector();
  return <Redirect href={onboarded ? "/home" : "/onboarding"} />;
}

import { redirect } from "next/navigation";

export default function ProductionPage(): never {
  redirect("/production/login");
}

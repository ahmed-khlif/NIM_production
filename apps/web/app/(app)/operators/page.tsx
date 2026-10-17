import { redirect } from "next/navigation";

export default function OperatorsPage(): React.ReactNode {
  redirect("/users?role=OPERATOR");
}

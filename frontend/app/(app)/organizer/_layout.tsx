import { Guard } from "../../../src/components/layout/Shell";
import { P } from "../../../src/constants/access";
export default function Layout() {
  return <Guard permissions={[P.concertsManage, P.concertsManageAll]} />;
}
